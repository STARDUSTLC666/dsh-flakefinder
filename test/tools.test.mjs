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

test('quarantine/clear enforce array bounds before touching the store', async () => {
  const store = {
    async addQuarantine() { assert.fail('Invalid input must not write') },
    async removeQuarantine() { assert.fail('Invalid input must not write') },
  }
  const tools = buildFlakeTools(resolveConfig({}), {}, store)
  for (const name of ['flaky_quarantine', 'flaky_clear']) {
    const tool = tools.find((tool) => tool.name === name)
    assert.ok(!('minItems' in tool.parameters.properties.tests))
    assert.ok(!('maxItems' in tool.parameters.properties.tests))
    await assert.rejects(tool.execute({ tests: [], reason: 'regression' }), /至少包含一个/)
    await assert.rejects(tool.execute({ tests: Array(101).fill('a.test.mjs'), reason: 'regression' }), /最多 100 条/)
  }
})

test('compileParameters 输出 enum 约束且保持工具定义稳定不重建', () => {
  const tools = buildFlakeTools(resolveConfig({}), {}, {})
  const detect = tools.find(t => t.name === 'flaky_detect')
  assert.deepEqual(detect.parameters.properties.framework.enum, ['auto', 'vitest', 'jest', 'pytest', 'node'])
  assert.deepEqual(detect.parameters.properties.mode.enum, ['full', 'until-flaky', 'verify-fix'])
  assert.equal(detect.parameters.properties.testName.type, 'string')
  assert.equal(detect.parameters.properties.concurrency.type, 'integer')
  assert.equal(detect.parameters.properties.shuffle.type, 'boolean')
  assert.equal(detect.parameters.properties.seed.type, 'integer')
  assert.equal(detect.parameters.properties.noCoverage.type, 'boolean')

  const history = tools.find(t => t.name === 'flaky_history')
  assert.deepEqual(history.parameters.properties.scope.enum, ['workspace', 'all'])
  const report = tools.find(t => t.name === 'flaky_report')
  assert.deepEqual(report.parameters.properties.scope.enum, ['workspace', 'all'])
})

test('所有工具 parameters 与 output.schema 符合 DSH JSON Schema 约束（无 type 数组）', () => {
  const tools = buildFlakeTools(resolveConfig({}), {}, {})
  const walk = (node, loc) => {
    if (!node || typeof node !== 'object') return
    if ('type' in node) assert.equal(typeof node.type, 'string', loc + '.type must be a single string, not array')
    if (node.properties) for (const [k, v] of Object.entries(node.properties)) walk(v, loc + '.properties.' + k)
    if (node.items) walk(node.items, loc + '.items')
    if (Array.isArray(node.oneOf)) node.oneOf.forEach((v, i) => walk(v, loc + '.oneOf[' + i + ']'))
  }
  for (const tool of tools) {
    walk(tool.parameters, tool.name + '.parameters')
    walk(tool.output.schema, tool.name + '.output.schema')
  }
})

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

