import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, flakyTests } from '../lib/classify.js'

function run(index, success, statuses, extra = {}) {
  return {
    index,
    durationMs: extra.durationMs ?? 10,
    error: extra.error,
    timedOut: extra.timedOut,
    truncated: extra.truncated,
    seed: extra.seed,
    report: {
      framework: 'node',
      success,
      total: statuses.length,
      passed: statuses.filter(s => s === 'passed').length,
      failed: statuses.filter(s => s === 'failed').length,
      skipped: statuses.filter(s => s === 'skipped').length,
      tests: statuses.map((status, i) => ({ id: 'a.test.js > t' + i, file: 'a.test.js', name: 't' + i, status, durationMs: 1 })),
    },
  }
}

test('五轮全过判定 stable-pass', () => {
  const result = aggregate([1, 2, 3, 4, 5].map(i => run(i, true, ['passed', 'passed'])))
  assert.equal(result.verdict, 'stable-pass')
  assert.equal(result.stablePassCount, 2)
  assert.equal(result.flakyCount, 0)
  assert.equal(result.confidence95MaxFlakeRate, 45.1)
})

test('五轮全挂判定 stable-fail', () => {
  const result = aggregate([1, 2, 3].map(i => run(i, false, ['failed', 'failed'])))
  assert.equal(result.verdict, 'stable-fail')
  assert.equal(result.stableFailCount, 2)
  assert.equal(result.confidence95MaxFlakeRate, undefined)
})

test('时好时坏判定 flaky 并计算失败率', () => {
  const result = aggregate([
    run(1, true, ['passed', 'failed']),
    run(2, false, ['failed', 'failed']),
    run(3, true, ['passed', 'passed']),
  ])
  assert.equal(result.verdict, 'flaky')
  assert.equal(result.flakyCount, 2)
  const flaky = flakyTests(result)
  const second = flaky.find(item => item.name === 't1')
  assert.ok(second)
  assert.equal(second.failureRate, 66.7)
})

test('全部跳过判定 skipped', () => {
  const result = aggregate([run(1, true, ['skipped']), run(2, true, ['skipped'])])
  assert.equal(result.verdict, 'skipped')
  assert.equal(result.confidence95MaxFlakeRate, undefined)
})

test('没有任何报告时抛中文错误', () => {
  assert.throws(() => aggregate([{ index: 1, report: null, durationMs: 1, error: '报告缺失' }]), /没有一次运行产出/)
})

test('P0 修复：1 个稳定失败 + 1 个 flaky（passRuns=0）必须判定为 flaky', () => {
  const result = aggregate([
    run(1, false, ['failed', 'passed']),
    run(2, false, ['failed', 'failed']),
    run(3, false, ['failed', 'passed']),
  ])
  assert.equal(result.runs.filter(r => r.success).length, 0)
  assert.equal(result.verdict, 'flaky')
  assert.equal(result.flakyCount, 1)
  assert.equal(result.stableFailCount, 1)
  assert.equal(result.tests[0].name, 't1')
  assert.equal(result.tests[0].verdict, 'flaky')
  assert.equal(result.tests[1].name, 't0')
  assert.equal(result.tests[1].verdict, 'stable-fail')
})

test('P0 修复：不同轮次交替失败不同用例（passRuns=0）必须判定为 flaky', () => {
  const result = aggregate([
    run(1, false, ['failed', 'passed']),
    run(2, false, ['passed', 'failed']),
  ])
  assert.equal(result.runs.filter(r => r.success).length, 0)
  assert.equal(result.verdict, 'flaky')
  assert.equal(result.flakyCount, 2)
  assert.equal(result.stableFailCount, 0)
})

test('部分轮次超时产生准确失败率的合成 (timeout) 记录而非硬编码 100%', () => {
  const result = aggregate([
    run(1, true, ['passed'], { durationMs: 20 }),
    { index: 2, report: null, durationMs: 30000, timedOut: true, error: '单轮测试超时（30000ms）' },
    run(3, true, ['passed'], { durationMs: 25 }),
  ])
  assert.equal(result.verdict, 'flaky')
  assert.equal(result.flakyCount, 1)
  assert.equal(result.stablePassCount, 1)
  const syn = result.tests.find(t => t.id === '(timeout)')
  assert.ok(syn)
  assert.equal(syn.passes, 2)
  assert.equal(syn.failures, 1)
  assert.equal(syn.failureRate, 33.3)
  assert.equal(syn.verdict, 'flaky')
  assert.deepEqual(syn.timeline, ['P', 'T', 'P'])
  assert.ok(syn.patterns.includes('timeout-race'))
  const real = result.tests.find(t => t.name === 't0')
  assert.ok(real)
  assert.deepEqual(real.timeline, ['P', 'T', 'P'])
  assert.equal(result.runs[1].timedOut, true)
  assert.equal(result.runs[1].success, false)
})

