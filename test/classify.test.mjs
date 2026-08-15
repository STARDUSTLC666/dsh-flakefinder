import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, flakyTests } from '../lib/classify.js'

function run(index, success, statuses) {
  return {
    index,
    durationMs: 10,
    error: undefined,
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
})

test('五轮全挂判定 stable-fail', () => {
  const result = aggregate([1, 2, 3].map(i => run(i, false, ['failed', 'failed'])))
  assert.equal(result.verdict, 'stable-fail')
  assert.equal(result.stableFailCount, 2)
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
})

test('没有任何报告时抛中文错误', () => {
  assert.throws(() => aggregate([{ index: 1, report: null, durationMs: 1, error: '报告缺失' }]), /没有一次运行产出/)
})
