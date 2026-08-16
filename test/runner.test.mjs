import test from 'node:test'
import assert from 'node:assert/strict'
import { createSubprocessRunner } from '../lib/index.js'

test('createSubprocessRunner 超时真正触发 AbortSignal', async () => {
  let observed
  let abortReject
  const done = new Promise((_resolve, reject) => { abortReject = reject })
  const spawn = (spec) => {
    observed = spec
    spec.signal.addEventListener('abort', () => abortReject(new Error('aborted by timeout')))
    return {
      done,
      collected: { stdout: { readFrom: () => ({ text: '' }) }, stderr: { readFrom: () => ({ text: '' }) } },
      terminate: () => {},
    }
  }
  const runner = createSubprocessRunner(spawn, 1000, 40)
  await assert.rejects(() => runner.run(['node', '--test', 'x.test.mjs']), /aborted by timeout/)
  assert.equal(observed.graceMs, 1000)
  assert.deepEqual(observed.argv, ['node', '--test', 'x.test.mjs'])
})

test('createSubprocessRunner 正常结束收集 stdout/stderr', async () => {
  const spawn = () => ({
    done: Promise.resolve({ exitCode: 0, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: 'TAP ok' }) },
      stderr: { readFrom: () => ({ text: 'warn' }) },
    },
    terminate: () => {},
  })
  const runner = createSubprocessRunner(spawn, 1000, 5000)
  const result = await runner.run(['node', '--version'])
  assert.deepEqual(result, { exitCode: 0, signal: null, stdout: 'TAP ok', stderr: 'warn' })
})
