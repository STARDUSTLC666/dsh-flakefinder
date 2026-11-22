import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  annotateTestsWithQuarantine,
  createStore,
  formatRef,
  parseRef,
  summarizeStability,
  workspaceHash,
} from '../lib/store.js'

test('parseRef 支持文件与用例两种形式', () => {
  assert.deepEqual(parseRef('a.test.js'), { file: 'a.test.js', name: null })
  assert.deepEqual(parseRef(' a.test.js > 用例名 '), { file: 'a.test.js', name: '用例名' })
  assert.throws(() => parseRef(''), /不能为空/)
})

test('formatRef 输出可读形式', () => {
  assert.equal(formatRef({ file: 'a.test.js', name: null }), 'a.test.js')
  assert.equal(formatRef({ file: 'a.test.js', name: 't1' }), 'a.test.js > t1')
})

test('隔离清单新增/替换/移除', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-store-'))
  const qf = path.join(dir, '.flakefinder.json')
  const store = createStore(path.join(dir, 'data'), qf)

  const first = await store.addQuarantine([parseRef('a.test.js > t1'), parseRef('b.test.js')], '原因一')
  assert.equal(first.added.length, 2)
  const doc1 = await store.loadQuarantine()
  assert.equal(doc1.quarantined.length, 2)

  await store.addQuarantine([parseRef('a.test.js > t1')], '原因二')
  const doc2 = await store.loadQuarantine()
  assert.equal(doc2.quarantined.length, 2)
  assert.equal(doc2.quarantined.find(x => x.name === 't1').reason, '原因二')

  const removed = await store.removeQuarantine([parseRef('a.test.js')])
  assert.equal(removed.removed.length, 1)
  const doc3 = await store.loadQuarantine()
  assert.equal(doc3.quarantined.length, 1)

  await fs.rm(dir, { recursive: true, force: true })
})

test('历史追加与目标过滤', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-history-'))
  const store = createStore(path.join(dir, 'data'), path.join(dir, '.flakefinder.json'))
  const base = { timestamp: new Date().toISOString(), framework: 'node', runs: 3, durationMs: 1, verdict: 'flaky', stablePassCount: 1, stableFailCount: 1, flakyCount: 1, skippedCount: 0, flakyTests: [] }
  await store.appendHistory({ ...base, target: 'a.test.js' })
  await store.appendHistory({ ...base, target: 'b.test.js' })

  const all = await store.listHistory(undefined, 10)
  assert.equal(all.length, 2)
  assert.equal(all[0].target, 'b.test.js')
  const filtered = await store.listHistory('a.test', 10)
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].target, 'a.test.js')

  await fs.rm(dir, { recursive: true, force: true })
})

test('两个实例并发保存不丢历史或隔离条目，损坏记录不被覆盖', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-concurrency-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const data = path.join(dir, 'data'), quarantine = path.join(dir, '.flakefinder.json')
  const stores = [createStore(data, quarantine), createStore(data, quarantine)]
  const base = { timestamp: new Date().toISOString(), framework: 'node', runs: 3, durationMs: 1, verdict: 'stable-pass', stablePassCount: 1, stableFailCount: 0, flakyCount: 0, skippedCount: 0, flakyTests: [] }
  await Promise.all(Array.from({ length: 12 }, (_, i) => stores[i % 2].appendHistory({ ...base, target: i + '.test.mjs' })))
  assert.equal((await stores[0].listHistory(undefined, 20)).length, 12)
  await Promise.all(Array.from({ length: 12 }, (_, i) => stores[i % 2].addQuarantine([parseRef(i + '.test.mjs')], '审查')))
  assert.equal((await stores[0].loadQuarantine()).quarantined.length, 12)
  await fs.writeFile(quarantine, '{broken')
  await assert.rejects(stores[1].addQuarantine([parseRef('new.test.mjs')], '审查'), /原文件已保留/)
  assert.equal(await fs.readFile(quarantine, 'utf8'), '{broken')
  await fs.writeFile(path.join(data, 'history.json'), '{broken')
  await assert.rejects(stores[1].appendHistory({ ...base, target: 'new.test.mjs' }), /原文件已保留/)
  assert.equal(await fs.readFile(path.join(data, 'history.json'), 'utf8'), '{broken')
})

