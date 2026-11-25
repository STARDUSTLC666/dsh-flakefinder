import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createSubprocessRunner,
  executePlan,
  executePlansBatch,
  FlakeTimeoutError,
  isTimeoutError,
} from '../lib/index.js'

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
  await assert.rejects(
    () => runner.run(['node', '--test', 'x.test.mjs']),
    err => isTimeoutError(err) && /aborted by timeout/.test(err.message),
  )
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

test('createSubprocessRunner 区分超时 FlakeTimeoutError 与宿主取消信号，并透传 lossy 截断标记', async () => {
  // 1. 进程响应 abort 后正常 resolve outcome 时，仍应抛 FlakeTimeoutError
  const timeoutRunner = createSubprocessRunner((spec) => ({
    done: new Promise((resolve) => {
      spec.signal.addEventListener('abort', () => resolve({ exitCode: null, signal: 'SIGTERM' }))
    }),
    collected: {},
    terminate: () => {},
  }), 1000, 30)
  await assert.rejects(() => timeoutRunner.run(['node', '--test']), err => err instanceof FlakeTimeoutError && isTimeoutError(err))

  // 2. 宿主取消信号优先于超时，且原样抛出宿主取消 reason（不是 FlakeTimeoutError）
  const hostController = new AbortController()
  const hostReason = new Error('user cancelled')
  const hostRunner = createSubprocessRunner((spec) => ({
    done: new Promise((_resolve, reject) => {
      spec.signal.addEventListener('abort', () => reject(spec.signal.reason))
    }),
    collected: {},
    terminate: () => {},
  }), 1000, 5000)
  const pending = hostRunner.run(['node', '--test'], { signal: hostController.signal })
  hostController.abort(hostReason)
  await assert.rejects(pending, err => err === hostReason && !isTimeoutError(err))

  // 3. stdout/stderr lossy=true 时设置 truncated=true
  const lossyRunner = createSubprocessRunner(() => ({
    done: Promise.resolve({ exitCode: 0, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: 'ok 1 - a\n', lossy: true }) },
      stderr: { readFrom: () => ({ text: '', lossy: false }) },
    },
    terminate: () => {},
  }), 1000, 5000)
  const lossyRes = await lossyRunner.run(['node', '--test'])
  assert.equal(lossyRes.truncated, true)
})

test('executePlan 捕获单轮超时为结构化记录、清理临时文件，但对宿主取消立即重抛', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-exec-timeout-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const reportPath = path.join(dir, 'partial-report.json')
  await fs.writeFile(reportPath, '{"partial":true}', 'utf8')

  const plan = {
    framework: 'vitest',
    reportKind: 'json',
    reportPath,
    argv: ['fake'],
    label: 'vitest run a.test.ts',
    seed: 777,
    target: 'a.test.ts',
  }
  const timeoutRunner = {
    async run() {
      throw new FlakeTimeoutError(150)
    },
  }
  const run = await executePlan(timeoutRunner, plan, 2, 150, dir)
  assert.equal(run.index, 2)
  assert.equal(run.report, null)
  assert.equal(run.exitCode, null)
  assert.equal(run.timedOut, true)
  assert.equal(run.seed, 777)
  assert.match(run.error ?? '', /单轮测试超时（150ms）/)
  await assert.rejects(fs.access(reportPath), { code: 'ENOENT' }, '超时后必须清理临时报告文件')

  // 宿主取消必须立即重抛并清理临时文件
  await fs.writeFile(reportPath, '{"partial":true}', 'utf8')
  const hostController = new AbortController()
  const hostReason = new Error('abort now')
  const abortRunner = {
    async run(_argv, opts) {
      hostController.abort(hostReason)
      throw opts.signal.reason
    },
  }
  await assert.rejects(
    executePlan(abortRunner, plan, 1, 5000, dir, hostController.signal),
    err => err === hostReason,
  )
  await assert.rejects(fs.access(reportPath), { code: 'ENOENT' })
})

test('executePlan 拒绝超过 8 MiB 的报告并清理稀疏临时文件', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-report-limit-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const reportPath = path.join(dir, 'oversized-report.json')
  await fs.writeFile(reportPath, '{}', 'utf8')
  await fs.truncate(reportPath, 8 * 1024 * 1024 + 1)

  const plan = {
    framework: 'vitest',
    reportKind: 'json',
    reportPath,
    argv: ['fake'],
    label: 'fixture',
    target: 'fixture.test.mjs',
  }
  const run = await executePlan({
    async run() {
      return { exitCode: 0, signal: null, stdout: '', stderr: '' }
    },
  }, plan, 1, 5000, dir)

  assert.equal(run.report, null)
  assert.match(run.error ?? '', /超过 8 MiB/)
  await assert.rejects(fs.access(reportPath), { code: 'ENOENT' }, '超限报告必须清理')
})

