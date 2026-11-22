import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregate,
  compactStack,
  confidenceUpperBound,
  errorFingerprint,
  flakyTests,
  normalizeErrorForFingerprint,
  patternLabel,
  redactSecrets,
  runsNeededForThreshold,
} from '../lib/classify.js'

function makeRun(index, tests, extra = {}) {
  const passed = tests.filter(t => t.status === 'passed').length
  const failed = tests.filter(t => t.status === 'failed').length
  const skipped = tests.filter(t => t.status === 'skipped').length
  return {
    index,
    durationMs: extra.durationMs ?? 50,
    seed: extra.seed,
    timedOut: extra.timedOut,
    truncated: extra.truncated,
    error: extra.error,
    report: {
      framework: 'vitest',
      success: extra.success ?? (failed === 0),
      total: tests.length,
      passed,
      failed,
      skipped,
      tests: tests.map(t => ({
        id: (t.file ?? 'spec.test.ts') + ' > ' + t.name,
        file: t.file ?? 'spec.test.ts',
        name: t.name,
        status: t.status,
        durationMs: t.durationMs ?? 10,
        ...(t.error !== undefined ? { error: t.error } : {}),
      })),
    },
  }
}

test('错误指纹归一化动态噪声（时间、UUID、十六进制地址、端口、临时路径、数字差异）', () => {
  const err1 = {
    type: 'AssertionError',
    message: '2026-11-22T10:15:30.123Z req 550e8400-e29b-41d4-a716-446655440000 at http://127.0.0.1:54321 failed reading /tmp/run-aaa/out.json after 5012ms (ptr 0x7fffa1b2 expected 100 got 102)',
  }
  const err2 = {
    type: 'AssertionError',
    message: '2026-11-22T10:19:44.987Z req 11111111-2222-3333-4444-555555555555 at http://127.0.0.1:61234 failed reading /tmp/run-zzz/other.json after 5099ms (ptr 0x7fff99ee expected 200 got 205)',
  }
  assert.equal(normalizeErrorForFingerprint(err1.message), normalizeErrorForFingerprint(err2.message))
  assert.equal(errorFingerprint(err1), errorFingerprint(err2))

  // Windows Temp 路径也能归为一簇
  const win1 = { message: 'ENOENT open C:\\Users\\alice\\AppData\\Local\\Temp\\flake-111\\a.json' }
  const win2 = { message: 'ENOENT open C:\\Users\\bob\\AppData\\Local\\Temp\\flake-999\\b.json' }
  assert.equal(errorFingerprint(win1), errorFingerprint(win2))

  // 不同根因错误产生不同指纹
  const errOther = { type: 'TypeError', message: 'Cannot read properties of undefined (reading id)' }
  assert.notEqual(errorFingerprint(err1), errorFingerprint(errOther))

  // 聚合后按频次降序聚类并保留 runIndices
  const result = aggregate([
    makeRun(1, [{ name: 'net', status: 'failed', error: { ...err1, stack: 'Error\n    at src/client.ts:10:5' } }]),
    makeRun(2, [{ name: 'net', status: 'passed' }]),
    makeRun(3, [{ name: 'net', status: 'failed', error: { ...err2, stack: 'Error\n    at src/client.ts:10:5' } }]),
    makeRun(4, [{ name: 'net', status: 'failed', error: errOther }]),
  ])
  const rec = result.tests[0]
  assert.equal(rec.errorClusters.length, 2)
  assert.equal(rec.errorClusters[0].count, 2)
  assert.deepEqual(rec.errorClusters[0].runIndices, [1, 3])
  assert.equal(rec.errorClusters[0].type, 'AssertionError')
  assert.ok(rec.errorClusters[0].sampleStack)
  assert.equal(rec.errorClusters[1].count, 1)
  assert.deepEqual(rec.errorClusters[1].runIndices, [4])
})

