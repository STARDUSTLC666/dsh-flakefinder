/**
 * 进程执行层：复用 dsh-docker 同款 subprocess 包装，并按计划读取 JSON / JUnit / TAP 报告。
 * 支持单轮超时错误区分、4MB 截断检测、以及受控并发与早停批次调度。
 *
 * @module dsh-flakefinder/runner
 */

import fs from 'node:fs/promises'
import type { TestPlan } from './args.js'
import type { DetectMode } from './config.js'
import { parseJsonReport, parseJunitReport, parseTapReport, type NormalizedRun } from './parse.js'

export interface RunResult {
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  truncated?: boolean
}

export interface ProcessRunner {
  run(argv: readonly string[], options?: { timeoutMs?: number; cwd?: string; signal?: AbortSignal }): Promise<RunResult>
}

export interface SubprocessHandleLike {
  done: Promise<{ exitCode: number | null; signal: string | null }>
  collected: {
    stdout?: { readFrom(offset: number): { text: string; lossy?: boolean } }
    stderr?: { readFrom(offset: number): { text: string; lossy?: boolean } }
  }
  terminate(): void
}

export interface SubprocessSpawnLike {
  (spec: {
    argv: readonly string[]
    cwd: string
    stdio: { stdin: 'ignore'; stdout: { maxBytes: number }; stderr: { maxBytes: number } }
    graceMs: number
    signal?: AbortSignal
  }): SubprocessHandleLike
}

/** 单轮测试运行超时错误，与宿主 AbortSignal 取消严格区分。 */
export class FlakeTimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number, message?: string) {
    super(message ?? '单轮测试超时（' + String(timeoutMs) + 'ms）')
    this.name = 'FlakeTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/** 判断错误是否为单轮测试超时错误。 */
export function isTimeoutError(error: unknown): error is FlakeTimeoutError {
  return error instanceof FlakeTimeoutError || (error instanceof Error && error.name === 'FlakeTimeoutError')
}

const COLLECT_BYTES = 4 * 1024 * 1024
const MAX_REPORT_BYTES = 8 * 1024 * 1024

interface BoundedReport {
  text: string
  error?: string
}

/** Read a reporter file without trusting its type or allocating an unbounded buffer. */
async function readBoundedReport(reportPath: string): Promise<BoundedReport> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    const linkInfo = await fs.lstat(reportPath)
    if (!linkInfo.isFile() || linkInfo.isSymbolicLink()) {
      return { text: '', error: '报告路径不是普通文件，已拒绝读取。' }
    }

    handle = await fs.open(reportPath, 'r')
    const info = await handle.stat()
    if (!info.isFile()) return { text: '', error: '报告路径不是普通文件，已拒绝读取。' }
    if (info.dev !== linkInfo.dev || info.ino !== linkInfo.ino) {
      return { text: '', error: '报告文件在校验期间发生变化，已拒绝读取。' }
    }
    if (info.size > MAX_REPORT_BYTES) {
      return { text: '', error: '报告文件超过 8 MiB 大小上限，结果不完整，已拒绝解析。' }
    }

    const chunks: Buffer[] = []
    let total = 0
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_REPORT_BYTES + 1 - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) break
      total += bytesRead
      if (total > MAX_REPORT_BYTES) {
        return { text: '', error: '报告文件超过 8 MiB 大小上限，结果不完整，已拒绝解析。' }
      }
      chunks.push(bytesRead === chunk.length ? chunk : chunk.subarray(0, bytesRead))
    }
    return { text: Buffer.concat(chunks, total).toString('utf8') }
  } catch (error) {
    return { text: '', error: error instanceof Error ? error.message : String(error) }
  } finally {
    await handle?.close().catch(() => {})
  }
}

