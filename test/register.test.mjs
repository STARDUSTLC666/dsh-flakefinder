import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, detectEnvironment, listAdapters, resolvePythonPath } from '../lib/index.js'

test('index 导出 adapters 核心符号', () => {
  assert.equal(typeof listAdapters, 'function')
  assert.equal(typeof detectEnvironment, 'function')
  assert.equal(typeof resolvePythonPath, 'function')
  assert.deepEqual(listAdapters().map(a => a.id), ['vitest', 'jest', 'pytest', 'node'])
})

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

test('writeApproval 通过 alpha.4 tools/pre-execute 返回 ask，空参数退回默认文案', async () => {
  const definitions = []
  const listeners = new Map()
  const ctx = {
    get(name) { return name === 'approval' ? { config: { policy: 'ask' } } : undefined },
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

test('writeApproval 审批弹窗 reason 展示完整测试列表与隔离原因', async () => {
  const listeners = new Map()
  const ctx = {
    get(name) { return name === 'approval' ? { config: { policy: 'ask' } } : undefined },
    subprocess: { spawn: async () => ({}) },
    tools: { register() { return () => {} } },
    on(event, listener, options) { listeners.set(event, { listener, options }) },
  }
  apply(ctx, { writeApproval: true })
  const gate = listeners.get('tools/pre-execute').listener

  const qRes = await gate({
    name: 'flaky_quarantine',
    arguments: {
      tests: ['test/a.test.mjs > case 1', 'test/b.test.mjs > case 2'],
      reason: '定时器竞态',
      issue: '#42',
    },
  }, async () => 'next')
  assert.equal(qRes.kind, 'ask')
  assert.match(qRes.reason, /2 条测试用例写入/)
  assert.match(qRes.reason, /test\/a\.test\.mjs > case 1/)
  assert.match(qRes.reason, /test\/b\.test\.mjs > case 2/)
  assert.match(qRes.reason, /原因：定时器竞态/)
  assert.match(qRes.reason, /关联：#42/)

  const cRes = await gate({
    name: 'flaky_clear',
    arguments: { tests: ['test/a.test.mjs > case 1'] },
  }, async () => 'next')
  assert.equal(cRes.kind, 'ask')
  assert.match(cRes.reason, /1 条测试用例/)
  assert.match(cRes.reason, /test\/a\.test\.mjs > case 1/)
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