async function tempWorld(overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-tools-'))
  const cfg = resolveConfig({
    defaultRuns: 3,
    maxRuns: 10,
    writeApproval: true,
    dataDir: path.join(dir, 'data'),
    quarantineFile: path.join(dir, '.flakefinder.json'),
    ...overrides,
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
  assert.equal(value.plannedRuns, 3)
  assert.equal(value.verdict, 'flaky')
  assert.equal(value.flakyCount, 1)
  assert.equal(value.stablePassCount, 1)
  assert.equal(calls.length, 3)
  assert.equal(value.quarantineSync.newFlaky.length, 1)
  assert.match(value.summary, /不稳定/)
  assert.equal((await store.listHistory(undefined, 10)).length, 1)
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_detect 支持 testName、mode=until-flaky 与 mode=verify-fix 早停及 concurrency', async (t) => {
  const { dir, cfg, store } = await tempWorld()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))

  const untilFlaky = fakeRunner([['ok'], ['not ok'], ['ok'], ['ok'], ['ok']])
  const detect1 = buildFlakeTools(cfg, untilFlaky.runner, store).find(tool => tool.name === 'flaky_detect')
  const res1 = await detect1.execute({ target: 'test/a.test.mjs', testName: 't1', runs: 5, mode: 'until-flaky' }, {})
  assert.equal(res1.verdict, 'flaky')
  assert.equal(res1.runs, 2)
  assert.equal(res1.plannedRuns, 5)
  assert.equal(res1.earlyStopped, true)
  assert.equal(untilFlaky.calls.length, 2)
  assert.ok(untilFlaky.calls[0].includes('--test-name-pattern=t1'))
  assert.match(res1.summary, /实际运行 2\/5 次/)

  const verifyFix = fakeRunner([['not ok'], ['ok'], ['ok'], ['ok']])
  const detect2 = buildFlakeTools(cfg, verifyFix.runner, store).find(tool => tool.name === 'flaky_detect')
  const res2 = await detect2.execute({ target: 'test/a.test.mjs', runs: 4, mode: 'verify-fix' }, {})
  assert.equal(res2.verdict, 'stable-fail')
  assert.equal(res2.runs, 1)
  assert.equal(res2.earlyStopped, true)
  assert.equal(verifyFix.calls.length, 1)

  const concurrent = fakeRunner([['ok'], ['ok'], ['ok'], ['ok']])
  const detect3 = buildFlakeTools(cfg, concurrent.runner, store).find(tool => tool.name === 'flaky_detect')
  const res3 = await detect3.execute({ target: 'test/a.test.mjs', runs: 4, concurrency: 2 }, {})
  assert.equal(res3.verdict, 'stable-pass')
  assert.equal(res3.concurrency, 2)
  assert.equal(res3.runs, 4)
})

test('flaky_detect shuffle=true 无 seed 时为每轮生成互不相同的正 32 位随机种子，显式 seed 可复现', async (t) => {
  const { dir, cfg, store } = await tempWorld()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const vitestEntry = path.join(dir, 'node_modules', 'vitest', 'vitest.mjs')
  await fs.mkdir(path.dirname(vitestEntry), { recursive: true })
  await fs.writeFile(vitestEntry, '// fake vitest', 'utf8')

  const seenArgvs = []
  const runner = {
    async run(argv) {
      seenArgvs.push(argv)
      const outIdx = argv.indexOf('--outputFile')
      const outPath = argv[outIdx + 1]
      const seedArg = argv.find(a => a.startsWith('--sequence.seed='))
      const isSecond = seenArgvs.length === 2
      await fs.writeFile(outPath, JSON.stringify({
        success: !isSecond,
        numTotalTests: 1,
        numPassedTests: isSecond ? 0 : 1,
        numFailedTests: isSecond ? 1 : 0,
        numPendingTests: 0,
        testResults: [{
          name: path.join(dir, 'src/order.test.ts'),
          status: isSecond ? 'failed' : 'passed',
          assertionResults: [{
            fullName: 'order sensitive',
            status: isSecond ? 'failed' : 'passed',
            duration: 5,
            failureMessages: isSecond ? ['AssertionError: wrong order with ' + seedArg] : [],
          }],
        }],
      }), 'utf8')
      return { exitCode: isSecond ? 1 : 0, signal: null, stdout: '', stderr: '' }
    },
  }

  const detect = buildFlakeTools(cfg, runner, store).find(tool => tool.name === 'flaky_detect')
  const res = await detect.execute({ target: 'src/order.test.ts', runs: 4, shuffle: true, noCoverage: false }, {
    agent: { session: { header: { cwd: dir } } },
  })
  assert.equal(res.framework, 'vitest')
  assert.equal(res.verdict, 'flaky')
  assert.equal(res.shuffle, true)
  const seeds = res.runResults.map(r => r.seed)
  assert.equal(seeds.length, 4)
  assert.equal(new Set(seeds).size, 4)
  assert.ok(seeds.every(s => Number.isInteger(s) && s >= 1 && s <= 2147483647))
  assert.ok(seenArgvs.every(argv => !argv.includes('--coverage.enabled=false')))
  assert.deepEqual(res.tests[0].failedSeeds, [seeds[1]])
  assert.match(res.summary, new RegExp('失败种子：' + String(seeds[1])))

  // 显式指定 seed 时，每轮使用同一个种子以便复现
  seenArgvs.length = 0
  const repro = await detect.execute({ target: 'src/order.test.ts', runs: 3, shuffle: true, seed: 4242 }, {
    agent: { session: { header: { cwd: dir } } },
  })
  assert.deepEqual(repro.runResults.map(r => r.seed), [4242, 4242, 4242])
  assert.ok(seenArgvs.every(argv => argv.includes('--sequence.seed=4242') && argv.includes('--coverage.enabled=false')))
})