test('工作区历史隔离：不同工作区分文件存储，scope=all 合并去重并按时间倒序', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-ws-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const dataDir = path.join(dir, 'data')
  const wsA = path.join(dir, 'project-a')
  const wsB = path.join(dir, 'project-b')
  await fs.mkdir(wsA)
  await fs.mkdir(wsB)

  const legacyStore = createStore(dataDir, path.join(dir, '.flakefinder.json'))
  const storeA = createStore(dataDir, path.join(wsA, '.flakefinder.json'), { workspace: wsA })
  const storeB = createStore(dataDir, path.join(wsB, '.flakefinder.json'), { workspace: wsB })

  const mk = (ts, target, extra = {}) => ({
    timestamp: ts,
    target,
    framework: 'vitest',
    runs: 5,
    durationMs: 100,
    verdict: 'flaky',
    stablePassCount: 1,
    stableFailCount: 0,
    flakyCount: 1,
    skippedCount: 0,
    flakyTests: [{ file: target, name: 'case1', failureRate: 40 }],
    ...extra,
  })

  // 写入旧版 history.json：1 条无 workspace（不能泄漏给 A/B），1 条带 wsA（应在 A 可见）
  await legacyStore.appendHistory(mk('2026-10-01T00:00:00.000Z', 'legacy-unscoped.test.ts'))
  await legacyStore.appendHistory(mk('2026-10-02T00:00:00.000Z', 'legacy-a.test.ts', { workspace: path.resolve(wsA) }))

  await storeA.appendHistory(mk('2026-10-03T00:00:00.000Z', 'a-new.test.ts', {
    testName: 'case1',
    mode: 'full',
    concurrency: 2,
    shuffle: true,
    failedSeeds: [42],
    errorSummary: [{ message: 'Timeout', count: 2 }],
  }))
  await storeB.appendHistory(mk('2026-10-04T00:00:00.000Z', 'b-only.test.ts'))

  // 确认文件写在 workspaces/<hash>.json 下
  const expectedAFile = path.join(dataDir, 'workspaces', workspaceHash(wsA) + '.json')
  assert.equal(storeA.historyPath, expectedAFile)
  const rawA = JSON.parse(await fs.readFile(expectedAFile, 'utf8'))
  assert.equal(rawA.length, 1)
  assert.equal(rawA[0].workspace, path.resolve(wsA))
  assert.equal(rawA[0].concurrency, 2)
  assert.deepEqual(rawA[0].failedSeeds, [42])

  // 默认 scope='workspace'：A 只见自己的新记录 + 匹配 wsA 的旧记录，不见 B 和无归属旧记录
  const histA = await storeA.listHistory(undefined, 10)
  assert.deepEqual(histA.map(e => e.target), ['a-new.test.ts', 'legacy-a.test.ts'])

  const histB = await storeB.listHistory(undefined, 10)
  assert.deepEqual(histB.map(e => e.target), ['b-only.test.ts'])

  // 即使跨文件出现重复条目，scope='workspace' / 'all' 都能去重
  await storeA.appendHistory(mk('2026-10-02T00:00:00.000Z', 'legacy-a.test.ts'))
  const histADeduped = await storeA.listHistory(undefined, 10)
  assert.equal(histADeduped.filter(e => e.target === 'legacy-a.test.ts').length, 1)

  // scope='all' 合并所有工作区 + 旧版 history.json，去重并按最新在前排序
  const all = await storeB.listHistory(undefined, 20, 'all')
  assert.deepEqual(
    all.map(e => e.target),
    ['b-only.test.ts', 'a-new.test.ts', 'legacy-a.test.ts', 'legacy-unscoped.test.ts'],
  )
})

test('addQuarantine 修复 sameRef 缺陷：用例级与文件级共存，更新保留 since 并写 updatedAt', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-q-exact-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const qf = path.join(dir, '.flakefinder.json')
  const store = createStore(path.join(dir, 'data'), qf, { workspace: dir })

  // 先加用例级，再加同文件级：两者必须共存，不能把用例级覆盖掉
  const r1 = await store.addQuarantine([parseRef('test/a.test.js > t1')], '用例原因', { issue: '#10', lastFailureRate: 40 })
  assert.equal(r1.added.length, 1)
  assert.equal(r1.updated.length, 0)
  const originalSince = r1.added[0].since

  const r2 = await store.addQuarantine([parseRef('test/a.test.js')], '整文件原因')
  assert.equal(r2.added.length, 1)
  assert.equal(r2.updated.length, 0)
  let doc = await store.loadQuarantine()
  assert.equal(doc.quarantined.length, 2)
  assert.equal(doc.quarantined.find(x => x.name === 't1').reason, '用例原因')
  assert.equal(doc.quarantined.find(x => x.name === null).reason, '整文件原因')

  // 更新已存在用例：保留原 since，写入 updatedAt，更新 reason/issue/lastFailureRate
  await new Promise(resolve => setTimeout(resolve, 15))
  const r3 = await store.addQuarantine([parseRef('./test\\a.test.js > t1')], '新原因', { issue: '#20', lastFailureRate: 60 })
  assert.equal(r3.added.length, 0)
  assert.equal(r3.updated.length, 1)
  assert.equal(r3.updated[0].since, originalSince)
  assert.ok(r3.updated[0].updatedAt)
  assert.notEqual(r3.updated[0].updatedAt, originalSince)
  assert.equal(r3.updated[0].reason, '新原因')
  assert.equal(r3.updated[0].issue, '#20')
  assert.equal(r3.updated[0].lastFailureRate, 60)

  // removeQuarantine 仍用 matchesRef：移除文件级引用会清理同文件的全部条目
  const removed = await store.removeQuarantine([parseRef('test/a.test.js')])
  assert.equal(removed.removed.length, 2)
  doc = await store.loadQuarantine()
  assert.equal(doc.quarantined.length, 0)
})