test('敏感凭据脱敏覆盖 Bearer/API Key/password/JWT/URL 凭据，且不误伤普通断言', () => {
  const raw = [
    'Auth failed: Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3OCJ9.signature123456',
    'key=sk-proj-abc1234567890XYZ password=mySuperSecret123 api_key="secret_val_99" {"password": "jsonSecret456"}',
    'ghp_1234567890abcdefghij1234567890 AKIAIOSFODNN7EXAMPLE',
    'postgres://admin:topsecret@db.internal:5432/app',
  ].join('\n')
  const safe = redactSecrets(raw)
  assert.ok(!safe.includes('signature123456'))
  assert.ok(!safe.includes('sk-proj-abc1234567890XYZ'))
  assert.ok(!safe.includes('mySuperSecret123'))
  assert.ok(!safe.includes('secret_val_99'))
  assert.ok(!safe.includes('jsonSecret456'))
  assert.ok(!safe.includes('ghp_1234567890abcdefghij1234567890'))
  assert.ok(!safe.includes('AKIAIOSFODNN7EXAMPLE'))
  assert.ok(!safe.includes('topsecret'))
  assert.match(safe, /<REDACTED/)

  // 不误伤普通断言消息
  const benign = 'AssertionError: password must not be empty; expected token count 3 to equal 4'
  assert.equal(redactSecrets(benign), benign)

  // aggregate 中的 errorClusters.message 与 sampleStack 均自动脱敏
  const result = aggregate([
    makeRun(1, [{ name: 'auth', status: 'passed' }]),
    makeRun(2, [{
      name: 'auth',
      status: 'failed',
      error: {
        type: 'Error',
        message: '401 Bearer secretTokenValue12345',
        stack: 'Error: 401 Bearer secretTokenValue12345\n    at callApi (src/api.ts:22:9) password=hunter2',
      },
    }]),
  ])
  const cluster = result.tests[0].errorClusters[0]
  assert.ok(!cluster.message.includes('secretTokenValue12345'))
  assert.ok(!cluster.sampleStack.includes('secretTokenValue12345'))
  assert.ok(!cluster.sampleStack.includes('hunter2'))
})

test('compactStack 保留头部与业务关键帧，限制行数 <=12 且字符数 <=1200', () => {
  const short = 'Error: boom\n    at src/foo.ts:12:3'
  assert.equal(compactStack(short), short)

  const deepLines = [
    '\x1B[31mError: connection reset\x1B[0m',
    '    at TCP.onStreamRead (node:internal/stream_base_commons:217:20)',
    ...Array.from({ length: 15 }, (_, i) => `    at internalStep${i} (node_modules/vitest/dist/runner.js:${i + 1}:1)`),
    '    at fetchOrder (src/order.ts:48:15)',
    '    at testCase (test/order.test.ts:19:9)',
    ...Array.from({ length: 10 }, (_, i) => `    at tick${i} (node:internal/process/task_queues:${i + 1}:5)`),
  ]
  const compacted = compactStack(deepLines.join('\n'))
  const outLines = compacted.split('\n')
  assert.ok(outLines.length <= 12, 'expected <=12 lines, got ' + outLines.length)
  assert.ok(compacted.length <= 1200)
  assert.ok(!compacted.includes('\x1B['))
  assert.ok(compacted.includes('Error: connection reset'))
  assert.ok(compacted.includes('src/order.ts:48:15'))
  assert.ok(compacted.includes('test/order.test.ts:19:9'))
  assert.match(compacted, /lines omitted/)

  // 超长单行也能截断在 1200 字符内
  const giant = 'Error: ' + 'x'.repeat(3000)
  const trimmed = compactStack(giant)
  assert.ok(trimmed.length <= 1200)
  assert.ok(trimmed.endsWith('…'))

  // Node 24 node:test TAP YAML 堆栈（无前导 "at "，含 node:async_hooks 与 node:internal/test_runner）优先保留业务帧
  const node24TapStack = [
    'Test.runInAsyncScope (node:async_hooks:227:14)',
    ...Array.from({ length: 14 }, (_, i) => `Test.run (node:internal/test_runner/test:${1000 + i}:25)`),
    'TestContext.<anonymous> (file:///e:/repo/test/a.test.mjs:5:40)',
    'verifyOrder (file:///e:/repo/src/order.mjs:18:12)',
  ].join('\n')
  const compactedTap = compactStack(node24TapStack)
  assert.ok(compactedTap.split('\n').length <= 12)
  assert.ok(compactedTap.includes('file:///e:/repo/test/a.test.mjs:5:40'))
  assert.ok(compactedTap.includes('file:///e:/repo/src/order.mjs:18:12'))
  assert.match(compactedTap, /lines omitted/)
})

