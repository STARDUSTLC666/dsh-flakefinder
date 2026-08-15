import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createStore, parseRef, formatRef } from '../lib/store.js'

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