test('executePlansBatch 并发池按 index 有序输出且限制最大并发', async () => {
  const plans = Array.from({ length: 5 }, (_, i) => ({
    framework: 'node',
    reportKind: 'tap',
    reportPath: '',
    argv: ['fake', String(i + 1)],
    label: 'run ' + String(i + 1),
    target: 'sample.test.mjs',
  }))
  const delays = [60, 10, 40, 5, 20]
  let active = 0
  let peak = 0
  const runner = {
    async run(argv) {
      const idx = Number(argv[1]) - 1
      active += 1
      if (active > peak) peak = active
      await new Promise(resolve => setTimeout(resolve, delays[idx]))
      active -= 1
      return { exitCode: 0, signal: null, stdout: 'TAP version 13\nok 1 - t1\n1..1\n', stderr: '' }
    },
  }
  const runs = await executePlansBatch(runner, plans, { timeoutMs: 5000, concurrency: 3, mode: 'full' })
  assert.equal(runs.length, 5)
  assert.deepEqual(runs.map(r => r.index), [1, 2, 3, 4, 5])
  assert.ok(peak > 1 && peak <= 3, '并发峰值应在 2..3 之间，实际：' + String(peak))
})

test('executePlansBatch verify-fix 首次失败立即停止派发并中止在飞兄弟任务', async () => {
  const plans = Array.from({ length: 5 }, (_, i) => ({
    framework: 'node',
    reportKind: 'tap',
    reportPath: '',
    argv: ['fake', String(i + 1)],
    label: 'run ' + String(i + 1),
    target: 'sample.test.mjs',
  }))
  const started = []
  let abortedSiblings = 0
  const runner = {
    async run(argv, opts) {
      const idx = Number(argv[1])
      started.push(idx)
      if (idx === 1) {
        await new Promise(resolve => setTimeout(resolve, 15))
        return { exitCode: 1, signal: null, stdout: 'TAP version 13\nnot ok 1 - t1\n1..1\n', stderr: '' }
      }
      // 兄弟任务原本会跑 5 秒，应被早停信号立即中止
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5000)
        opts.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          abortedSiblings += 1
          reject(opts.signal.reason)
        })
      })
      return { exitCode: 0, signal: null, stdout: 'TAP version 13\nok 1 - t1\n1..1\n', stderr: '' }
    },
  }
  const t0 = Date.now()
  const runs = await executePlansBatch(runner, plans, { timeoutMs: 5000, concurrency: 2, mode: 'verify-fix' })
  assert.ok(Date.now() - t0 < 1000, '早停不应等待 5 秒兄弟任务')
  assert.equal(runs.length, 1)
  assert.equal(runs[0].index, 1)
  assert.equal(runs[0].report.success, false)
  assert.equal(abortedSiblings, 1)
  assert.deepEqual(started, [1, 2], '第 3-5 轮绝不应派发')
})

test('executePlansBatch until-flaky 在出现一过一挂或单用例状态翻转时早停', async () => {
  const plans = Array.from({ length: 5 }, (_, i) => ({
    framework: 'node',
    reportKind: 'tap',
    reportPath: '',
    argv: ['fake', String(i + 1)],
    label: 'run ' + String(i + 1),
    target: 'sample.test.mjs',
  }))

  // 场景 A：第 1 轮过、第 2 轮挂 -> 立刻停，不跑第 3-5 轮
  let callsA = 0
  const runnerA = {
    async run() {
      callsA += 1
      const ok = callsA === 1
      return { exitCode: ok ? 0 : 1, signal: null, stdout: ok ? 'ok 1 - a\n1..1\n' : 'not ok 1 - a\n1..1\n', stderr: '' }
    },
  }
  const runsA = await executePlansBatch(runnerA, plans, { timeoutMs: 5000, concurrency: 1, mode: 'until-flaky' })
  assert.equal(callsA, 2)
  assert.equal(runsA.length, 2)

  // 场景 B：每轮都有稳定失败用例导致 passRuns=0，但用例 b 在第 1 轮过、第 2 轮挂 -> 同样早停！
  let callsB = 0
  const runnerB = {
    async run() {
      callsB += 1
      const tap = callsB === 1
        ? 'not ok 1 - always_bad\nok 2 - flaky_b\n1..2\n'
        : 'not ok 1 - always_bad\nnot ok 2 - flaky_b\n1..2\n'
      return { exitCode: 1, signal: null, stdout: tap, stderr: '' }
    },
  }
  const runsB = await executePlansBatch(runnerB, plans, { timeoutMs: 5000, concurrency: 1, mode: 'until-flaky' })
  assert.equal(callsB, 2)
  assert.equal(runsB.length, 2)
})

test('executePlansBatch 宿主取消信号立即中止所有 worker 并重抛', async () => {
  const plans = Array.from({ length: 4 }, (_, i) => ({
    framework: 'node',
    reportKind: 'tap',
    reportPath: '',
    argv: ['fake', String(i + 1)],
    label: 'run ' + String(i + 1),
    target: 'sample.test.mjs',
  }))
  const hostController = new AbortController()
  const hostReason = new Error('stop batch')
  const runner = {
    async run(_argv, opts) {
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => reject(opts.signal.reason))
      })
    },
  }
  const pending = executePlansBatch(runner, plans, {
    timeoutMs: 5000,
    concurrency: 2,
    mode: 'full',
    signal: hostController.signal,
  })
  setTimeout(() => hostController.abort(hostReason), 15)
  await assert.rejects(pending, err => err === hostReason)
})