test('根因模式识别：cold-start / state-leak / timeout-race / order-dependent / teardown-crash / intermittent', () => {
  // 1. cold-start: [F, P, P] (>=3 轮)
  const cold = aggregate([
    makeRun(1, [{ name: 't', status: 'failed' }]),
    makeRun(2, [{ name: 't', status: 'passed' }]),
    makeRun(3, [{ name: 't', status: 'passed' }]),
  ])
  assert.deepEqual(cold.tests[0].patterns, ['cold-start'])

  // 仅 2 轮 [F, P] 不足以判定 cold-start -> 兜底 intermittent
  const tooShortCold = aggregate([
    makeRun(1, [{ name: 't', status: 'failed' }]),
    makeRun(2, [{ name: 't', status: 'passed' }]),
  ])
  assert.deepEqual(tooShortCold.tests[0].patterns, ['intermittent'])

  // 2. state-leak: [P, P, F, F]
  const leak = aggregate([
    makeRun(1, [{ name: 't', status: 'passed' }]),
    makeRun(2, [{ name: 't', status: 'passed' }]),
    makeRun(3, [{ name: 't', status: 'failed' }]),
    makeRun(4, [{ name: 't', status: 'failed' }]),
  ])
  assert.deepEqual(leak.tests[0].patterns, ['state-leak'])

  // 仅 1 轮尾部失败 [P, P, F] 不构成 state-leak
  const singleTailFail = aggregate([
    makeRun(1, [{ name: 't', status: 'passed' }]),
    makeRun(2, [{ name: 't', status: 'passed' }]),
    makeRun(3, [{ name: 't', status: 'failed' }]),
  ])
  assert.deepEqual(singleTailFail.tests[0].patterns, ['intermittent'])

  // 3a. timeout-race via duration spike (>=1.8x 且 delta >=100ms)
  const slowRace = aggregate([
    makeRun(1, [{ name: 't', status: 'passed', durationMs: 80 }]),
    makeRun(2, [{ name: 't', status: 'failed', durationMs: 260 }]),
    makeRun(3, [{ name: 't', status: 'passed', durationMs: 120 }]),
  ])
  assert.deepEqual(slowRace.tests[0].patterns, ['timeout-race'])
  assert.equal(slowRace.tests[0].passDurationAvgMs, 100)
  assert.equal(slowRace.tests[0].failDurationAvgMs, 260)

  // 差值不足 100ms 不触发 timeout-race
  const smallDelta = aggregate([
    makeRun(1, [{ name: 't', status: 'passed', durationMs: 10 }]),
    makeRun(2, [{ name: 't', status: 'failed', durationMs: 60 }]),
    makeRun(3, [{ name: 't', status: 'passed', durationMs: 10 }]),
  ])
  assert.deepEqual(smallDelta.tests[0].patterns, ['intermittent'])

  // 3b. timeout-race via error message
  const msgTimeout = aggregate([
    makeRun(1, [{ name: 't', status: 'passed', durationMs: 10 }]),
    makeRun(2, [{ name: 't', status: 'failed', durationMs: 12, error: { message: 'Test timed out in 5000ms' } }]),
    makeRun(3, [{ name: 't', status: 'passed', durationMs: 10 }]),
  ])
  assert.deepEqual(msgTimeout.tests[0].patterns, ['timeout-race'])

  // 4. order-dependent: 互不相交的通过种子与失败种子
  const ordered = aggregate([
    makeRun(1, [{ name: 't', status: 'passed' }], { seed: 101 }),
    makeRun(2, [{ name: 't', status: 'failed' }], { seed: 202 }),
    makeRun(3, [{ name: 't', status: 'passed' }], { seed: 303 }),
    makeRun(4, [{ name: 't', status: 'failed' }], { seed: 404 }),
  ])
  assert.deepEqual(ordered.tests[0].patterns, ['order-dependent'])
  assert.deepEqual(ordered.tests[0].failedSeeds, [202, 404])

  // 相同种子既有通过又有失败 -> 不是纯顺序依赖
  const sameSeed = aggregate([
    makeRun(1, [{ name: 't', status: 'passed' }], { seed: 101 }),
    makeRun(2, [{ name: 't', status: 'failed' }], { seed: 101 }),
    makeRun(3, [{ name: 't', status: 'passed' }], { seed: 101 }),
  ])
  assert.deepEqual(sameSeed.tests[0].patterns, ['intermittent'])

  // 5. teardown-crash: 断言通过但进程异常退出
  const teardown = aggregate([
    makeRun(1, [{ name: 't', status: 'passed' }]),
    makeRun(2, [{ name: 't', status: 'passed' }], { success: false, error: '进程退出码 134' }),
    makeRun(3, [{ name: 't', status: 'passed' }]),
  ])
  const syn = teardown.tests.find(t => t.id === '(crash)')
  assert.ok(syn)
  assert.ok(syn.patterns.includes('teardown-crash'))

  // 6. 多模式共存：首轮超时失败，后续全过 -> cold-start + timeout-race
  const combo = aggregate([
    makeRun(1, [{ name: 't', status: 'failed', error: { message: 'Timeout exceeded' } }]),
    makeRun(2, [{ name: 't', status: 'passed' }]),
    makeRun(3, [{ name: 't', status: 'passed' }]),
  ])
  assert.deepEqual(combo.tests[0].patterns, ['cold-start', 'timeout-race'])

  // patternLabel 覆盖所有 6 种模式并返回非空中文说明
  for (const p of ['cold-start', 'state-leak', 'timeout-race', 'order-dependent', 'teardown-crash', 'intermittent']) {
    const label = patternLabel(p)
    assert.equal(typeof label, 'string')
    assert.ok(label.length >= 6)
  }
})

