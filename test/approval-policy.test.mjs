import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'
function host(policy, writeApproval = true) {
  const events = new Map()
  apply({ get: name => name === 'approval' && policy ? { config: { policy } } : undefined,
    subprocess: { spawn: () => { throw Error('A gate must not launch processes') } },
    tools: { register: () => () => {} }, on: (name, fn) => { events.set(name, fn); return () => {} },
  }, { writeApproval })
  return events.get('tools/pre-execute')
}
test('Flakefinder 隔离与清除在 never 下明确拒绝，保留下游拒绝', async () => {
  for (const name of ['flaky_quarantine', 'flaky_clear']) {
    const gate = host('never'), exec = { name, arguments: { tests: ['owned.spec.ts'] } }
    const result = await gate(exec, async () => ({ kind: 'allow' }))
    assert.equal(result.kind, 'deny'); assert.match(result.reason, /never.*writeApproval=false/s)
    const denied = { kind: 'deny', reason: 'Host denied' }; assert.equal(await gate(exec, async () => denied), denied)
    assert.equal((await host('ask')(exec, async () => ({ kind: 'allow' }))).kind, 'ask')
  }
})
test('Flakefinder 未知策略保守拒绝；关闭审批及只读工具不增加确认', async () => {
  assert.equal((await host()({ name: 'flaky_clear' }, async () => ({ kind: 'allow' }))).kind, 'deny')
  assert.equal(host('never', false), undefined)
  const next = { kind: 'allow' }; assert.equal(await host('never')({ name: 'flaky_report' }, async () => next), next)
})
