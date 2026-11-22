import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { parseTapReport } from '../lib/parse.js'

const execFileAsync = promisify(execFile)

test('TAP 13 层级嵌套 describe/it 仅输出叶节点且不重复计数', () => {
  const tap = `TAP version 13
# Subtest: math
    # Subtest: arithmetic
        # Subtest: adds
        ok 1 - adds
          ---
          duration_ms: 1.25
          type: 'test'
          ...
        # Subtest: divides
        not ok 2 - divides
          ---
          duration_ms: 2.5
          type: 'test'
          failureType: 'testCodeFailure'
          name: 'AssertionError'
          error: |-
            Expected values to be strictly equal:
            
            ok 99 - fake line inside error
            2 !== 3
          expected: 3
          actual: 2
          stack: |-
            TestContext.<anonymous> (file:///repo/test/math.test.mjs:10:5)
            Test.run (node:internal/test_runner/test:100:1)
          ...
        1..2
    not ok 1 - arithmetic
      ---
      duration_ms: 4.1
      type: 'suite'
      failureType: 'subtestsFailed'
      error: '1 subtest failed'
      ...
    1..1
not ok 1 - math
  ---
  duration_ms: 5.0
  type: 'suite'
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  ...
1..1
`
  const report = parseTapReport(tap, { cwd: '/repo', target: 'test/math.test.mjs' })
  assert.equal(report.total, 2)
  assert.equal(report.passed, 1)
  assert.equal(report.failed, 1)
  assert.equal(report.success, false)
  assert.deepEqual(report.tests.map(t => ({ id: t.id, file: t.file, name: t.name, status: t.status, durationMs: t.durationMs })), [
    {
      id: 'test/math.test.mjs > math > arithmetic > adds',
      file: 'test/math.test.mjs',
      name: 'math > arithmetic > adds',
      status: 'passed',
      durationMs: 1.25,
    },
    {
      id: 'test/math.test.mjs > math > arithmetic > divides',
      file: 'test/math.test.mjs',
      name: 'math > arithmetic > divides',
      status: 'failed',
      durationMs: 2.5,
    },
  ])
  assert.equal(report.tests[0].error, undefined)
  assert.equal(report.tests[1].error?.type, 'AssertionError')
  assert.match(report.tests[1].error?.message ?? '', /2 !== 3/)
  assert.match(report.tests[1].error?.message ?? '', /expected: 3, actual: 2/)
  assert.match(report.tests[1].error?.stack ?? '', /math\.test\.mjs:10:5/)
})

test('TAP 13 跨并行运行 ID 稳定，且同运行重名用例消歧为 #2', () => {
  const runA = parseTapReport('TAP version 13\nok 1 - alpha\nnot ok 2 - beta\nok 3 - alpha\n1..3\n', { target: 'test/order.test.mjs' })
  const runB = parseTapReport('TAP version 13\nnot ok 1 - beta\nok 2 - alpha\nok 3 - alpha\n1..3\n', { target: 'test/order.test.mjs' })
  const idsA = runA.tests.map(t => t.id).sort()
  const idsB = runB.tests.map(t => t.id).sort()
  assert.deepEqual(idsA, idsB)
  assert.deepEqual(idsA, [
    'test/order.test.mjs > alpha',
    'test/order.test.mjs > alpha #2',
    'test/order.test.mjs > beta',
  ])
})

test('TAP 13 多文件顶层 Subtest 自动提取规范化文件路径', () => {
  const tap = `TAP version 13
# Subtest: C:\\repo\\test\\a.test.mjs
    # Subtest: works
    ok 1 - works
      ---
      duration_ms: 0.5
      ...
    1..1
ok 1 - C:\\repo\\test\\a.test.mjs
# Subtest: C:\\repo\\test\\b.test.mjs
    # Subtest: suite
        ok 1 - fails
          ---
          duration_ms: 1.0
          ...
        1..1
    ok 1 - suite
    1..1
ok 2 - C:\\repo\\test\\b.test.mjs
1..2
`
  const report = parseTapReport(tap, { cwd: 'C:\\repo', target: 'test' })
  assert.deepEqual(report.tests.map(t => ({ id: t.id, file: t.file, name: t.name })), [
    { id: 'test/a.test.mjs > works', file: 'test/a.test.mjs', name: 'works' },
    { id: 'test/b.test.mjs > suite > fails', file: 'test/b.test.mjs', name: 'suite > fails' },
  ])
})

test('TAP 13 父套件 after hook 失败时不被子测试全过掩盖', () => {
  const tap = `TAP version 13
# Subtest: suite
    # Subtest: child
    ok 1 - child
      ---
      duration_ms: 1.0
      ...
    1..1
not ok 1 - suite
  ---
  duration_ms: 2.0
  type: 'suite'
  failureType: 'hookFailed'
  error: 'after hook exploded'
  ...
1..1
`
  const report = parseTapReport(tap, { target: 'test/hook.test.mjs' })
  assert.equal(report.success, false)
  assert.equal(report.passed, 1)
  assert.equal(report.failed, 1)
  assert.equal(report.tests[1].name, 'suite > (hook)')
  assert.equal(report.tests[1].error?.type, 'hookFailed')
  assert.match(report.tests[1].error?.message ?? '', /after hook exploded/)
})

test('TAP Bail out! 产生失败结果', () => {
  const report = parseTapReport('TAP version 13\nok 1 - a\nBail out! fatal db error\n')
  assert.equal(report.success, false)
  assert.equal(report.failed, 1)
  assert.match(report.tests[1].error?.message ?? '', /fatal db error/)
})

test('真实 node --test --test-reporter=tap 端到端解析', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-real-tap-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'sample.test.mjs')
  await fs.writeFile(file, [
    "import { describe, it, test } from 'node:test'",
    "import assert from 'node:assert/strict'",
    "describe('calc', () => {",
    "  it('passes', () => assert.equal(2 + 2, 4))",
    "  it('fails', () => assert.equal(2 + 2, 5))",
    '})',
    "test('skipped', { skip: 'later' }, () => {})",
  ].join('\n'), 'utf8')

  const childEnv = { ...process.env }
  delete childEnv.NODE_TEST_CONTEXT

  let stdout = ''
  try {
    const res = await execFileAsync(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: dir, env: childEnv })
    stdout = res.stdout
  } catch (err) {
    stdout = err.stdout ?? ''
  }

  const report = parseTapReport(stdout, { cwd: dir, target: 'sample.test.mjs' })
  assert.equal(report.success, false)
  assert.equal(report.total, 3)
  assert.equal(report.passed, 1)
  assert.equal(report.failed, 1)
  assert.equal(report.skipped, 1)
  const failedCase = report.tests.find(item => item.status === 'failed')
  assert.ok(failedCase)
  assert.equal(failedCase.id, 'sample.test.mjs > calc > fails')
  assert.equal(failedCase.error?.type, 'AssertionError')
  assert.ok(failedCase.durationMs >= 0)
  assert.match(failedCase.error?.stack ?? '', /sample\.test\.mjs/)
})