test('隔离清单路径规范化为 POSIX 相对路径并拒绝工作区外绝对路径', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flakefinder-q-path-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const workspace = path.join(dir, 'repo')
  const outside = path.join(dir, 'outside')
  await fs.mkdir(workspace)
  await fs.mkdir(outside)
  const qf = path.join(workspace, '.flakefinder.json')
  const store = createStore(path.join(dir, 'data'), qf, { workspace })

  const absInside = path.join(workspace, 'tests', 'unit', 'sample.test.ts')
  const res = await store.addQuarantine([
    { file: '.\\src\\a.test.ts', name: 't1' },
    { file: absInside, name: 't2' },
  ], '路径规范化测试')
  assert.deepEqual(res.added.map(e => e.file).sort(), ['src/a.test.ts', 'tests/unit/sample.test.ts'])

  const absOutside = path.join(outside, 'leak.test.ts')
  await assert.rejects(
    store.addQuarantine([{ file: absOutside, name: 'bad' }], '不应写入'),
    /工作区之外/,
  )
  await assert.rejects(
    store.addQuarantine([{ file: '../outside/leak.test.ts', name: 'bad' }], '不应写入'),
    /不能越出当前工作区/,
  )

  // 未传 workspace 时也拒绝绝对路径
  const noWsStore = createStore(path.join(dir, 'data'), qf)
  await assert.rejects(
    noWsStore.addQuarantine([{ file: absInside, name: 'bad' }], '不应写入'),
    /不能写入绝对路径/,
  )

  // 兼容旧版 4 字段 v1 隔离清单
  const legacyDoc = {
    version: 1,
    quarantined: [{ file: 'old.test.js', name: null, reason: 'legacy', since: '2025-01-01T00:00:00.000Z' }],
  }
  await fs.writeFile(qf, JSON.stringify(legacyDoc, null, 2))
  const loaded = await store.loadQuarantine()
  assert.equal(loaded.quarantined.length, 1)
  assert.equal(loaded.quarantined[0].file, 'old.test.js')

  // 可选字段类型错误时拒绝读取且保留原文件
  const badDoc = {
    version: 1,
    quarantined: [{ file: 'old.test.js', name: null, reason: 'legacy', since: '2025-01-01T00:00:00.000Z', lastFailureRate: 'not-a-number' }],
  }
  await fs.writeFile(qf, JSON.stringify(badDoc))
  await assert.rejects(store.loadQuarantine(), /格式无效/)
})

test('annotateTestsWithQuarantine 识别新增 flaky、已隔离 flaky 与可清理候选', () => {
  const doc = {
    version: 1,
    quarantined: [
      { file: 'test/a.test.js', name: 'known_flaky', reason: 'r1', since: '2026-01-01T00:00:00.000Z' },
      { file: 'test/a.test.js', name: 'fixed_case', reason: 'r2', since: '2026-01-01T00:00:00.000Z' },
      { file: 'test/b.test.js', name: null, reason: 'whole file fixed', since: '2026-01-01T00:00:00.000Z' },
      { file: 'test/c.test.js', name: null, reason: 'not run today', since: '2026-01-01T00:00:00.000Z' },
      { file: 'test/d.test.js', name: null, reason: 'still partial fail', since: '2026-01-01T00:00:00.000Z' },
    ],
  }
  const tests = [
    { file: './test\\a.test.js', name: 'known_flaky', verdict: 'flaky', failureRate: 40 },
    { file: 'test/a.test.js', name: 'brand_new_flaky', verdict: 'flaky', failureRate: 20 },
    { file: 'test/a.test.js', name: 'fixed_case', verdict: 'stable-pass', failureRate: 0 },
    { file: 'test/b.test.js', name: 'b1', verdict: 'stable-pass', failureRate: 0 },
    { file: 'test/b.test.js', name: 'b2', verdict: 'stable-pass', failureRate: 0 },
    { file: 'test/d.test.js', name: 'd1', verdict: 'stable-pass', failureRate: 0 },
    { file: 'test/d.test.js', name: 'd2', verdict: 'stable-fail', failureRate: 100 },
  ]
  const ann = annotateTestsWithQuarantine(tests, doc)
  assert.deepEqual(ann.newFlaky.map(t => t.name), ['brand_new_flaky'])
  assert.deepEqual(ann.alreadyQuarantinedFlaky.map(t => t.name), ['known_flaky'])
  assert.deepEqual(ann.clearCandidates.map(formatRef), ['test/a.test.js > fixed_case', 'test/b.test.js'])

  // 存在运行级超时/崩溃时不应推荐清理隔离条目
  const annWithCrash = annotateTestsWithQuarantine([
    ...tests,
    { file: '(timeout)', name: '运行超时', verdict: 'flaky', failureRate: 33.3 },
  ], doc)
  assert.deepEqual(annWithCrash.clearCandidates, [])
})