test('flaky_detect 上下文保护：用例总数 >60 时保留全部非通过用例并截断 stable-pass 至 20 条', async (t) => {
  const { dir, cfg, store } = await tempWorld()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))

  function bigTap(runIdx) {
    const lines = ['TAP version 13']
    let n = 1
    // 2 flaky
    lines.push((runIdx === 1 ? 'not ok ' : 'ok ') + (n++) + ' - flaky_1')
    lines.push((runIdx === 2 ? 'not ok ' : 'ok ') + (n++) + ' - flaky_2')
    // 1 stable-fail
    lines.push('not ok ' + (n++) + ' - always_fail')
    // 1 skipped
    lines.push('ok ' + (n++) + ' - skipped_case # SKIP later')
    // 65 stable-pass
    for (let i = 1; i <= 65; i += 1) {
      lines.push('ok ' + (n++) + ' - pass_' + String(i))
    }
    lines.push('1..' + String(n - 1))
    return lines.join('\n') + '\n'
  }

  let runIdx = 0
  const runner = {
    async run() {
      runIdx += 1
      return { exitCode: 1, signal: null, stdout: bigTap(runIdx), stderr: '' }
    },
  }

  const detect = buildFlakeTools(cfg, runner, store).find(tool => tool.name === 'flaky_detect')
  const value = await detect.execute({ target: 'test/big.test.mjs', runs: 3 }, {})
  assert.equal(value.verdict, 'flaky')
  assert.equal(value.flakyCount, 2)
  assert.equal(value.stableFailCount, 1)
  assert.equal(value.skippedCount, 1)
  assert.equal(value.stablePassCount, 65)
  assert.equal(value.testsTruncated, true)
  assert.equal(value.omittedStablePassCount, 45)
  assert.equal(value.tests.length, 24)
  assert.equal(value.tests.filter(x => x.verdict === 'flaky').length, 2)
  assert.equal(value.tests.filter(x => x.verdict === 'stable-fail').length, 1)
  assert.equal(value.tests.filter(x => x.verdict === 'skipped').length, 1)
  assert.equal(value.tests.filter(x => x.verdict === 'stable-pass').length, 20)
  assert.match(value.summary, /省略 45 个稳定通过用例/)
})

test('flaky_detect 遇到损坏的 .flakefinder.json 时记录告警而不中断检测', async (t) => {
  const { dir, cfg, store } = await tempWorld()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  await fs.writeFile(cfg.quarantineFile, '{broken-json', 'utf8')
  const { runner } = fakeRunner([['ok'], ['not ok'], ['ok']])
  const detect = buildFlakeTools(cfg, runner, store).find(tool => tool.name === 'flaky_detect')
  const value = await detect.execute({ target: 'test/a.test.mjs', runs: 3 }, {})
  assert.equal(value.verdict, 'flaky')
  assert.ok(typeof value.quarantineSync.warning === 'string' && value.quarantineSync.warning.length > 0)
  assert.match(value.summary, /隔离清单读取警告/)
})

