import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

test('apply 注册六个工具并按 dispose 清理', () => {
  const names = []
  const disposed = []
  const listeners = new Map()
  const ctx = {
    subprocess: {
      spawn: async () => {
        throw new Error('测试里不应真正 spawn')
      },
    },
    tools: {
      register(definition) {
        names.push(definition.name)
        return () => { disposed.push(definition.name) }
      },
    },
    get(name) { return name === 'approval' ? undefined : undefined },
    on(event, listener) { listeners.set(event, listener) },
  }
  apply(ctx, { writeApproval: false })
  assert.deepEqual(names, ['flaky_detect', 'flaky_history', 'flaky_quarantine', 'flaky_clear', 'flaky_report', 'flaky_health'])
  const dispose = listeners.get('dispose')
  assert.equal(typeof dispose, 'function')
  dispose()
  assert.equal(disposed.length, 6)
})

test('writeApproval 通过 alpha.4 tools/pre-execute 返回 ask', async () => {
  const definitions = []
  const listeners = new Map()
  const ctx = {
    subprocess: { spawn: async () => ({}) },
    tools: { register(definition) { definitions.push(definition); return () => {} } },
    on(event, listener, options) { listeners.set(event, { listener, options }) },
  }
  apply(ctx, { writeApproval: true })
  assert.ok(definitions.every(definition => !('gate' in definition)))
  const entry = listeners.get('tools/pre-execute')
  assert.equal(entry.options.prepend, true)
  assert.deepEqual(await entry.listener({ name: 'flaky_quarantine', arguments: {} }, async () => 'next'), {
    kind: 'ask',
    reason: '把测试用例写入 .flakefinder.json 隔离清单',
  })
  assert.deepEqual(await entry.listener({ name: 'flaky_clear', arguments: {} }, async () => 'next'), {
    kind: 'ask',
    reason: '从 .flakefinder.json 隔离清单移除测试用例',
  })
  assert.equal(await entry.listener({ name: 'flaky_report', arguments: {} }, async () => 'next'), 'next')
})

test('配置非法时退回默认配置并告警', () => {
  const names = []
  const ctx = {
    subprocess: { spawn: async () => ({}) },
    tools: { register(definition) { names.push(definition.name); return () => {} } },
    get() { return undefined },
    on() {},
  }
  apply(ctx, { timeoutMs: -1 })
  assert.equal(names.length, 6)
})
