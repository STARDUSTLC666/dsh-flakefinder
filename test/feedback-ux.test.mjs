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

async function tempWorld(overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-ux-'))
  const cfg = resolveConfig({
    defaultRuns: 3,
    maxRuns: 10,
    writeApproval: true,
    dataDir: path.join(dir, 'data'),
    quarantineFile: path.join(dir, '.flakefinder.json'),
    ...overrides,
  }, dir)
  return { dir, cfg, store: createStore(cfg.dataDir, cfg.quarantineFile) }
}

test('flaky_detect 摘要：带目标、置信度提示与下一步，稳定通过时提示 flaky_clear', async () => {
  const { dir, cfg, store } = await tempWorld()
  const { runner } = fakeRunner([['ok']])
  const detect = buildFlakeTools(cfg, runner, store).find(t => t.name === 'flaky_detect')
  const value = await detect.execute({ target: 'test/a.test.mjs', runs: 3 }, {})
  assert.equal(value.verdict, 'stable-pass')
  assert.equal(typeof value.confidence95MaxFlakeRate, 'number')
  assert.match(value.summary, /目标：test\/a\.test\.mjs/)
  assert.match(value.summary, /95% 置信下残余偶发率/)
  assert.match(value.summary, /建议提高 runs/)
  assert.match(value.summary, /下一步：/)
  assert.match(value.summary, /flaky_clear/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_detect 摘要：flaky 时展示时间线、模式、隔离状态标签、错误聚类并提示先隔离', async () => {
  const { dir, cfg, store } = await tempWorld()
  await store.addQuarantine([{ file: 'test/a.test.mjs', name: 't1' }], '已知偶发')
  const tapScripts = [
    'TAP version 13\nok 1 - t1\n  ---\n  duration_ms: 10\n  ...\nok 2 - t2\n  ---\n  duration_ms: 12\n  ...\n1..2\n',
    'TAP version 13\nnot ok 1 - t1\n  ---\n  duration_ms: 350\n  name: TimeoutError\n  error: Operation timed out after 300ms\n  stack: |-\n    at test/a.test.mjs:15:5\n  ...\nnot ok 2 - t2\n  ---\n  duration_ms: 15\n  name: AssertionError\n  error: Expected 1 to equal 2\n  stack: |-\n    at test/a.test.mjs:30:5\n  ...\n1..2\n',
    'TAP version 13\nok 1 - t1\n  ---\n  duration_ms: 11\n  ...\nok 2 - t2\n  ---\n  duration_ms: 12\n  ...\n1..2\n',
  ]
  let idx = 0
  const runner = {
    async run() {
      const stdout = tapScripts[idx++]
      return { exitCode: stdout.includes('not ok') ? 1 : 0, signal: null, stdout, stderr: '' }
    },
  }
  const detect = buildFlakeTools(cfg, runner, store).find(t => t.name === 'flaky_detect')
  const value = await detect.execute({ target: 'test/a.test.mjs', runs: 3 }, {})
  assert.equal(value.verdict, 'flaky')
  assert.equal(value.quarantineSync.alreadyQuarantinedFlaky.length, 1)
  assert.equal(value.quarantineSync.newFlaky.length, 1)
  assert.match(value.summary, /\[已隔离\]/)
  assert.match(value.summary, /\[新增未隔离\]/)
  assert.match(value.summary, /时间线：✓✗✓/)
  assert.match(value.summary, /耗时：通过均/)
  assert.match(value.summary, /模式：/)
  assert.match(value.summary, /错误 \[1次，轮次 #2\]/)
  assert.match(value.summary, /flaky_quarantine/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_detect 稳定通过且命中已隔离条目时列出可解除隔离候选', async () => {
  const { dir, cfg, store } = await tempWorld()
  await store.addQuarantine([{ file: 'test/a.test.mjs', name: 't1' }], '定时器竞态')
  const { runner } = fakeRunner([['ok']])
  const detect = buildFlakeTools(cfg, runner, store).find(t => t.name === 'flaky_detect')
  const value = await detect.execute({ target: 'test/a.test.mjs', runs: 3 }, {})
  assert.equal(value.verdict, 'stable-pass')
  assert.equal(value.quarantineSync.clearCandidates.length, 1)
  assert.match(value.summary, /可解除隔离候选/)
  assert.match(value.summary, /test\/a\.test\.mjs > t1/)
  assert.match(value.summary, /flaky_clear/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_report 渲染检测历史、高频不稳定榜单与超期隔离提醒', async () => {
  const { dir, cfg, store } = await tempWorld({ staleQuarantineDays: 7 })
  const { runner } = fakeRunner([['ok', 'ok'], ['ok', 'not ok'], ['ok', 'ok']])
  const tools = buildFlakeTools(cfg, runner, store)
  await tools.find(t => t.name === 'flaky_detect').execute({ target: 'test/a.test.mjs', runs: 3 }, {})

  const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
  await fs.writeFile(cfg.quarantineFile, JSON.stringify({
    version: 1,
    quarantined: [{ file: 'test/legacy.test.mjs', name: 'oldFlaky', reason: '旧问题', since: oldDate, issue: '#99' }],
  }, null, 2), 'utf8')

  const report = tools.find(t => t.name === 'flaky_report')
  const value = await report.execute({}, {})
  const text = report.output.render({}, value)[0].text
  assert.equal(value.topFlakyTests.length, 1)
  assert.equal(value.staleQuarantined.length, 1)
  assert.match(text, /检测历史：1 条/)
  assert.match(text, /test\/a\.test\.mjs/)
  assert.match(text, /历史高频不稳定 Top 1/)
  assert.match(text, /超期未复查隔离项（>7 天/)
  assert.match(text, /test\/legacy\.test\.mjs > oldFlaky/)
  assert.match(text, /关联 #99/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_report 空清单时仍渲染检测历史与清单为空引导', async () => {
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

test('flaky_history 空历史给出下一步，有过滤/模式时展示元信息', async () => {
  const { dir, cfg, store } = await tempWorld()
  const { runner } = fakeRunner([['ok']])
  const tools = buildFlakeTools(cfg, runner, store)
  const history = tools.find(t => t.name === 'flaky_history')
  const emptyText = history.output.render({}, await history.execute({}, {}))[0].text
  assert.match(emptyText, /历史记录 0 条/)
  assert.match(emptyText, /flaky_detect/)

  await tools.find(t => t.name === 'flaky_detect').execute({ target: 'test/a.test.mjs', runs: 3, testName: 't1', mode: 'verify-fix' }, {})
  const filledText = history.output.render({}, await history.execute({}, {}))[0].text
  assert.match(filledText, /testName=t1/)
  assert.match(filledText, /mode=verify-fix/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_quarantine / flaky_clear 渲染带下一步、准确区分新增与更新及 0 条说明', async () => {
  const { dir, cfg, store } = await tempWorld()
  const tools = buildFlakeTools(cfg, { run: async () => ({ exitCode: 0, signal: null, stdout: '', stderr: '' }) }, store)
  const quarantine = tools.find(t => t.name === 'flaky_quarantine')
  const added = await quarantine.execute({ tests: ['a.test.mjs > t1'], reason: '定时器竞态', issue: '#12', lastFailureRate: 33.3 }, {})
  assert.equal(added.addedCount, 1)
  assert.equal(added.updatedCount, 0)
  assert.match(quarantine.output.render({}, added)[0].text, /新增 1 条/)
  assert.match(quarantine.output.render({}, added)[0].text, /flaky_clear/)

  const again = await quarantine.execute({ tests: ['a.test.mjs > t1'], reason: '补充根因说明' }, {})
  assert.equal(again.addedCount, 0)
  assert.equal(again.updatedCount, 1)
  const againText = quarantine.output.render({}, again)[0].text
  assert.match(againText, /已更新隔离清单/)
  assert.doesNotMatch(againText, /未新增条目/)

  const clear = tools.find(t => t.name === 'flaky_clear')
  const none = await clear.execute({ tests: ['b.test.mjs > t9'] }, {})
  assert.equal(none.removedCount, 0)
  assert.match(clear.output.render({}, none)[0].text, /没有匹配条目/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_health 在需要 Python 的工作区失败时给出下一步', async () => {
  const { dir, cfg, store } = await tempWorld({ pythonPath: 'python3' })
  const failing = { run: async () => ({ exitCode: 1, signal: null, stdout: '', stderr: 'python: not found' }) }
  const health = buildFlakeTools(cfg, failing, store).find(t => t.name === 'flaky_health')
  const value = await health.execute({}, {})
  assert.equal(value.ok, false)
  const text = health.output.render({}, value)[0].text
  assert.match(text, /自检：发现问题/)
  assert.match(text, /下一步：/)
  await fs.rm(dir, { recursive: true, force: true })
})