test('flaky_history 支持目标过滤与 scope=workspace/all', async (t) => {
  const { dir, cfg, store } = await tempWorld()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const wsA = path.join(dir, 'ws-a')
  const wsB = path.join(dir, 'ws-b')
  await fs.mkdir(wsA)
  await fs.mkdir(wsB)

  const { runner } = fakeRunner([['ok']])
  const tools = buildFlakeTools(cfg, runner, store)
  const detect = tools.find(tool => tool.name === 'flaky_detect')
  const history = tools.find(tool => tool.name === 'flaky_history')

  await detect.execute({ target: 'x.test.mjs', runs: 3 }, { agent: { session: { header: { cwd: wsA } } } })
  await detect.execute({ target: 'y.test.mjs', runs: 3 }, { agent: { session: { header: { cwd: wsB } } } })

  const onlyA = await history.execute({ target: 'x.test', limit: 5 }, { agent: { session: { header: { cwd: wsA } } } })
  assert.equal(onlyA.scope, 'workspace')
  assert.equal(onlyA.count, 1)
  assert.equal(onlyA.entries[0].target, 'x.test.mjs')

  const crossA = await history.execute({ limit: 10, scope: 'all' }, { agent: { session: { header: { cwd: wsA } } } })
  assert.equal(crossA.scope, 'all')
  assert.equal(crossA.count, 2)
})

test('quarantine/clear 写清单（含 issue/lastFailureRate 与更新计数），report 汇总', async () => {
  const { dir, cfg, store } = await tempWorld()
  const tools = buildFlakeTools(cfg, { run: async () => ({ exitCode: 0, signal: null, stdout: '', stderr: '' }) }, store)

  const quarantine = tools.find(t => t.name === 'flaky_quarantine')
  const added = await quarantine.execute({
    tests: ['a.test.mjs > t2'],
    reason: '定时器竞态',
    issue: '#108',
    lastFailureRate: 40,
  }, {})
  assert.equal(added.addedCount, 1)
  assert.equal(added.updatedCount, 0)
  assert.equal(added.added[0].issue, '#108')
  assert.equal(added.added[0].lastFailureRate, 40)

  const updated = await quarantine.execute({
    tests: ['a.test.mjs > t2'],
    reason: '更新原因：异步回调竞态',
    lastFailureRate: 20,
  }, {})
  assert.equal(updated.addedCount, 0)
  assert.equal(updated.updatedCount, 1)
  assert.equal(updated.updated[0].since, added.added[0].since)
  assert.equal(updated.updated[0].issue, '#108')
  assert.equal(updated.updated[0].lastFailureRate, 20)

  const report = await tools.find(t => t.name === 'flaky_report').execute({}, {})
  assert.equal(report.quarantinedCount, 1)
  assert.match(report.quarantined[0].reason, /异步回调竞态/)

  const cleared = await tools.find(t => t.name === 'flaky_clear').execute({ tests: ['a.test.mjs > t2'] }, {})
  assert.equal(cleared.removedCount, 1)
  const report2 = await tools.find(t => t.name === 'flaky_report').execute({}, {})
  assert.equal(report2.quarantinedCount, 0)

  const fileText = await fs.readFile(path.join(dir, '.flakefinder.json'), 'utf8')
  assert.ok(!fileText.includes('t2'))
  await fs.rm(dir, { recursive: true, force: true })
})

test('flaky_detect 崩溃 stderr 中的凭据会在 summary 中脱敏，且合成异常不混入 quarantineSync.newFlaky', async (t) => {
  const { dir, cfg, store } = await tempWorld()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  let call = 0
  const runner = {
    async run() {
      call += 1
      if (call === 2) {
        return {
          exitCode: 137,
          signal: 'SIGKILL',
          stdout: 'TAP version 13\nok 1 - t1\n1..1\n',
          stderr: 'fatal: Authorization: Bearer super_secret_token_99999 failed on https://alice:topsecret@db.local/app',
        }
      }
      return { exitCode: 0, signal: null, stdout: 'TAP version 13\nok 1 - t1\n1..1\n', stderr: '' }
    },
  }
  const detect = buildFlakeTools(cfg, runner, store).find(tool => tool.name === 'flaky_detect')
  const value = await detect.execute({ target: 'test/a.test.mjs', runs: 3 }, {})
  assert.equal(value.verdict, 'flaky')
  assert.deepEqual(value.quarantineSync.newFlaky, [])
  assert.doesNotMatch(value.summary, /super_secret_token_99999/)
  assert.doesNotMatch(value.summary, /topsecret/)
  assert.match(value.summary, /<REDACTED>/)
})

