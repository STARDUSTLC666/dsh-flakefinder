import test from 'node:test'
import assert from 'node:assert/strict'
import { parseJsonReport, parseTapReport } from '../lib/parse.js'

const VITEST = JSON.stringify({
  success: false,
  numTotalTests: 3,
  numPassedTests: 2,
  numFailedTests: 1,
  numPendingTests: 0,
  testResults: [
    {
      name: 'C:/repo/src/a.test.ts',
      assertionResults: [
        { fullName: 'a > ok', status: 'passed', duration: 1 },
        { fullName: 'a > bad', status: 'failed', duration: 2 },
        { fullName: 'a > maybe', status: 'passed', duration: 3 },
      ],
    },
  ],
})

test('解析 vitest JSON 报告', () => {
  const run = parseJsonReport(VITEST, 'vitest')
  assert.equal(run.success, false)
  assert.equal(run.total, 3)
  assert.equal(run.passed, 2)
  assert.equal(run.failed, 1)
  assert.equal(run.tests.length, 3)
  assert.equal(run.tests[1].status, 'failed')
})

test('缺断言数组时回退到套件状态', () => {
  const run = parseJsonReport(JSON.stringify({ success: true, testResults: [{ name: 'x.test.js', status: 'passed' }] }), 'jest')
  assert.equal(run.total, 1)
  assert.equal(run.passed, 1)
})

test('JSON 损坏抛中文错误', () => {
  assert.throws(() => parseJsonReport('{bad', 'vitest'), /不是合法 JSON/)
})

test('缺统计字段时从用例列表回填', () => {
  const run = parseJsonReport(JSON.stringify({
    success: true,
    testResults: [{ name: 'a.test.js', assertionResults: [{ title: 't1', status: 'passed' }, { title: 't2', status: 'skipped' }] }],
  }), 'jest')
  assert.equal(run.total, 2)
  assert.equal(run.passed, 1)
  assert.equal(run.failed, 0)
  assert.equal(run.skipped, 1)
})

test('解析 node:test 的 TAP 输出', () => {
  const run = parseTapReport('TAP version 13\nnot ok 1 - alpha\nok 2 - beta\n1..2\n')
  assert.equal(run.success, false)
  assert.equal(run.total, 2)
  assert.equal(run.passed, 1)
  assert.equal(run.failed, 1)
  assert.equal(run.tests[0].name, 'alpha')
})

test('空 TAP 不算成功', () => {
  const run = parseTapReport('')
  assert.equal(run.success, false)
  assert.equal(run.total, 0)
})