test('summarizeStability 聚合高频 flaky 榜单并识别超期隔离条目', () => {
  const now = new Date('2026-11-22T00:00:00.000Z')
  const quarantineDoc = {
    version: 1,
    quarantined: [
      { file: 'test/a.test.js', name: 't1', reason: 'stale since', since: '2026-11-01T00:00:00.000Z' },
      { file: 'test/b.test.js', name: 't2', reason: 'recently updated', since: '2026-10-01T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z' },
      { file: 'test/c.test.js', name: null, reason: 'old verified', since: '2026-09-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', lastVerifiedAt: '2026-11-05T00:00:00.000Z' },
      { file: 'test/d.test.js', name: 'boundary', reason: 'exact 14d', since: '2026-11-08T00:00:00.000Z' },
    ],
  }
  const history = [
    {
      timestamp: '2026-11-20T10:00:00.000Z',
      target: 'test/a.test.js',
      framework: 'vitest',
      runs: 5,
      durationMs: 50,
      verdict: 'flaky',
      stablePassCount: 0,
      stableFailCount: 0,
      flakyCount: 2,
      skippedCount: 0,
      flakyTests: [
        { file: 'test/a.test.js', name: 't1', failureRate: 40 },
        { file: 'test/x.test.js', name: 'tx', failureRate: 80 },
      ],
    },
    {
      timestamp: '2026-11-21T12:00:00.000Z',
      target: 'test/a.test.js',
      framework: 'vitest',
      runs: 5,
      durationMs: 50,
      verdict: 'flaky',
      stablePassCount: 0,
      stableFailCount: 0,
      flakyCount: 2,
      skippedCount: 0,
      flakyTests: [
        { file: './test\\a.test.js', name: 't1', failureRate: 60 },
        { file: 'test/c.test.js', name: 'c_sub', failureRate: 20 },
      ],
    },
    {
      timestamp: '2026-11-21T15:00:00.000Z',
      target: 'test/a.test.js',
      framework: 'vitest',
      runs: 5,
      durationMs: 50,
      verdict: 'flaky',
      stablePassCount: 0,
      stableFailCount: 0,
      flakyCount: 1,
      skippedCount: 0,
      flakyTests: [
        { file: 'test/a.test.js', name: 't1', failureRate: 20 },
      ],
    },
  ]

  const summary = summarizeStability(history, quarantineDoc, { staleDays: 14, topN: 2, now })
  assert.equal(summary.topFlakyTests.length, 2)
  assert.deepEqual(summary.topFlakyTests[0], {
    file: 'test/a.test.js',
    name: 't1',
    occurrences: 3,
    avgFailureRate: 40,
    maxFailureRate: 60,
    lastSeen: '2026-11-21T15:00:00.000Z',
    quarantined: true,
  })
  assert.deepEqual(summary.topFlakyTests[1], {
    file: 'test/x.test.js',
    name: 'tx',
    occurrences: 1,
    avgFailureRate: 80,
    maxFailureRate: 80,
    lastSeen: '2026-11-20T10:00:00.000Z',
    quarantined: false,
  })

  // 陈旧隔离：a (21天) 和 c (lastVerifiedAt 17天) 超 14 天；b (updatedAt 7天) 和 d (刚好 14 天) 不超
  assert.deepEqual(
    summary.staleQuarantined.map(e => ({ ref: formatRef(e), ageDays: e.ageDays })),
    [
      { ref: 'test/a.test.js > t1', ageDays: 21 },
      { ref: 'test/c.test.js', ageDays: 17 },
    ],
  )
})