test('flaky_detect 带 testName 过滤时不把整文件隔离项列为可解除候选，仍保留精准用例级候选', async (t) => {
  const { dir, cfg, store } = await tempWorld()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  await store.addQuarantine([
    { file: 'test/a.test.mjs', name: null },
    { file: 'test/a.test.mjs', name: 't1' },
  ], '测试隔离')
  const { runner } = fakeRunner([['ok']])
  const detect = buildFlakeTools(cfg, runner, store).find(tool => tool.name === 'flaky_detect')
  const value = await detect.execute({ target: 'test/a.test.mjs', testName: 't1', runs: 3 }, {})
  assert.equal(value.verdict, 'stable-pass')
  assert.deepEqual(value.quarantineSync.clearCandidates.map(c => c.ref), ['test/a.test.mjs > t1'])
  assert.doesNotMatch(value.summary, /- test\/a\.test\.mjs（/)
  assert.match(value.summary, /test\/a\.test\.mjs > t1/)
})

test('flaky_detect 渲染与历史 errorSummary 不重复拼接已含前缀的错误类型（如 Vitest AssertionError）', async (t) => {
  const { dir, cfg, store } = await tempWorld()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const vitestEntry = path.join(dir, 'node_modules', 'vitest', 'vitest.mjs')
  await fs.mkdir(path.dirname(vitestEntry), { recursive: true })
  await fs.writeFile(vitestEntry, '// fake vitest', 'utf8')

  let runNum = 0
  const runner = {
    async run(argv) {
      runNum += 1
      const outPath = argv[argv.indexOf('--outputFile') + 1]
      const fail = runNum === 2
      await fs.writeFile(outPath, JSON.stringify({
        success: !fail,
        numTotalTests: 1,
        numPassedTests: fail ? 0 : 1,
        numFailedTests: fail ? 1 : 0,
        numPendingTests: 0,
        testResults: [{
          name: path.join(dir, 'src/a.test.ts'),
          status: fail ? 'failed' : 'passed',
          assertionResults: [{
            fullName: 'checks equality',
            status: fail ? 'failed' : 'passed',
            duration: 4,
            failureMessages: fail ? ['AssertionError: expected 1 to be 2\n    at src/a.test.ts:5:3'] : [],
          }],
        }],
      }), 'utf8')
      return { exitCode: fail ? 1 : 0, signal: null, stdout: '', stderr: '' }
    },
  }

  const tools = buildFlakeTools(cfg, runner, store)
  const ctx = { agent: { session: { header: { cwd: dir } } } }
  const res = await tools.find(tool => tool.name === 'flaky_detect').execute({ target: 'src/a.test.ts', runs: 3 }, ctx)
  assert.equal(res.verdict, 'flaky')
  assert.match(res.summary, /AssertionError: expected 1 to be 2/)
  assert.doesNotMatch(res.summary, /AssertionError:\s*AssertionError:/)

  const hist = await tools.find(tool => tool.name === 'flaky_history').execute({}, ctx)
  assert.equal(hist.count, 1)
  assert.equal(hist.entries[0].errorSummary[0].message, 'AssertionError: expected 1 to be 2')
})

test('工具定义不再携带旧 gate 字段', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-gate-'))
  const cfg = resolveConfig({ writeApproval: false, dataDir: path.join(dir, 'data'), quarantineFile: path.join(dir, '.flakefinder.json') }, dir)
  const tools = buildFlakeTools(cfg, { run: async () => ({ exitCode: 0, signal: null, stdout: '', stderr: '' }) }, createStore(cfg.dataDir, cfg.quarantineFile))
  assert.ok(tools.every(tool => !('gate' in tool)))
  await fs.rm(dir, { recursive: true, force: true })
})
