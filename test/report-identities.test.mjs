import test from 'node:test'
import assert from 'node:assert/strict'
import { parseJunitReport, parseTapReport } from '../lib/parse.js'

test('JUnit mixed empty and paired testcase nodes preserve each result identity and millisecond duration', () => {
  const report = parseJunitReport('<testsuite><testcase classname="suite" name="pass" time="0.125"/><testcase classname="suite" name="fail" time="0.25"><failure message="boom"/></testcase><testcase classname="suite" name="skip"><skipped/></testcase><testcase classname="suite" name="last" time="1.5"/></testsuite>')
  assert.deepEqual(report.tests.map(({ name, status, durationMs }) => ({ name, status, durationMs })), [
    { name: 'pass', status: 'passed', durationMs: 125 },
    { name: 'fail', status: 'failed', durationMs: 250 },
    { name: 'skip', status: 'skipped', durationMs: 0 },
    { name: 'last', status: 'passed', durationMs: 1500 },
  ])
})

test('TAP emits only leaf cases without double-counting parents, treats TODO as skipped, and keeps IDs order-independent', () => {
  const report = parseTapReport('TAP version 13\n# Subtest: parent\n    ok 1 - child\n    1..1\nok 1 - parent\nnot ok 2 - unfinished # TODO\n1..2\n')
  assert.deepEqual(report.tests.map(({ name, status }) => ({ name, status })), [
    { name: 'parent > child', status: 'passed' },
    { name: 'unfinished', status: 'skipped' },
  ])
  assert.equal(report.total, 2)
  assert.equal(report.success, true)
  assert.ok(report.tests.every(item => !item.id.startsWith('node:')), 'IDs must not include sequential node:<index> counters')
})
