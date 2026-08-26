import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { buildFlakeTools, resolveConfig, createStore } from '../lib/index.js'

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-flake-health-'))
  const cfg = resolveConfig({ defaultRuns: 3, dataDir: path.join(dir, 'data'), quarantineFile: path.join(dir, '.flakefinder.json') }, dir)
  const store = createStore(cfg.dataDir, cfg.quarantineFile)
  return { dir, cfg, store }
}

test('flaky_health python 与 pytest 可用时 ok=true', async () => {
  const { dir, cfg, store } = await setup()
  const runner = { async run(argv) { return { exitCode: 0, signal: null, stdout: argv.includes('--version') && argv.includes('pytest') ? 'pytest 8.0' : 'Python 3.12', stderr: '' } } }
  const health = buildFlakeTools(cfg, runner, store).find((t) => t.name === 'flaky_health')
  const value = await health.execute({})
  assert.equal(value.ok, true)
  assert.match(String(value.checks[1].detail), /pytest/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_health pytest 缺失时 ok=false 且给出安装指引', async () => {
  const { dir, cfg, store } = await setup()
  const runner = { async run(argv) { const isPytest = argv.includes('pytest'); return { exitCode: isPytest ? 1 : 0, signal: null, stdout: isPytest ? '' : 'Python 3.12', stderr: '' } } }
  const health = buildFlakeTools(cfg, runner, store).find((t) => t.name === 'flaky_health')
  const value = await health.execute({})
  assert.equal(value.ok, false)
  const bad = value.checks.find((c) => c.name === 'pytest')
  assert.match(String(bad.detail), /pip install pytest/)
  await fs.rm(dir, { recursive: true, force: true })
})