/** 用 DSH subprocess 服务构造 ProcessRunner。 */
export function createSubprocessRunner(spawn: SubprocessSpawnLike, graceMs: number, defaultTimeoutMs: number): ProcessRunner {
  return {
    async run(argv, options) {
      const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs
      const hostSignal = options?.signal
      hostSignal?.throwIfAborted()

      const controller = new AbortController()
      const signal = hostSignal ? AbortSignal.any([hostSignal, controller.signal]) : controller.signal
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort(new FlakeTimeoutError(timeoutMs))
      }, timeoutMs)

      let handle: SubprocessHandleLike
      try {
        handle = spawn({
          argv,
          cwd: options?.cwd ?? process.cwd(),
          stdio: {
            stdin: 'ignore',
            stdout: { maxBytes: COLLECT_BYTES },
            stderr: { maxBytes: COLLECT_BYTES },
          },
          graceMs,
          signal,
        })
        const outcome = await handle.done
        if (hostSignal?.aborted) {
          throw hostSignal.reason
        }
        if (timedOut || controller.signal.aborted) {
          throw isTimeoutError(controller.signal.reason)
            ? controller.signal.reason
            : new FlakeTimeoutError(timeoutMs)
        }
        const stdoutChunk = handle.collected.stdout?.readFrom(0)
        const stderrChunk = handle.collected.stderr?.readFrom(0)
        const stdout = stdoutChunk?.text ?? ''
        const stderr = stderrChunk?.text ?? ''
        const truncated = stdoutChunk?.lossy === true || stderrChunk?.lossy === true
        return {
          exitCode: outcome.exitCode,
          signal: outcome.signal,
          stdout,
          stderr,
          ...(truncated ? { truncated: true } : {}),
        }
      } catch (error) {
        if (hostSignal?.aborted) {
          throw hostSignal.reason ?? error
        }
        if (timedOut || controller.signal.aborted) {
          if (isTimeoutError(error)) throw error
          const detail = error instanceof Error && error.message !== '' ? '：' + error.message : ''
          throw new FlakeTimeoutError(timeoutMs, '单轮测试超时（' + String(timeoutMs) + 'ms）' + detail)
        }
        throw error
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

export interface FlakeRun {
  index: number
  report: NormalizedRun | null
  durationMs: number
  exitCode: number | null
  stderr: string
  timedOut?: boolean
  truncated?: boolean
  seed?: number
  error?: string
}

export interface BatchOptions {
  timeoutMs: number
  cwd?: string
  signal?: AbortSignal
  concurrency?: number
  mode?: DetectMode
}

function stderrTail(stderr: string): string {
  const tail = stderr.trim().split(/\r?\n/).slice(-5).join(' | ')
  return tail || '无错误输出'
}

async function cleanupReportFile(reportPath: string): Promise<void> {
  if (reportPath !== '') {
    await fs.rm(reportPath, { force: true }).catch(() => {})
  }
}

/** 执行一个测试计划并读取报告；进程失败但报告存在时仍返回报告，单轮超时返回结构化超时记录。 */
export async function executePlan(
  runner: ProcessRunner,
  plan: TestPlan,
  index: number,
  timeoutMs: number,
  cwd?: string,
  signal?: AbortSignal,
): Promise<FlakeRun> {
  const started = Date.now()
  signal?.throwIfAborted()
  const seedField = plan.seed !== undefined ? { seed: plan.seed } : {}

  let result: RunResult
  try {
    result = await runner.run(plan.argv, { timeoutMs, cwd, signal })
  } catch (error) {
    await cleanupReportFile(plan.reportPath)
    if (signal?.aborted) {
      throw signal.reason ?? error
    }
    if (isTimeoutError(error)) {
      return {
        index,
        report: null,
        durationMs: Date.now() - started,
        exitCode: null,
        stderr: '',
        timedOut: true,
        ...seedField,
        error: '单轮测试超时（' + String(timeoutMs) + 'ms）',
      }
    }
    throw error
  }

  if (signal?.aborted) {
    await cleanupReportFile(plan.reportPath)
    throw signal.reason
  }

  const durationMs = Date.now() - started
  const truncatedField = result.truncated === true ? { truncated: true } : {}

  const completed = (report: NormalizedRun, forceTruncatedFailure = false): FlakeRun => {
    // A reporter can finish before teardown crashes or the process is killed.
    // Keep its assertions, but never turn that process outcome into a pass.
    const unexpectedExit = report.failed === 0 && (result.exitCode !== 0 || result.signal !== null)
    const errors: string[] = []
    if (forceTruncatedFailure) {
      errors.push('TAP 测试输出超过 4MB 采集上限被截断，结果不完整，不能判定为稳定通过。')
    }
    if (unexpectedExit) {
      errors.push('测试进程异常结束（退出码 ' + String(result.exitCode ?? 'null') + (result.signal ? '，信号 ' + result.signal : '') + '）；stderr：' + stderrTail(result.stderr))
    }
    const failedOutcome = forceTruncatedFailure || unexpectedExit
    return {
      index,
      report: failedOutcome ? { ...report, success: false } : report,
      durationMs,
      exitCode: result.exitCode,
      stderr: result.stderr,
      ...(forceTruncatedFailure ? { truncated: true } : {}),
      ...seedField,
      ...(errors.length > 0 ? { error: errors.join('；') } : {}),
    }
  }

  if (plan.reportKind === 'tap') {
    const parsed = parseTapReport(result.stdout, { cwd, target: plan.target })
    return completed(parsed, result.truncated === true)
  }

  let fileText = ''
  let fileError = ''
  try {
    const bounded = await readBoundedReport(plan.reportPath)
    fileText = bounded.text
    fileError = bounded.error ?? ''
  } catch (error) {
    fileError = error instanceof Error ? error.message : String(error)
  } finally {
    await cleanupReportFile(plan.reportPath)
  }

  if (fileText.trim() === '') {
    const truncNote = result.truncated === true ? '（测试输出超过 4MB 被截断）' : ''
    return {
      index,
      report: null,
      durationMs,
      exitCode: result.exitCode,
      stderr: result.stderr,
      ...truncatedField,
      ...seedField,
      error: plan.framework + ' 测试报告不可用，结果不完整，本轮判定失败：' + (fileError || '报告文件为空') + truncNote + '。进程退出码：' + String(result.exitCode ?? 'null') + '；stderr：' + stderrTail(result.stderr),
    }
  }

  try {
    const parsed = plan.reportKind === 'junit'
      ? parseJunitReport(fileText, cwd)
      : parseJsonReport(fileText, plan.framework, cwd)
    return completed(parsed, false)
  } catch (error) {
    return {
      index,
      report: null,
      durationMs,
      exitCode: result.exitCode,
      stderr: result.stderr,
      ...truncatedField,
      ...seedField,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function isRunFailure(run: FlakeRun): boolean {
  return run.timedOut === true || run.error !== undefined || run.report === null || run.report.success !== true
}

const EARLY_STOP_SENTINEL = new Error('flakefinder early stop')

/**
 * 批量执行多个测试计划：支持 1-4 路并发 worker 池，以及 verify-fix / until-flaky 早停模式。
 * 返回结果始终按 1-based `index` 升序排列；宿主 signal 取消时立刻中止并抛出取消原因。
 */
export async function executePlansBatch(
  runner: ProcessRunner,
  plans: readonly TestPlan[],
  options: BatchOptions,
): Promise<FlakeRun[]> {
  const hostSignal = options.signal
  hostSignal?.throwIfAborted()
  if (plans.length === 0) return []

  const concurrency = Math.min(4, Math.max(1, Math.round(options.concurrency ?? 1)))
  const mode: DetectMode = options.mode ?? 'full'
  const workerCount = Math.min(concurrency, plans.length)
  const needsInternalAbort = workerCount > 1 || mode !== 'full'

  const internalController = needsInternalAbort ? new AbortController() : undefined
  const batchSignal = internalController !== undefined
    ? (hostSignal ? AbortSignal.any([hostSignal, internalController.signal]) : internalController.signal)
    : hostSignal

  let nextCursor = 0
  let earlyStopped = false
  let fatalError: unknown = undefined
  let hasFatalError = false

  let sawPassRun = false
  let sawFailRun = false
  let sawFlakyTest = false
  const testOutcomes = new Map<string, { passed: boolean; failed: boolean }>()

  const results: FlakeRun[] = []

  function recordOutcomeAndCheckStop(run: FlakeRun): void {
    if (isRunFailure(run)) sawFailRun = true
    else sawPassRun = true

    if (run.report !== null) {
      for (const test of run.report.tests) {
        if (test.status !== 'passed' && test.status !== 'failed') continue
        let state = testOutcomes.get(test.id)
        if (state === undefined) {
          state = { passed: false, failed: false }
          testOutcomes.set(test.id, state)
        }
        if (test.status === 'passed') state.passed = true
        else state.failed = true
        if (state.passed && state.failed) sawFlakyTest = true
      }
    }

    if (mode === 'verify-fix' && sawFailRun) {
      earlyStopped = true
      internalController?.abort(EARLY_STOP_SENTINEL)
    } else if (mode === 'until-flaky' && ((sawPassRun && sawFailRun) || sawFlakyTest)) {
      earlyStopped = true
      internalController?.abort(EARLY_STOP_SENTINEL)
    }
  }

  async function worker(): Promise<void> {
    while (true) {
      if (hostSignal?.aborted || earlyStopped || hasFatalError) return
      const pos = nextCursor
      if (pos >= plans.length) return
      nextCursor += 1

      const plan = plans[pos]!
      try {
        const run = await executePlan(runner, plan, pos + 1, options.timeoutMs, options.cwd, batchSignal)
        if (hostSignal?.aborted) return
        results.push(run)
        recordOutcomeAndCheckStop(run)
      } catch (error) {
        if (hostSignal?.aborted) return
        if (earlyStopped && (internalController?.signal.aborted ?? false)) return
        if (!hasFatalError) {
          hasFatalError = true
          fatalError = error
          internalController?.abort(error)
        }
        return
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  if (hostSignal?.aborted) {
    throw hostSignal.reason
  }
  if (hasFatalError) {
    throw fatalError
  }

  results.sort((a, b) => a.index - b.index)
  return results
}
