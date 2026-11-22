import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { buildFlakeTools, resolveConfig, createStore } from '../lib/index.js'

async function setup(configOverrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-flake-health-'))
  const cfg = resolveConfig({
    defaultRuns: 3,
    dataDir: path.join(dir, 'data'),
    quarantineFile: path.join(dir, '.flakefinder.json'),
    ...configOverrides,
  }, dir)
  const store = createStore(cfg.dataDir, cfg.quarantineFile, { workspace: dir })
  return { dir, cfg, store }
}

test('flaky_health python 与 pytest 可用时 ok=true 且包含 Node/框架/存储/默认配置检查', async (t) => {
  const { dir, cfg, store } = await setup()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const runner = {
    async run(argv) {
      return {
        exitCode: 0,
        signal: null,
        stdout: argv.includes('--version') && argv.includes('pytest') ? 'pytest 8.0' : 'Python 3.12',
        stderr: '',
      }
    },
  }
  const health = buildFlakeTools(cfg, runner, store).find((tool) => tool.name === 'flaky_health')
  const value = await health.execute({}, { agent: { session: { header: { cwd: dir } } } })
  assert.equal(value.ok, true)
  const byName = new Map(value.checks.map((c) => [c.name, c]))
  assert.equal(byName.get('node')?.ok, true)
  assert.equal(byName.get('工作区框架')?.ok, true)
  assert.equal(byName.get('python')?.ok, true)
  assert.equal(byName.get('pytest')?.ok, true)
  assert.match(String(byName.get('pytest')?.detail), /pytest 8\.0/)
  assert.equal(byName.get('隔离清单')?.ok, true)
  assert.equal(byName.get('历史记录')?.ok, true)
  assert.equal(byName.get('默认配置')?.ok, true)
  assert.equal(value.environment.defaultFramework, 'node')
})

test('flaky_health 纯 JS 工作区缺失 pytest 时标记为可选，整体 ok=true', async (t) => {
  const { dir, cfg, store } = await setup()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'js-only-app' }), 'utf8')
  const runner = {
    async run(argv) {
      const isPytest = argv.includes('pytest')
      return { exitCode: isPytest ? 1 : 0, signal: null, stdout: isPytest ? '' : 'Python 3.12', stderr: '' }
    },
  }
  const health = buildFlakeTools(cfg, runner, store).find((tool) => tool.name === 'flaky_health')
  const value = await health.execute({}, { agent: { session: { header: { cwd: dir } } } })
  assert.equal(value.ok, true)
  assert.equal(value.pythonRequired, false)
  const pytestCheck = value.checks.find((c) => c.name === 'pytest')
  assert.equal(pytestCheck.ok, false)
  assert.equal(pytestCheck.required, false)
  assert.match(String(pytestCheck.detail), /pip install pytest/)
  const text = health.output.render({}, value)[0].text
  assert.match(text, /自检：正常/)
  assert.match(text, /可选/)
})

test('flaky_health Python 工作区（存在 pytest.ini）缺失 pytest 时 ok=false 且给出安装指引', async (t) => {
  const { dir, cfg, store } = await setup()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  await fs.writeFile(path.join(dir, 'pytest.ini'), '[pytest]\n', 'utf8')
  const runner = {
    async run(argv) {
      const isPytest = argv.includes('pytest')
      return { exitCode: isPytest ? 1 : 0, signal: null, stdout: isPytest ? '' : 'Python 3.12', stderr: '' }
    },
  }
  const health = buildFlakeTools(cfg, runner, store).find((tool) => tool.name === 'flaky_health')
  const value = await health.execute({}, { agent: { session: { header: { cwd: dir } } } })
  assert.equal(value.ok, false)
  assert.equal(value.pythonRequired, true)
  const bad = value.checks.find((c) => c.name === 'pytest')
  assert.equal(bad.ok, false)
  assert.equal(bad.required, true)
  assert.match(String(bad.detail), /pip install pytest/)
  const text = health.output.render({}, value)[0].text
  assert.match(text, /自检：发现问题/)
  assert.match(text, /下一步：/)
})

test('flaky_health 显式配置 pythonPath 且 pytest 缺失时 ok=false', async (t) => {
  const { dir, cfg, store } = await setup({ pythonPath: 'custom-python' })
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const runner = {
    async run(argv) {
      const isPytest = argv.includes('pytest')
      return { exitCode: isPytest ? 1 : 0, signal: null, stdout: isPytest ? '' : 'Python 3.12', stderr: '' }
    },
  }
  const health = buildFlakeTools(cfg, runner, store).find((tool) => tool.name === 'flaky_health')
  const value = await health.execute({}, { agent: { session: { header: { cwd: dir } } } })
  assert.equal(value.ok, false)
  assert.equal(value.pythonRequired, true)
  assert.equal(value.environment.pytest.pythonPath, 'custom-python')
  assert.equal(value.environment.pytest.pythonSource, 'explicit')
})

test('flaky_health 自动探测工作区 Vitest 并报告损坏的 .flakefinder.json', async (t) => {
  const { dir, cfg, store } = await setup()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const vitestEntry = path.join(dir, 'node_modules', 'vitest', 'vitest.mjs')
  await fs.mkdir(path.dirname(vitestEntry), { recursive: true })
  await fs.writeFile(vitestEntry, '// fake vitest', 'utf8')
  await fs.writeFile(path.join(dir, '.flakefinder.json'), '{not-valid-json', 'utf8')

  const runner = { async run() { return { exitCode: 0, signal: null, stdout: 'ok', stderr: '' } } }
  const health = buildFlakeTools(cfg, runner, store).find((tool) => tool.name === 'flaky_health')
  const value = await health.execute({}, { agent: { session: { header: { cwd: dir } } } })
  assert.equal(value.ok, false)
  assert.equal(value.environment.defaultFramework, 'vitest')
  assert.equal(value.environment.vitest.available, true)
  const fwCheck = value.checks.find((c) => c.name === '工作区框架')
  assert.match(String(fwCheck.detail), /默认=vitest/)
  const qCheck = value.checks.find((c) => c.name === '隔离清单')
  assert.equal(qCheck.ok, false)
  const text = health.output.render({}, value)[0].text
  assert.match(text, /自检：发现问题/)
  assert.match(text, /隔离清单：❌/)
})

test('flaky_health 宿主 AbortSignal 中途取消时立即抛出取消原因且不再派发 pytest 检查', async (t) => {
  const { dir, cfg, store } = await setup()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const controller = new AbortController()
  const reason = new Error('宿主中断自检')
  let calls = 0
  const runner = {
    async run() {
      calls += 1
      controller.abort(reason)
      throw reason
    },
  }
  const health = buildFlakeTools(cfg, runner, store).find((tool) => tool.name === 'flaky_health')
  await assert.rejects(
    health.execute({}, { signal: controller.signal, agent: { session: { header: { cwd: dir } } } }),
    (err) => err === reason,
  )
  assert.equal(calls, 1)
})