test('timeline 支持 P/F/S/T/- 且耗时统计包含 avg / max / p95', () => {
  const durations = Array.from({ length: 20 }, (_, i) => (i + 1) * 10)
  const runs = durations.map((d, i) => makeRun(i + 1, [{ name: 'perf', status: 'passed', durationMs: d }]))
  const perfRes = aggregate(runs)
  const perfTest = perfRes.tests[0]
  assert.equal(perfTest.passDurationAvgMs, 105)
  assert.equal(perfTest.failDurationAvgMs, null)
  assert.equal(perfTest.maxDurationMs, 200)
  // 20 个值 [10..200] 的 95 分位为第 19 个值 = 190
  assert.equal(perfTest.p95DurationMs, 190)

  // 乱序输入也能按 runIndex 生成正确 timeline，含 P/F/S/T/-
  const mixed = aggregate([
    makeRun(5, []), // 缺席 '-'
    { index: 4, report: null, durationMs: 5000, timedOut: true, error: '超时' }, // 'T'
    makeRun(2, [{ name: 'case', status: 'failed', durationMs: 30 }]), // 'F'
    makeRun(3, [{ name: 'case', status: 'skipped', durationMs: 0 }]), // 'S'
    makeRun(1, [{ name: 'case', status: 'passed', durationMs: 10 }]), // 'P'
  ])
  const target = mixed.tests.find(t => t.name === 'case')
  assert.ok(target)
  assert.deepEqual(target.timeline, ['P', 'F', 'S', 'T', '-'])
})

test('统计置信度助手 confidenceUpperBound 与 runsNeededForThreshold', () => {
  assert.equal(confidenceUpperBound(1), 95)
  assert.equal(confidenceUpperBound(5), 45.1)
  assert.equal(confidenceUpperBound(10), 25.9)
  assert.equal(confidenceUpperBound(29), 9.8)
  assert.equal(confidenceUpperBound(59), 5)
  assert.equal(confidenceUpperBound(0), 100)

  // 百分比与比例两种入参均支持
  assert.equal(runsNeededForThreshold(5), 59)
  assert.equal(runsNeededForThreshold(0.05), 59)
  assert.equal(runsNeededForThreshold(10), 29)
  assert.equal(runsNeededForThreshold(0.1), 29)
  assert.equal(runsNeededForThreshold(1), 299)
  assert.equal(runsNeededForThreshold(0.01), 299)
  assert.throws(() => runsNeededForThreshold(0), /必须大于 0/)
  assert.throws(() => runsNeededForThreshold(5, 1), /必须在/)
})

test('flakyTests 输出保持精简（附带 patterns 与 topError，不含大堆栈）', () => {
  const result = aggregate([
    makeRun(1, [{ name: 't1', status: 'failed', error: { type: 'AssertionError', message: 'expected 1 to be 2', stack: 'AssertionError\n' + '    at line\n'.repeat(20) } }]),
    makeRun(2, [{ name: 't1', status: 'passed' }]),
    makeRun(3, [{ name: 't1', status: 'passed' }]),
  ])
  const list = flakyTests(result)
  assert.equal(list.length, 1)
  assert.equal(list[0].file, 'spec.test.ts')
  assert.equal(list[0].name, 't1')
  assert.equal(list[0].failureRate, 33.3)
  assert.deepEqual(list[0].patterns, ['cold-start'])
  assert.equal(list[0].topError, 'AssertionError: expected 1 to be 2')
  assert.equal('sampleStack' in list[0], false)
  assert.equal('errorClusters' in list[0], false)
})
