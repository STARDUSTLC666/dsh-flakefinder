import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildFlakeTools } from '../lib/tools.js'
import { createStore } from '../lib/store.js'
import { resolveConfig } from '../lib/config.js'

function tapFor(rows) {
  return rows.map((row, i) => (row === 'ok' ? 'ok' : 'not ok') + ' ' + (i + 1) + ' - t' + (i + 1)).join('\n') + '\n1..' + rows.length + '\n'
}

function fakeRunner(scripts) {
  const calls = []
  return {
    calls,
    runner: {
      async run(argv) {
        calls.push(argv)
        const script = scripts[Math.min(calls.length - 1, scripts.length - 1)]
        const success = script.every(s => s === 'ok')
        return { exitCode: success ? 0 : 1, signal: null, stdout: tapFor(script), stderr: '' }
      },
    },
  }
}

async function tempWorld() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-tools-'))
  const cfg = resolveConfig({
    defaultRuns: 3,
    maxRuns: 5,
    writeApproval: true,
    dataDir: path.join(dir, 'data'),
    quarantineFile: path.join(dir, '.flakefinder.json'),
  }, dir)
  const store = createStore(cfg.dataDir, cfg.quarantineFile)
  return { dir, cfg, store }
}

test('flaky_detect 重复运行并判定 flaky 用例', async () => {
  const { dir, cfg, store } = await tempWorld()
  const { calls, runner } = fakeRunner([['ok', 'ok'], ['ok', 'not ok'], ['ok', 'ok']])
  const tools = buildFlakeTools(cfg, runner, store)
  const detect = tools.find(t => t.name === 'flaky_detect')
  assert.ok(detect)
  const value = await detect.execute({ target: 'test/a.test.mjs', runs: 3 }, {})
  assert.equal(value.framework, 'node')
  assert.equal(value.runs, 3)
  assert.equal(value.verdict, 'flaky')
  assert.equal(value.flakyCount, 1)
  assert.equal(value.stablePassCount, 1)
  assert.equal(calls.length, 3)
  assert.match(value.summary, /不稳定/)
  assert.equal((await store.listHistory(undefined, 10)).length, 1)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_history 支持目标过滤', async () => {
  const { dir, cfg, store } = await tempWorld()
  const { runner } = fakeRunner([['ok']])
  const tools = buildFlakeTools(cfg, runner, store)
  await tools.find(t => t.name === 'flaky_detect').execute({ target: 'x.test.mjs', runs: 3 }, {})
  const value = await tools.find(t => t.name === 'flaky_history').execute({ target: 'x.test', limit: 5 }, {})
  assert.equal(value.count, 1)
  assert.equal(value.entries[0].target, 'x.test.mjs')
  await fs.rm(dir, { recursive: true, force: true })
})

test('quarantine/clear 写清单，report 汇总', async () => {
  const { dir, cfg, store } = await tempWorld()
  const tools = buildFlakeTools(cfg, { run: async () => ({ exitCode: 0, signal: null, stdout: '', stderr: '' }) }, store)

  const quarantine = tools.find(t => t.name === 'flaky_quarantine')
  const added = await quarantine.execute({ tests: ['a.test.mjs > t2'], reason: '定时器竞态' }, {})
  assert.equal(added.addedCount, 1)

  const report = await tools.find(t => t.name === 'flaky_report').execute({}, {})
  assert.equal(report.quarantinedCount, 1)
  assert.match(report.quarantined[0].reason, /定时器竞态/)

  const cleared = await tools.find(t => t.name === 'flaky_clear').execute({ tests: ['a.test.mjs > t2'] }, {})
  assert.equal(cleared.removedCount, 1)
  const report2 = await tools.find(t => t.name === 'flaky_report').execute({}, {})
  assert.equal(report2.quarantinedCount, 0)

  const fileText = await fs.readFile(path.join(dir, '.flakefinder.json'), 'utf8')
  assert.ok(!fileText.includes('t2'))
  await fs.rm(dir, { recursive: true, force: true })
})

test('工具定义不再携带旧 gate 字段', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-gate-'))
  const cfg = resolveConfig({ writeApproval: false, dataDir: path.join(dir, 'data'), quarantineFile: path.join(dir, '.flakefinder.json') }, dir)
  const tools = buildFlakeTools(cfg, { run: async () => ({ exitCode: 0, signal: null, stdout: '', stderr: '' }) }, createStore(cfg.dataDir, cfg.quarantineFile))
  assert.ok(tools.every(tool => !('gate' in tool)))
  await fs.rm(dir, { recursive: true, force: true })
})
