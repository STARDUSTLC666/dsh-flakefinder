import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aggregate, buildFlakeTools, createStore, executePlan, resolveConfig } from '../lib/index.js'

test('a passing report cannot hide an abnormal exit across TAP, JSON and JUnit', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flake-outcome-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  for (const [reportKind, body] of [
    ['tap', 'ok 1 - works\n1..1\n'],
    ['json', JSON.stringify({ success: true, testResults: [{ name: 'a', assertionResults: [{ title: 'works', status: 'passed' }] }] })],
    ['junit', '<testsuite><testcase classname="a" name="works"/></testsuite>'],
  ]) {
    const plan = { framework: reportKind === 'tap' ? 'node' : reportKind === 'json' ? 'vitest' : 'pytest', reportKind, reportPath: join(dir, 'report'), argv: ['fake'], label: 'fixture' }
    for (const [exitCode, signal] of [[1, null], [null, 'SIGKILL']]) {
      const runner = { async run() { if (reportKind !== 'tap') await writeFile(plan.reportPath, body); return { exitCode, signal, stdout: body, stderr: 'runner crashed' } } }
      const run = await executePlan(runner, plan, 1, 5000, dir)
      assert.equal(run.report.success, false, reportKind + ' must honor process failure')
      assert.equal(run.report.tests[0].status, 'passed', 'keep useful assertion results')
      assert.match(run.error, /runner crashed|SIGKILL/)
    }
  }
})

test('flaky_detect persists process failures instead of reporting stable-pass', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flake-false-pass-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const cfg = resolveConfig({ defaultRuns: 3, dataDir: join(dir, 'data'), quarantineFile: join(dir, '.flakefinder.json') }, dir)
  const store = createStore(cfg.dataDir, cfg.quarantineFile)
  for (const codes of [[1, 1, 1], [0, 1, 0]]) {
    let index = 0
    const runner = { async run() { return { exitCode: codes[index++], signal: null, stdout: 'ok 1 - works\n1..1\n', stderr: 'runner crashed' } } }
    const detect = buildFlakeTools(cfg, runner, store).find(t => t.name === 'flaky_detect')
    const result = await detect.execute({ target: 'fixture.test.mjs', framework: 'node', runs: 3 })
    assert.equal(result.verdict, codes[0] ? 'stable-fail' : 'flaky')
    assert.equal((await store.listHistory(undefined, 1))[0].verdict, result.verdict)
    assert.match(result.summary, /runner crashed/)
    if (!codes[0]) assert.equal(result.flakyCount, 1)
  }
})

test('process failures are not hidden by empty/skipped reports, and assertion failures remain intact', async () => {
  for (const stdout of ['ok 1 - deferred # SKIP\n1..1\n', '']) {
    const plan = { framework: 'node', reportKind: 'tap', reportPath: '', argv: ['fake'], label: 'fixture' }
    const runner = { async run() { return { exitCode: 1, signal: null, stdout, stderr: 'runner crashed' } } }
    const run = await executePlan(runner, plan, 1, 5000)
    const result = aggregate([run])
    assert.equal(result.verdict, 'stable-fail')
  }
  const plan = { framework: 'node', reportKind: 'tap', reportPath: '', argv: ['fake'], label: 'fixture' }
  const runner = { async run() { return { exitCode: 1, signal: null, stdout: 'not ok 1 - broken\n1..1\n', stderr: '' } } }
  const run = await executePlan(runner, plan, 1, 5000)
  assert.equal(run.report.failed, 1)
  assert.equal(run.error, undefined, 'expected assertion failure is not a separate crash')
})

test('truncated TAP output cannot masquerade as stable-pass', async () => {
  const plan = { framework: 'node', reportKind: 'tap', reportPath: '', argv: ['fake'], label: 'fixture', target: 'big.test.mjs' }
  const runner = {
    async run() {
      return { exitCode: 0, signal: null, stdout: 'TAP version 13\nok 1 - works\n1..1\n', stderr: '', truncated: true }
    },
  }
  const run = await executePlan(runner, plan, 1, 5000)
  assert.equal(run.truncated, true)
  assert.equal(run.report.success, false)
  assert.match(run.error ?? '', /截断/)
  const result = aggregate([run])
  assert.equal(result.verdict, 'stable-fail')
})

test('valid file-based JSON/JUnit reports remain stable-pass even when stdout/stderr exceeded 4MB', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'flake-file-trunc-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  for (const [reportKind, body] of [
    ['json', JSON.stringify({ success: true, testResults: [{ name: 'a.test.ts', assertionResults: [{ title: 'works', status: 'passed' }] }] })],
    ['junit', '<testsuite><testcase classname="a" name="works"/></testsuite>'],
  ]) {
    const reportPath = join(dir, 'ok.' + reportKind)
    const plan = { framework: reportKind === 'json' ? 'vitest' : 'pytest', reportKind, reportPath, argv: ['fake'], label: 'fixture' }
    const runner = {
      async run() {
        await writeFile(reportPath, body)
        return { exitCode: 0, signal: null, stdout: 'noisy logs...', stderr: '', truncated: true }
      },
    }
    const run = await executePlan(runner, plan, 1, 5000, dir)
    assert.equal(run.truncated, undefined)
    assert.equal(run.report.success, true)
    assert.equal(aggregate([run]).verdict, 'stable-pass')
  }
})
