import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildPlan, readFramework } from '../lib/args.js'
import { parseJunitReport } from '../lib/parse.js'

test('readFramework 支持 pytest', () => {
  assert.equal(readFramework('pytest'), 'pytest')
  assert.throws(() => readFramework('rspec'), /framework/)
})

test('buildPlan 在 pyproject 配置下自动选择 pytest', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-pytest-'))
  await fs.writeFile(path.join(dir, 'pyproject.toml'), '[tool.pytest.ini_options]\naddopts = "-q"\n')
  const plan = buildPlan(dir, 'tests/test_x.py', 'auto', 1, 'python3')
  assert.equal(plan.framework, 'pytest')
  assert.equal(plan.reportKind, 'junit')
  assert.deepEqual(plan.argv, ['python3', '-m', 'pytest', 'tests/test_x.py', '-q', '--junitxml=' + plan.reportPath])
  await fs.rm(dir, { recursive: true, force: true })
})

test('buildPlan 在 setup.cfg 配置下自动选择 pytest', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-pytest-setupcfg-'))
  await fs.writeFile(path.join(dir, 'setup.cfg'), '[tool:pytest]\naddopts = -q\n')
  const plan = buildPlan(dir, 'tests/test_x.py', 'auto', 1, 'python3')
  assert.equal(plan.framework, 'pytest')
  assert.equal(plan.reportKind, 'junit')
  await fs.rm(dir, { recursive: true, force: true })
})

test('parseJunitReport 解析通过/失败/跳过', () => {
  const xml = '<?xml version="1.0"?><testsuite name="pytest" errors="0" failures="1" skipped="1" tests="3"><testcase classname="tests.test_x" name="test_ok" time="0.1"/><testcase classname="tests.test_x" name="test_bad" time="0.2"><failure message="boom"/></testcase><testcase classname="tests.test_x" name="test_skip" time="0"><skipped type="pytest.skip" message="skip"/></testcase></testsuite>'
  const run = parseJunitReport(xml)
  assert.equal(run.framework, 'pytest')
  assert.equal(run.total, 3)
  assert.equal(run.passed, 1)
  assert.equal(run.failed, 1)
  assert.equal(run.skipped, 1)
  assert.equal(run.success, false)
})
