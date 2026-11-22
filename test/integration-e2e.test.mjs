import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  buildFlakeTools,
  createStore,
  createSubprocessRunner,
  resolveConfig,
} from '../lib/index.js'

/**
 * 面向 E2E 测试的真实子进程适配器，模拟 DSH subprocess.spawn 契约（支持 signal 中止与 maxBytes 截断）。
 */
function createRealSubprocessSpawn() {
  return function realSpawn(spec) {
    const childEnv = { ...process.env }
    delete childEnv.NODE_TEST_CONTEXT

    const child = spawn(spec.argv[0], spec.argv.slice(1), {
      cwd: spec.cwd,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const maxOut = spec.stdio?.stdout?.maxBytes ?? 4 * 1024 * 1024
    const maxErr = spec.stdio?.stderr?.maxBytes ?? 4 * 1024 * 1024
    const outChunks = []
    const errChunks = []
    let outBytes = 0
    let errBytes = 0
    let outLossy = false
    let errLossy = false

    child.stdout.on('data', (chunk) => {
      if (outBytes + chunk.length <= maxOut) {
        outChunks.push(chunk)
        outBytes += chunk.length
      } else {
        outLossy = true
      }
    })
    child.stderr.on('data', (chunk) => {
      if (errBytes + chunk.length <= maxErr) {
        errChunks.push(chunk)
        errBytes += chunk.length
      } else {
        errLossy = true
      }
    })

    const terminate = () => {
      if (!child.killed && child.exitCode === null) {
        try { child.kill('SIGTERM') } catch {}
        const hardTimer = setTimeout(() => {
          if (child.exitCode === null) {
            try { child.kill('SIGKILL') } catch {}
          }
        }, Math.min(spec.graceMs ?? 500, 500))
        hardTimer.unref()
      }
    }

    const onAbort = () => terminate()
    if (spec.signal) {
      if (spec.signal.aborted) terminate()
      else spec.signal.addEventListener('abort', onAbort, { once: true })
    }

    const done = new Promise((resolve, reject) => {
      child.once('error', (error) => {
        spec.signal?.removeEventListener('abort', onAbort)
        reject(error)
      })
      child.once('close', (exitCode, signal) => {
        spec.signal?.removeEventListener('abort', onAbort)
        resolve({ exitCode, signal })
      })
    })

    return {
      done,
      collected: {
        stdout: { readFrom: () => ({ text: Buffer.concat(outChunks).toString('utf8'), lossy: outLossy }) },
        stderr: { readFrom: () => ({ text: Buffer.concat(errChunks).toString('utf8'), lossy: errLossy }) },
      },
      terminate,
    }
  }
}

test('E2E：真实 node --test 复跑偶发用例 → 诊断与隔离对照 → 修复复测 → 解除隔离', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-e2e-real-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const workspace = path.join(root, 'repo')
  await fs.mkdir(workspace, { recursive: true })

  const stateFile = path.join(workspace, '.attempt-count')
  const fixedFlag = path.join(workspace, '.fixed')
  const testFile = path.join(workspace, 'suite.test.mjs')
  await fs.writeFile(testFile, [
    "import test from 'node:test'",
    "import assert from 'node:assert/strict'",
    "import fs from 'node:fs'",
    `const stateFile = ${JSON.stringify(stateFile)}`,
    `const fixedFlag = ${JSON.stringify(fixedFlag)}`,
    "test('stableCase', () => {",
    '  assert.equal(1 + 1, 2)',
    '})',
    "test('flakyTimerCase', () => {",
    '  if (fs.existsSync(fixedFlag)) return',
    "  const prev = fs.existsSync(stateFile) ? Number(fs.readFileSync(stateFile, 'utf8')) : 0",
    '  const next = prev + 1',
    "  fs.writeFileSync(stateFile, String(next), 'utf8')",
    '  if (next === 2) {',
    "    assert.equal('actual_state', 'expected_state')",
    '  }',
    '})',
  ].join('\n'), 'utf8')

  const cfg = resolveConfig({
    defaultRuns: 4,
    maxRuns: 10,
    timeoutMs: 30000,
    dataDir: path.join(root, 'data'),
  }, root)
  const runner = createSubprocessRunner(createRealSubprocessSpawn(), 1000, cfg.timeoutMs)
  const store = createStore(cfg.dataDir, cfg.quarantineFile)
  const tools = buildFlakeTools(cfg, runner, store)
  const detect = tools.find(tool => tool.name === 'flaky_detect')
  const quarantine = tools.find(tool => tool.name === 'flaky_quarantine')
  const clear = tools.find(tool => tool.name === 'flaky_clear')
  const execCtx = { agent: { session: { header: { cwd: workspace } } } }

  // 1. 4 轮复跑捕获偶发失败（第 2 轮失败）
  const first = await detect.execute({ target: 'suite.test.mjs', framework: 'node', runs: 4 }, execCtx)
  assert.equal(first.verdict, 'flaky')
  assert.equal(first.runs, 4)
  assert.equal(first.flakyCount, 1)
  assert.equal(first.stablePassCount, 1)
  const flakyItem = first.tests.find(item => item.name === 'flakyTimerCase')
  assert.ok(flakyItem)
  assert.equal(flakyItem.verdict, 'flaky')
  assert.deepEqual(flakyItem.timeline, ['P', 'F', 'P', 'P'])
  assert.equal(flakyItem.failureRate, 25)
  assert.ok(flakyItem.errorClusters.length >= 1)
  assert.match(flakyItem.errorClusters[0].sampleStack ?? '', /suite\.test\.mjs/)
  assert.equal(first.quarantineSync.newFlaky.length, 1)
  assert.match(first.summary, /\[新增未隔离\]/)
  assert.match(first.summary, /时间线：✓✗✓✓/)

  // 2. testName 精准过滤只跑 stableCase
  const filtered = await detect.execute({ target: 'suite.test.mjs', framework: 'node', testName: 'stableCase', runs: 3 }, execCtx)
  assert.equal(filtered.verdict, 'stable-pass')
  assert.equal(filtered.stablePassCount, 1)
  assert.equal(filtered.flakyCount, 0)

  // 3. 写入隔离清单
  const qRes = await quarantine.execute({
    tests: ['suite.test.mjs > flakyTimerCase'],
    reason: '第 2 轮偶发状态竞争',
    issue: '#77',
    lastFailureRate: 25,
  }, execCtx)
  assert.equal(qRes.addedCount, 1)
  assert.equal(path.resolve(qRes.file), path.resolve(workspace, '.flakefinder.json'))

  // 4. 修复后复测：稳定通过并提示可解除隔离候选
  await fs.writeFile(fixedFlag, '1', 'utf8')
  const verified = await detect.execute({ target: 'suite.test.mjs', framework: 'node', runs: 3, mode: 'verify-fix' }, execCtx)
  assert.equal(verified.verdict, 'stable-pass')
  assert.equal(verified.quarantineSync.clearCandidates.length, 1)
  assert.equal(verified.quarantineSync.clearCandidates[0].ref, 'suite.test.mjs > flakyTimerCase')
  assert.match(verified.summary, /可解除隔离候选/)
  assert.match(verified.summary, /flaky_clear/)

  // 5. 清除隔离条目
  const cleared = await clear.execute({ tests: ['suite.test.mjs > flakyTimerCase'] }, execCtx)
  assert.equal(cleared.removedCount, 1)
  const manifestAfter = JSON.parse(await fs.readFile(path.join(workspace, '.flakefinder.json'), 'utf8'))
  assert.equal(manifestAfter.quarantined.length, 0)
})

test('E2E：真实 node --test 单轮超时生成结构化 (timeout) 诊断与 timeout-race 模式', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-e2e-timeout-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const workspace = path.join(root, 'repo')
  await fs.mkdir(workspace, { recursive: true })

  const stateFile = path.join(workspace, '.timeout-attempt')
  await fs.writeFile(path.join(workspace, 'slow.test.mjs'), [
    "import test from 'node:test'",
    "import fs from 'node:fs'",
    `const stateFile = ${JSON.stringify(stateFile)}`,
    "test('sometimesHangs', async () => {",
    "  const prev = fs.existsSync(stateFile) ? Number(fs.readFileSync(stateFile, 'utf8')) : 0",
    '  const next = prev + 1',
    "  fs.writeFileSync(stateFile, String(next), 'utf8')",
    '  if (next === 2) {',
    '    await new Promise(resolve => setTimeout(resolve, 10000))',
    '  }',
    '})',
  ].join('\n'), 'utf8')

  const baseCfg = resolveConfig({ defaultRuns: 3, dataDir: path.join(root, 'data') }, root)
  // 用短超时加速真实子进程超时测试
  const cfg = { ...baseCfg, timeoutMs: 800, graceMs: 200 }
  const runner = createSubprocessRunner(createRealSubprocessSpawn(), cfg.graceMs, cfg.timeoutMs)
  const store = createStore(cfg.dataDir, cfg.quarantineFile)
  const detect = buildFlakeTools(cfg, runner, store).find(tool => tool.name === 'flaky_detect')

  const value = await detect.execute({ target: 'slow.test.mjs', framework: 'node', runs: 3 }, {
    agent: { session: { header: { cwd: workspace } } },
  })
  assert.equal(value.verdict, 'flaky')
  assert.equal(value.runs, 3)
  assert.equal(value.runResults[0].success, true)
  assert.equal(value.runResults[1].timedOut, true)
  assert.equal(value.runResults[2].success, true)
  const syn = value.tests.find(item => item.id === '(timeout)')
  assert.ok(syn)
  assert.equal(syn.verdict, 'flaky')
  assert.equal(syn.failureRate, 33.3)
  assert.ok(syn.patterns.includes('timeout-race'))
  assert.match(value.summary, /超时 1 次/)
})

