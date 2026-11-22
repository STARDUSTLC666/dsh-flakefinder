import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildFlakeTools, createStore, createSubprocessRunner, resolveConfig } from '../lib/index.js'

test('会话工作区用于测试与隔离清单，取消后不派发下一轮或写历史', async t => {
  const root = await mkdtemp(join(tmpdir(), 'flake-workspace-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const workspace = join(root, 'project'); await mkdir(workspace)
  const cfg = resolveConfig({ dataDir: join(root, 'history') }, root)
  const store = createStore(cfg.dataDir, cfg.quarantineFile), controller = new AbortController()
  let calls = 0
  const tools = buildFlakeTools(cfg, { async run(argv, options) {
    calls++; assert.equal(options.cwd, workspace)
    assert.equal(options.signal, controller.signal)
    controller.abort(new Error('停止重复测试'))
    return { exitCode: 0, signal: null, stdout: 'TAP version 13\n1..1\nok 1 - works\n', stderr: '' }
  } }, store)
  const context = { signal: controller.signal, agent: { session: { header: { cwd: workspace } } } }
  await assert.rejects(tools.find(tool => tool.name === 'flaky_detect').execute({ target: 'sample.test.mjs', runs: 3, framework: 'node' }, context), /停止重复测试/)
  assert.equal(calls, 1)
  assert.deepEqual(await store.listHistory(undefined, 10), [])
  const writeContext = { agent: context.agent }
  await tools.find(tool => tool.name === 'flaky_quarantine').execute({ tests: ['sample.test.mjs'], reason: '审查' }, writeContext)
  assert.equal(JSON.parse(await readFile(join(workspace, '.flakefinder.json'), 'utf8')).quarantined.length, 1)
  await assert.rejects(readFile(cfg.quarantineFile), { code: 'ENOENT' })
})

test('绝对路径 quarantineFile 在会话工作区下保留配置路径且仍按工作区隔离历史', async t => {
  const root = await mkdtemp(join(tmpdir(), 'flake-abs-q-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const workspace = join(root, 'repo'); await mkdir(workspace)
  const sharedQuarantine = join(root, 'shared-quarantine.json')
  const cfg = resolveConfig({ dataDir: join(root, 'data'), quarantineFile: sharedQuarantine }, root)
  const store = createStore(cfg.dataDir, cfg.quarantineFile)
  const tools = buildFlakeTools(cfg, {
    async run() {
      return { exitCode: 0, signal: null, stdout: 'TAP version 13\n1..1\nok 1 - works\n', stderr: '' }
    },
  }, store)
  const ctx = { agent: { session: { header: { cwd: workspace } } } }
  await tools.find(tool => tool.name === 'flaky_detect').execute({ target: 'sample.test.mjs', runs: 3, framework: 'node' }, ctx)
  await tools.find(tool => tool.name === 'flaky_quarantine').execute({ tests: ['sample.test.mjs'], reason: '共享清单' }, ctx)
  assert.equal(JSON.parse(await readFile(sharedQuarantine, 'utf8')).quarantined.length, 1)
  const history = await tools.find(tool => tool.name === 'flaky_history').execute({}, ctx)
  assert.equal(history.count, 1)
  assert.equal(history.entries[0].workspace, workspace)
})

test('子进程接上宿主取消信号并使用指定 cwd', async () => {
  const controller = new AbortController(), reason = new Error('宿主取消')
  let started
  const runner = createSubprocessRunner(spec => {
    started = spec
    return { done: new Promise((_resolve, reject) => spec.signal.addEventListener('abort', () => reject(spec.signal.reason))), collected: {}, terminate() {} }
  }, 1000, 5000)
  const pending = runner.run(['node', '--test'], { cwd: process.cwd(), signal: controller.signal })
  controller.abort(reason)
  await assert.rejects(pending, error => error === reason)
  assert.equal(started.cwd, process.cwd())
})
