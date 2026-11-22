import test from 'node:test'
import assert from 'node:assert/strict'
import { parseJsonReport, parseJunitReport, parseTapReport } from '../lib/parse.js'

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

test('TAP SKIP 指令归类为跳过', () => {
  const run = parseTapReport('TAP version 13\nok 1 - alpha # SKIP slow\nok 2 - beta\n1..2\n')
  assert.equal(run.success, true)
  assert.equal(run.passed, 1)
  assert.equal(run.failed, 0)
  assert.equal(run.skipped, 1)
  assert.equal(run.tests[0].name, 'alpha')
  assert.equal(run.tests[0].status, 'skipped')
})

test('空 TAP 不算成功', () => {
  const run = parseTapReport('')
  assert.equal(run.success, false)
  assert.equal(run.total, 0)
})

test('parseJsonReport 规范化路径、提取错误详情与消歧重复 ID', () => {
  const raw = JSON.stringify({
    success: false,
    testResults: [
      {
        name: 'C:\\repo\\src\\math.test.ts',
        assertionResults: [
          {
            fullName: 'math > adds',
            status: 'failed',
            duration: 4,
            failureMessages: ['\x1b[31mAssertionError: expected 1 to be 2\x1b[39m\n    at src/math.test.ts:10:5'],
          },
          {
            fullName: 'math > adds',
            status: 'failed',
            duration: 5,
            failureMessages: ['TypeError: cannot read x\n    at src/math.test.ts:14:9'],
          },
          {
            fullName: 'math > slow',
            status: 'failed',
            duration: 5000,
            failureMessages: ['Error: Test timed out in 5000ms\n    at timeout'],
          },
        ],
      },
      {
        name: 'C:\\repo\\src\\broken.test.ts',
        status: 'failed',
        message: 'SyntaxError: Unexpected token\n    at importModule',
      },
    ],
  })
  const run = parseJsonReport(raw, 'vitest', 'C:\\repo')
  assert.equal(run.tests[0].file, 'src/math.test.ts')
  assert.equal(run.tests[0].id, 'src/math.test.ts > math > adds')
  assert.deepEqual(run.tests[0].error, {
    type: 'AssertionError',
    message: 'AssertionError: expected 1 to be 2',
    stack: 'at src/math.test.ts:10:5',
  })
  assert.equal(run.tests[1].id, 'src/math.test.ts > math > adds #2')
  assert.equal(run.tests[1].error?.type, 'TypeError')
  assert.equal(run.tests[2].error?.type, 'TimeoutError')

  assert.equal(run.tests[3].file, 'src/broken.test.ts')
  assert.equal(run.tests[3].name, '(suite)')
  assert.equal(run.tests[3].error?.type, 'SyntaxError')
  assert.match(run.tests[3].error?.stack ?? '', /importModule/)
})

test('parseJunitReport 校验非法 XML、支持单引号、file 属性、CDATA 与 system-err 回退', () => {
  assert.throws(() => parseJunitReport(''), /JUnit XML/)
  assert.throws(() => parseJunitReport('<html>not junit</html>'), /JUnit XML/)
  assert.throws(() => parseJunitReport('<testsuite><testcase name="a"><failure>eof'), /不完整|截断/)
  assert.throws(() => parseJunitReport('<testsuite><testcase name="a"/><testcase name="b"><failure>eof</testsuite>'), /未闭合/)
  assert.throws(() => parseJunitReport('<testcase name="a"><failure>eof'), /未闭合/)

  // 非法超范围数字字符实体不应触发 RangeError
  const weirdEntity = parseJunitReport('<testsuite><testcase classname="suite" name="x&#x99999999;y"/></testsuite>')
  assert.equal(weirdEntity.tests[0].name, 'x&#x99999999;y')

  const xml = `<?xml version="1.0"?>
<testsuites>
  <testsuite name='pytest'>
    <testcase file='C:\\repo\\tests\\test_auth.py' classname='tests.test_auth' name='test_login' time='0.2'>
      <failure type='AssertionError' message='assert 401 == 200'><![CDATA[def test_login():\n> assert 401 == 200 & True]]></failure>
    </testcase>
    <testcase file='C:\\repo\\tests\\test_auth.py' classname='tests.test_auth' name='test_login' time='0.3'>
      <error type='RuntimeError' message='db lost'/><system-err>stderr traceback line</system-err>
    </testcase>
  </testsuite>
</testsuites>`
  const run = parseJunitReport(xml, 'C:\\repo')
  assert.equal(run.total, 2)
  assert.equal(run.failed, 2)
  assert.equal(run.tests[0].file, 'tests/test_auth.py')
  assert.equal(run.tests[0].id, 'tests/test_auth.py > test_login')
  assert.deepEqual(run.tests[0].error, {
    type: 'AssertionError',
    message: 'assert 401 == 200',
    stack: 'def test_login():\n> assert 401 == 200 & True',
  })
  assert.equal(run.tests[1].id, 'tests/test_auth.py > test_login #2')
  assert.deepEqual(run.tests[1].error, {
    type: 'RuntimeError',
    message: 'db lost',
    stack: 'stderr traceback line',
  })
})