test('E2E：多工作区历史隔离、verify-fix 早停与 flaky_report 热点/超期提醒', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-e2e-ws-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const ws1 = path.join(root, 'ws-one')
  const ws2 = path.join(root, 'ws-two')
  await fs.mkdir(ws1, { recursive: true })
  await fs.mkdir(ws2, { recursive: true })

  // ws1：奇偶切换偶发测试 + 稳定失败测试
  const flipFile = path.join(ws1, '.flip')
  await fs.writeFile(path.join(ws1, 'flip.test.mjs'), [
    "import test from 'node:test'",
    "import assert from 'node:assert/strict'",
    "import fs from 'node:fs'",
    `const flipFile = ${JSON.stringify(flipFile)}`,
    "test('alternatingCase', () => {",
    "  const n = (fs.existsSync(flipFile) ? Number(fs.readFileSync(flipFile, 'utf8')) : 0) + 1",
    "  fs.writeFileSync(flipFile, String(n), 'utf8')",
    '  assert.equal(n % 2, 1)',
    '})',
  ].join('\n'), 'utf8')
  await fs.writeFile(path.join(ws1, 'fail.test.mjs'), [
    "import test from 'node:test'",
    "import assert from 'node:assert/strict'",
    "test('alwaysBroken', () => assert.equal(1, 2))",
  ].join('\n'), 'utf8')

  // ws2：稳定通过测试
  await fs.writeFile(path.join(ws2, 'ok.test.mjs'), [
    "import test from 'node:test'",
    "import assert from 'node:assert/strict'",
    "test('alwaysGreen', () => assert.equal(2, 2))",
  ].join('\n'), 'utf8')

  const cfg = resolveConfig({
    defaultRuns: 3,
    maxRuns: 10,
    staleQuarantineDays: 14,
    dataDir: path.join(root, 'shared-data'),
  }, root)
  const runner = createSubprocessRunner(createRealSubprocessSpawn(), 1000, cfg.timeoutMs)
  const store = createStore(cfg.dataDir, cfg.quarantineFile)
  const tools = buildFlakeTools(cfg, runner, store)
  const detect = tools.find(tool => tool.name === 'flaky_detect')
  const history = tools.find(tool => tool.name === 'flaky_history')
  const report = tools.find(tool => tool.name === 'flaky_report')

  const ctx1 = { agent: { session: { header: { cwd: ws1 } } } }
  const ctx2 = { agent: { session: { header: { cwd: ws2 } } } }

  // ws1 跑两次 flaky + 一次 verify-fix 早停
  const r1 = await detect.execute({ target: 'flip.test.mjs', framework: 'node', runs: 3 }, ctx1)
  assert.equal(r1.verdict, 'flaky')
  const r2 = await detect.execute({ target: 'flip.test.mjs', framework: 'node', runs: 3 }, ctx1)
  assert.equal(r2.verdict, 'flaky')
  const early = await detect.execute({ target: 'fail.test.mjs', framework: 'node', runs: 5, mode: 'verify-fix' }, ctx1)
  assert.equal(early.verdict, 'stable-fail')
  assert.equal(early.runs, 1)
  assert.equal(early.plannedRuns, 5)
  assert.equal(early.earlyStopped, true)

  // ws2 跑一次全绿
  const r3 = await detect.execute({ target: 'ok.test.mjs', framework: 'node', runs: 3 }, ctx2)
  assert.equal(r3.verdict, 'stable-pass')

  // 工作区隔离校验
  const h1 = await history.execute({ limit: 20 }, ctx1)
  assert.equal(h1.count, 3)
  assert.ok(h1.entries.every(e => e.target !== 'ok.test.mjs'))

  const h2 = await history.execute({ limit: 20 }, ctx2)
  assert.equal(h2.count, 1)
  assert.equal(h2.entries[0].target, 'ok.test.mjs')

  const hAll = await history.execute({ limit: 20, scope: 'all' }, ctx2)
  assert.equal(hAll.count, 4)

  // 在 ws1 写入一个 25 天前的陈旧隔离条目，验证 flaky_report 的热点榜单与超期提醒
  const staleIso = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
  await fs.writeFile(path.join(ws1, '.flakefinder.json'), JSON.stringify({
    version: 1,
    quarantined: [
      { file: 'flip.test.mjs', name: 'alternatingCase', reason: '历史竞态', since: staleIso, issue: '#5' },
    ],
  }, null, 2), 'utf8')

  const rep = await report.execute({}, ctx1)
  assert.equal(rep.topFlakyTests.length, 1)
  assert.equal(rep.topFlakyTests[0].name, 'alternatingCase')
  assert.equal(rep.topFlakyTests[0].occurrences, 2)
  assert.equal(rep.topFlakyTests[0].quarantined, true)
  assert.equal(rep.staleQuarantined.length, 1)
  assert.ok(rep.staleQuarantined[0].ageDays >= 24)

  const repText = report.output.render({}, rep)[0].text
  assert.match(repText, /历史高频不稳定 Top 1/)
  assert.match(repText, /超期未复查隔离项（>14 天/)
  assert.match(repText, /flip\.test\.mjs > alternatingCase/)
})
