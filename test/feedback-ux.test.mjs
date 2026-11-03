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
        return { exitCode: script.every(s => s === 'ok') ? 0 : 1, signal: null, stdout: tapFor(script), stderr: '' }
      },
    },
  }
}

async function tempWorld() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-ux-'))
  const cfg = resolveConfig({
    defaultRuns: 3,
    maxRuns: 5,
    writeApproval: true,
    dataDir: path.join(dir, 'data'),
    quarantineFile: path.join(dir, '.flakefinder.json'),
  }, dir)
  return { dir, cfg, store: createStore(cfg.dataDir, cfg.quarantineFile) }
}

test('flaky_detect 摘要：带目标与下一步，稳定通过时提示 flaky_clear', async () => {
  const { dir, cfg, store } = await tempWorld()
  const { runner } = fakeRunner([['ok']])
  const detect = buildFlakeTools(cfg, runner, store).find(t => t.name === 'flaky_detect')
  const value = await detect.execute({ target: 'test/a.test.mjs', runs: 3 }, {})
  assert.equal(value.verdict, 'stable-pass')
  assert.match(value.summary, /目标：test\/a\.test\.mjs/)
  assert.match(value.summary, /下一步：/)
  assert.match(value.summary, /flaky_clear/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_detect 摘要：flaky 时提示先隔离', async () => {
  const { dir, cfg, store } = await tempWorld()
  const { runner } = fakeRunner([['ok', 'ok'], ['ok', 'not ok'], ['ok', 'ok']])
  const detect = buildFlakeTools(cfg, runner, store).find(t => t.name === 'flaky_detect')
  const value = await detect.execute({ target: 'test/a.test.mjs', runs: 3 }, {})
  assert.match(value.summary, /flaky_quarantine/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_report 渲染检测历史（以前只渲染隔离清单）', async () => {
  const { dir, cfg, store } = await tempWorld()
  const { runner } = fakeRunner([['ok']])
  const tools = buildFlakeTools(cfg, runner, store)
  await tools.find(t => t.name === 'flaky_detect').execute({ target: 'test/a.test.mjs', runs: 3 }, {})
  const report = tools.find(t => t.name === 'flaky_report')
  const value = await report.execute({}, {})
  const text = report.output.render({}, value)[0].text
  assert.match(text, /检测历史：1 条/)
  assert.match(text, /test\/a\.test\.mjs/)
  assert.match(text, /清单为空/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_history 空历史给出下一步', async () => {
  const { dir, cfg, store } = await tempWorld()
  const history = buildFlakeTools(cfg, { run: async () => ({ exitCode: 0, signal: null, stdout: '', stderr: '' }) }, store).find(t => t.name === 'flaky_history')
  const text = history.output.render({}, await history.execute({}, {}))[0].text
  assert.match(text, /历史记录 0 条/)
  assert.match(text, /flaky_detect/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_quarantine / flaky_clear 渲染带下一步与 0 条说明', async () => {
  const { dir, cfg, store } = await tempWorld()
  const tools = buildFlakeTools(cfg, { run: async () => ({ exitCode: 0, signal: null, stdout: '', stderr: '' }) }, store)
  const quarantine = tools.find(t => t.name === 'flaky_quarantine')
  const added = await quarantine.execute({ tests: ['a.test.mjs > t1'], reason: '定时器竞态' }, {})
  assert.match(quarantine.output.render({}, added)[0].text, /flaky_clear/)
  const again = await quarantine.execute({ tests: ['a.test.mjs > t1'], reason: '定时器竞态' }, {})
  assert.equal(again.addedCount, 0)
  assert.match(quarantine.output.render({}, again)[0].text, /未新增条目/)
  const clear = tools.find(t => t.name === 'flaky_clear')
  const none = await clear.execute({ tests: ['b.test.mjs > t9'] }, {})
  assert.equal(none.removedCount, 0)
  assert.match(clear.output.render({}, none)[0].text, /没有匹配条目/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_health 失败时给出下一步', async () => {
  const { dir, cfg, store } = await tempWorld()
  const failing = { run: async () => ({ exitCode: 1, signal: null, stdout: '', stderr: 'python: not found' }) }
  const health = buildFlakeTools(cfg, failing, store).find(t => t.name === 'flaky_health')
  const value = await health.execute({}, {})
  assert.equal(value.ok, false)
  const text = health.output.render({}, value)[0].text
  assert.match(text, /自检：发现问题/)
  assert.match(text, /下一步：/)
  await fs.rm(dir, { recursive: true, force: true })
})
