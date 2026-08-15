import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

test('apply 注册五个工具并按 dispose 清理', () => {
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
  assert.deepEqual(names, ['flaky_detect', 'flaky_history', 'flaky_quarantine', 'flaky_clear', 'flaky_report'])
  const dispose = listeners.get('dispose')
  assert.equal(typeof dispose, 'function')
  dispose()
  assert.equal(disposed.length, 5)
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
  assert.equal(names.length, 5)
})