test('部分轮次无报告崩溃产生准确失败率的合成 (crash) 记录', () => {
  const result = aggregate([
    run(1, true, ['passed']),
    { index: 2, report: null, durationMs: 50, error: '进程退出码 139' },
    run(3, true, ['passed']),
  ])
  assert.equal(result.verdict, 'flaky')
  const syn = result.tests.find(t => t.id === '(crash)')
  assert.ok(syn)
  assert.equal(syn.passes, 2)
  assert.equal(syn.failures, 1)
  assert.equal(syn.failureRate, 33.3)
  assert.deepEqual(syn.timeline, ['P', 'F', 'P'])
})

test('断言全过后进程异常退出标记 teardown-crash 且失败率准确', () => {
  const result = aggregate([
    run(1, true, ['passed']),
    run(2, false, ['passed'], { error: '测试进程异常结束（退出码 1）' }),
    run(3, true, ['passed']),
  ])
  assert.equal(result.verdict, 'flaky')
  const syn = result.tests.find(t => t.id === '(crash)')
  assert.ok(syn)
  assert.equal(syn.passes, 2)
  assert.equal(syn.failures, 1)
  assert.equal(syn.failureRate, 33.3)
  assert.ok(syn.patterns.includes('teardown-crash'))
})

test('按风险优先排序：flaky（失败率降序）→ stable-fail → skipped → stable-pass', () => {
  const result = aggregate([
    run(1, false, ['passed', 'skipped', 'failed', 'failed', 'passed']),
    run(2, false, ['passed', 'skipped', 'failed', 'failed', 'failed']),
    run(3, false, ['passed', 'skipped', 'failed', 'passed', 'passed']),
  ])
  // t0: stable-pass, t1: skipped, t2: stable-fail (100%), t3: flaky (66.7%), t4: flaky (33.3%)
  assert.deepEqual(
    result.tests.map(t => `${t.name}:${t.verdict}:${t.failureRate}`),
    [
      't3:flaky:66.7',
      't4:flaky:33.3',
      't2:stable-fail:100',
      't1:skipped:0',
      't0:stable-pass:0',
    ],
  )
})

test('空报告且无执行错误时判定 empty', () => {
  const result = aggregate([
    {
      index: 1,
      durationMs: 5,
      report: { framework: 'node', success: false, total: 0, passed: 0, failed: 0, skipped: 0, tests: [] },
    },
  ])
  assert.equal(result.verdict, 'empty')
  assert.equal(result.tests.length, 0)
})

test('RunRecord 保留 timedOut / truncated / seed / error 并按 runIndex 排序', () => {
  const result = aggregate([
    run(3, true, ['passed'], { seed: 303 }),
    run(1, false, ['failed'], { seed: 101, truncated: true, error: '输出截断 Bearer superSecretToken12345' }),
    run(2, true, ['passed'], { seed: 202 }),
  ])
  assert.deepEqual(result.runs.map(r => r.runIndex), [1, 2, 3])
  assert.equal(result.runs[0].seed, 101)
  assert.equal(result.runs[0].truncated, true)
  assert.ok(!result.runs[0].error.includes('superSecretToken12345'))
  assert.match(result.runs[0].error, /<REDACTED>/)
  assert.equal(result.runs[1].seed, 202)
  assert.equal(result.runs[2].seed, 303)
})

test('截断 TAP 输出（passed>0, truncated=true）不会误标 teardown-crash', () => {
  const result = aggregate([
    run(1, true, ['passed']),
    run(2, false, ['passed'], { truncated: true, error: 'TAP 输出超过 4 MiB 被截断' }),
    run(3, true, ['passed']),
  ])
  assert.equal(result.verdict, 'flaky')
  const syn = result.tests.find(t => t.id === '(crash)')
  assert.ok(syn)
  assert.ok(!syn.patterns.includes('teardown-crash'))
  assert.deepEqual(syn.patterns, ['intermittent'])
})

test('全轮无报告抛错时也脱敏首个错误里的凭据', () => {
  assert.throws(
    () => aggregate([{ index: 1, report: null, durationMs: 1, error: 'stderr: postgres://u:topsecret@host/db' }]),
    err => /没有一次运行产出/.test(err.message) && !err.message.includes('topsecret') && err.message.includes('<REDACTED>'),
  )
})
