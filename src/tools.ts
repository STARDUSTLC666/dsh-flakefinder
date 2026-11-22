/**
 * 六个面向模型的测试稳定性工具：
 * flaky_detect / flaky_history / flaky_quarantine / flaky_clear / flaky_report / flaky_health。
 *
 * @module dsh-flakefinder/tools
 */

import crypto from 'node:crypto'
import { resolve } from 'node:path'
import {
  buildPlan,
  detectEnvironment,
  readFramework,
  type Framework,
  type PythonPathSource,
} from './adapters.js'
import {
  aggregate,
  flakyTests,
  patternLabel,
  redactSecrets,
  type DetectionResult,
  type TestRecord,
  type TimelineSymbol,
} from './classify.js'
import {
  assertTarget,
  optionalBoolean,
  optionalInteger,
  optionalSeed,
  optionalString,
  readDetectMode,
  requiredString,
  resolveConcurrency,
  resolveRuns,
  type DetectMode,
  type ResolvedFlakeConfig,
} from './config.js'
import { executePlansBatch, type FlakeRun, type ProcessRunner } from './runner.js'
import {
  annotateTestsWithQuarantine,
  createStore,
  formatRef,
  parseRef,
  summarizeStability,
  type HistoryEntry,
  type HistoryScope,
  type QuarantineAnnotation,
  type QuarantineDocument,
  type Store,
} from './store.js'

export interface ContentBlock {
  type: 'text'
  text: string
}

export interface FlakeToolDefinition {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  output: {
    schema: Record<string, unknown>
    render(args: unknown, value: unknown): ContentBlock[]
  }
  isConcurrencySafe?(args?: unknown): boolean
  execute(args: unknown, exec?: unknown): Promise<unknown>
  timeoutMs?: number
}

interface InvocationContext {
  cwd: string
  signal?: AbortSignal
  runner: ProcessRunner
  store: Store
}

const MAX_SEED = 2147483647
const MAX_UNTRUNCATED_TESTS = 60
const MAX_STABLE_PASS_WHEN_TRUNCATED = 20

function compileParameters(spec: Record<string, any>): { type: 'object'; properties: Record<string, unknown>; required?: string[] } {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, prop] of Object.entries(spec)) {
    if (prop?.required === true) required.push(key)
    const node: Record<string, unknown> = {}
    if (typeof prop?.type === 'string') node.type = prop.type
    if (typeof prop?.description === 'string') node.description = prop.description
    if (typeof prop?.items === 'string') node.items = { type: prop.items }
    if (Array.isArray(prop?.enum) && prop.enum.length > 0) node.enum = [...prop.enum]
    properties[key] = node
  }
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function resolveInvocation(
  exec: unknown,
  cfg: ResolvedFlakeConfig,
  baseRunner: ProcessRunner,
  baseStore: Store,
): InvocationContext {
  const context = exec as { signal?: AbortSignal; agent?: { session?: { header?: { cwd?: string } } } } | undefined
  const signal = context?.signal
  signal?.throwIfAborted()
  const rawSessionCwd = context?.agent?.session?.header?.cwd
  const sessionCwd = typeof rawSessionCwd === 'string' && rawSessionCwd.trim() !== '' ? rawSessionCwd.trim() : undefined
  const cwd = sessionCwd ?? process.cwd()
  const scopedStore = sessionCwd !== undefined
    ? createStore(
      cfg.dataDir,
      cfg.quarantineFileRelative !== undefined ? resolve(sessionCwd, cfg.quarantineFileRelative) : cfg.quarantineFile,
      { workspace: sessionCwd },
    )
    : baseStore
  const scopedRunner: ProcessRunner = {
    run: (argv, options) => baseRunner.run(argv, {
      ...options,
      cwd: options?.cwd ?? cwd,
      signal: options?.signal ?? signal,
    }),
  }
  return { cwd, signal, runner: scopedRunner, store: scopedStore }
}

function parseRefList(args: Record<string, unknown>): Array<{ file: string; name: string | null }> {
  const raw = args.tests
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('tests 为必填数组，至少包含一个测试引用。')
  if (raw.length > 100) throw new Error('tests 一次最多 100 条，请分批处理。')
  return raw.map(item => {
    if (typeof item !== 'string') throw new Error('tests 数组里的每一项必须是字符串，格式：文件路径，或 "文件路径 > 用例名"。')
    return parseRef(item)
  })
}

function readScope(raw: unknown): HistoryScope {
  if (raw === undefined || raw === null) return 'workspace'
  if (raw === 'workspace' || raw === 'all') return raw
  throw new Error('scope 只支持 workspace / all，收到：' + String(raw))
}

function optionalFailureRate(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('失败率（参数 ' + key + '）必须是 0-100 之间的数字。')
  }
  return Math.round(value * 10) / 10
}

function pickDistinctSeeds(count: number): number[] {
  const used = new Set<number>()
  const seeds: number[] = []
  while (seeds.length < count) {
    const candidate = crypto.randomInt(1, MAX_SEED)
    if (!used.has(candidate)) {
      used.add(candidate)
      seeds.push(candidate)
    }
  }
  return seeds
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case 'stable-pass': return '稳定通过'
    case 'stable-fail': return '稳定失败'
    case 'flaky': return '不稳定（flaky）'
    case 'skipped': return '全部跳过'
    case 'empty': return '空结果'
    default: return verdict
  }
}

function formatTimeline(timeline: readonly TimelineSymbol[]): string {
  return timeline.map(symbol => {
    switch (symbol) {
      case 'P': return '✓'
      case 'F': return '✗'
      case 'T': return '⏱'
      case 'S': return 'S'
      case '-': return '-'
    }
  }).join('')
}

function formatStackSnippet(stack: string, maxLines = 5): string[] {
  const lines = stack.split(/\r?\n/).filter(line => line.trim() !== '')
  if (lines.length <= maxLines) return lines
  return [...lines.slice(0, maxLines), '…（共 ' + String(lines.length) + ' 行，完整精简堆栈见 payload）']
}

function pythonSourceLabel(source: PythonPathSource): string {
  switch (source) {
    case 'explicit': return '显式配置'
    case 'virtual-env': return 'VIRTUAL_ENV'
    case 'workspace-venv': return '工作区虚拟环境'
    case 'default': return '默认命令'
  }
}

interface SummarySubject {
  target: string
  framework: string
  plannedRuns: number
  testName?: string
  mode: DetectMode
  concurrency: number
  shuffle: boolean
  explicitSeed?: number
  annotation?: QuarantineAnnotation<TestRecord>
  quarantineWarning?: string
  omittedStablePassCount?: number
}

function isSyntheticTest(test: Pick<TestRecord, 'file'>): boolean {
  return test.file === '(crash)' || test.file === '(timeout)'
}

function formatClusterMessage(cluster: { type?: string; message: string }): string {
  const type = cluster.type?.trim()
  if (type === undefined || type === '') return cluster.message
  if (cluster.message.startsWith(type + ':') || cluster.message.startsWith(type + ' ')) {
    return cluster.message
  }
  return type + ': ' + cluster.message
}

function renderTestDiagnostics(
  test: TestRecord,
  options?: { quarantineTag?: string },
): string[] {
  const lines: string[] = []
  const tag = options?.quarantineTag ? ' ' + options.quarantineTag : ''
  const seen = test.passes + test.failures
  const tl = formatTimeline(test.timeline)
  lines.push(
    '- ' + formatRef(test) + tag
    + '（失败率 ' + String(test.failureRate) + '%，' + String(test.failures) + '/' + String(seen)
    + '，时间线：' + tl + '）',
  )
  if (test.passDurationAvgMs !== null && test.failDurationAvgMs !== null) {
    lines.push(
      '  耗时：通过均 ' + String(test.passDurationAvgMs) + 'ms / 失败均 ' + String(test.failDurationAvgMs)
      + 'ms（P95 ' + String(test.p95DurationMs) + 'ms，最大 ' + String(test.maxDurationMs) + 'ms）',
    )
  } else if (test.failDurationAvgMs !== null && test.maxDurationMs > 0) {
    lines.push('  耗时：失败均 ' + String(test.failDurationAvgMs) + 'ms（最大 ' + String(test.maxDurationMs) + 'ms）')
  }
  if (test.patterns.length > 0) {
    lines.push('  模式：' + test.patterns.map(patternLabel).join('；'))
  }
  if (test.failedSeeds !== undefined && test.failedSeeds.length > 0) {
    lines.push('  失败种子：' + test.failedSeeds.join(', '))
  }
  for (const cluster of test.errorClusters.slice(0, 3)) {
    const runList = cluster.runIndices.map(i => '#' + String(i)).join(',')
    lines.push('  错误 [' + String(cluster.count) + '次，轮次 ' + runList + ']：' + formatClusterMessage(cluster))
    if (cluster.sampleStack) {
      for (const stackLine of formatStackSnippet(cluster.sampleStack, 5)) {
        lines.push('    ' + stackLine)
      }
    }
  }
  if (test.errorClusters.length > 3) {
    lines.push('  …其余 ' + String(test.errorClusters.length - 3) + ' 类错误见 payload')
  }
  return lines
}

function resultSummary(result: DetectionResult, runs: FlakeRun[] = [], subject?: SummarySubject): string {
  const lines: string[] = []
  if (subject !== undefined) {
    const meta = ['framework=' + subject.framework]
    if (subject.testName !== undefined) meta.push('testName=' + subject.testName)
    if (subject.mode !== 'full') meta.push('mode=' + subject.mode)
    if (subject.concurrency > 1) meta.push('concurrency=' + String(subject.concurrency))
    if (subject.shuffle) meta.push('shuffle=true')
    if (subject.explicitSeed !== undefined) meta.push('seed=' + String(subject.explicitSeed))
    lines.push('目标：' + subject.target + '（' + meta.join('，') + '）')
  }

  const actualRuns = result.runs.length
  const plannedRuns = subject?.plannedRuns ?? actualRuns
  const runNote = actualRuns < plannedRuns
    ? '实际运行 ' + String(actualRuns) + '/' + String(plannedRuns) + ' 次（' + String(subject?.mode ?? 'early-stop') + ' 提前结束）'
    : '重复运行：' + String(actualRuns) + ' 次'

  lines.push(
    '判定：' + verdictLabel(result.verdict),
    runNote + '；总耗时：' + String(Math.round(result.durationMs / 100) / 10) + ' 秒',
    '稳定通过：' + String(result.stablePassCount) + '；稳定失败：' + String(result.stableFailCount) + '；flaky：' + String(result.flakyCount) + '；跳过：' + String(result.skippedCount),
  )

  if (result.verdict === 'stable-pass' && result.confidence95MaxFlakeRate !== undefined) {
    const tip = actualRuns < 10 ? ' 建议提高 runs（例如 10-20 次）以获得更高稳定性置信度。' : ''
    lines.push('置信度提示：连续 ' + String(actualRuns) + ' 次全通过，95% 置信下残余偶发率 ≤ ' + String(result.confidence95MaxFlakeRate) + '%。' + tip)
  }

  const alreadyQuarantinedIds = new Set((subject?.annotation?.alreadyQuarantinedFlaky ?? []).map(item => item.id))

  const flakyList = result.tests.filter(item => item.verdict === 'flaky')
  if (flakyList.length > 0) {
    lines.push('flaky 用例（' + String(flakyList.length) + '）：')
    for (const test of flakyList) {
      const quarantineTag = isSyntheticTest(test)
        ? '[运行异常]'
        : (alreadyQuarantinedIds.has(test.id) ? '[已隔离]' : '[新增未隔离]')
      lines.push(...renderTestDiagnostics(test, { quarantineTag }))
    }
  }

  const stableFailList = result.tests.filter(item => item.verdict === 'stable-fail')
  if (stableFailList.length > 0) {
    const shown = stableFailList.slice(0, 5)
    const heading = stableFailList.length > 5
      ? '稳定失败用例（共 ' + String(stableFailList.length) + ' 个，展示前 5 个）：'
      : '稳定失败用例（' + String(stableFailList.length) + '）：'
    lines.push(heading)
    for (const test of shown) {
      lines.push(...renderTestDiagnostics(test))
    }
  }

  const clearCandidates = subject?.annotation?.clearCandidates ?? []
  if (result.verdict === 'stable-pass' && clearCandidates.length > 0) {
    lines.push('可解除隔离候选（本次全部稳定通过，共 ' + String(clearCandidates.length) + ' 条）：')
    for (const entry of clearCandidates) {
      lines.push('- ' + formatRef(entry) + '（原隔离原因：' + entry.reason + '）')
    }
    lines.push('建议使用 flaky_clear 移除上述已恢复稳定的隔离条目。')
  }

  if (subject?.quarantineWarning !== undefined) {
    lines.push('隔离清单读取警告：' + subject.quarantineWarning + '（不影响本次检测结果）')
  }

  const timedOutRuns = runs.filter(run => run.timedOut === true)
  const truncatedRuns = runs.filter(run => run.truncated === true)
  const crashedRuns = runs.filter(run => run.report === null || run.error !== undefined)
  if (timedOutRuns.length > 0 || truncatedRuns.length > 0 || crashedRuns.length > 0) {
    const tags: string[] = []
    if (timedOutRuns.length > 0) tags.push('超时 ' + String(timedOutRuns.length) + ' 次')
    if (truncatedRuns.length > 0) tags.push('输出截断 ' + String(truncatedRuns.length) + ' 次')
    const otherCrashed = crashedRuns.filter(run => run.timedOut !== true && run.truncated !== true)
    if (otherCrashed.length > 0) tags.push('运行异常 ' + String(otherCrashed.length) + ' 次')
    const firstRaw = crashedRuns.find(run => run.error !== undefined)?.error
      ?? (crashedRuns.length > 0
        ? '未产出报告（stderr：' + (crashedRuns[0]!.stderr.trim().split(/\r?\n/).slice(-3).join(' | ') || '无输出') + '）'
        : '测试输出超过 4MB 采集上限被截断')
    lines.push('运行异常汇总（' + tags.join('，') + '）：' + redactSecrets(firstRaw))
  }

  if ((subject?.omittedStablePassCount ?? 0) > 0) {
    lines.push('结果精简：payload 已保留全部 flaky / 失败 / 跳过用例与前 ' + String(MAX_STABLE_PASS_WHEN_TRUNCATED) + ' 个稳定通过用例（省略 ' + String(subject!.omittedStablePassCount) + ' 个稳定通过用例）。')
  }

  lines.push('下一步：' + nextStepOf(result.verdict, clearCandidates.length))
  return lines.join('\n')
}

/** 按判定给出下一步；文案复用 tools 里已有的工具名，避免另造词汇。 */
function nextStepOf(verdict: string, clearCandidateCount = 0): string {
  switch (verdict) {
    case 'flaky': return '先用 flaky_quarantine 把新增未隔离的用例写进隔离清单（写清原因），再结合模式/错误聚类单跑定位竞态；修复后用 flaky_detect（可配 mode=verify-fix）复查并 flaky_clear。'
    case 'stable-fail': return '先单独跑一次这个测试看失败原因；若每次运行都崩溃（提示未产出报告），检查框架 CLI、reporter 与 pytest 的 junitxml 依赖。'
    case 'stable-pass':
      return clearCandidateCount > 0
        ? '多轮全部通过，且命中 ' + String(clearCandidateCount) + ' 条已隔离用例，可直接用 flaky_clear 移除它们。'
        : '多轮全部通过；若此前隔离过这些用例，可用 flaky_clear 移除。'
    case 'skipped': return '所有用例被跳过：检查测试文件里的 skip / 条件编译，或 target 是否只匹配到空壳文件。'
    case 'empty': return '没有解析到用例：确认 target 指向存在的测试文件或目录（可用 glob，如 test/**/*.test.mjs），必要时显式指定 framework。'
    default: return '可运行 flaky_history / flaky_report 查看历史趋势。'
  }
}

const testSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    file: { type: 'string' },
    name: { type: 'string' },
    passes: { type: 'integer' },
    failures: { type: 'integer' },
    skips: { type: 'integer' },
    failureRate: { type: 'number' },
    verdict: { type: 'string' },
    timeline: { type: 'array', items: { type: 'string' } },
    passDurationAvgMs: { oneOf: [{ type: 'number' }, { type: 'null' }] },
    failDurationAvgMs: { oneOf: [{ type: 'number' }, { type: 'null' }] },
    maxDurationMs: { type: 'number' },
    p95DurationMs: { type: 'number' },
    errorClusters: { type: 'array', items: { type: 'object', additionalProperties: true } },
    patterns: { type: 'array', items: { type: 'string' } },
    failedSeeds: { type: 'array', items: { type: 'integer' } },
  },
  additionalProperties: true,
}

const detectSchema = {
  type: 'object',
  properties: {
    target: { type: 'string' },
    framework: { type: 'string' },
    runs: { type: 'integer' },
    plannedRuns: { type: 'integer' },
    mode: { type: 'string' },
    concurrency: { type: 'integer' },
    verdict: { type: 'string' },
    stablePassCount: { type: 'integer' },
    stableFailCount: { type: 'integer' },
    flakyCount: { type: 'integer' },
    skippedCount: { type: 'integer' },
    durationMs: { type: 'integer' },
    confidence95MaxFlakeRate: { type: 'number' },
    runResults: { type: 'array', items: { type: 'object', additionalProperties: true } },
    tests: { type: 'array', items: testSchema },
    testsTruncated: { type: 'boolean' },
    omittedStablePassCount: { type: 'integer' },
    flakyTests: { type: 'array', items: { type: 'object', additionalProperties: true } },
    quarantineSync: { type: 'object', additionalProperties: true },
  },
  additionalProperties: true,
}

/** 构建六个工具定义（每次执行只解析当前调用的工作区与取消信号，不重建工具定义）。 */
export function buildFlakeTools(
  cfg: ResolvedFlakeConfig,
  runner: ProcessRunner,
  store: Store,
): FlakeToolDefinition[] {
  const detect: FlakeToolDefinition = {
    name: 'flaky_detect',
    description: '重复运行测试多次并判定稳定性：stable-pass（全过）/ stable-fail（全挂）/ flaky（时好时坏）。支持 vitest / jest / pytest / node:test、用例名过滤（testName）、早停模式（until-flaky / verify-fix）、受控并发（concurrency）、顺序打乱（shuffle/seed）、错误聚类、根因模式推断与隔离清单交叉对照。结果写入工作区历史供 flaky_report 分析。',
    parameters: compileParameters({
      target: { type: 'string', required: true, description: '测试文件、目录或 glob（相对当前工作区）。不能以 - 开头。' },
      framework: {
        type: 'string',
        enum: ['auto', 'vitest', 'jest', 'pytest', 'node'],
        description: 'auto（默认，自动探测 vitest→jest→pytest→node:test）/ vitest / jest / pytest / node。',
      },
      runs: { type: 'integer', description: '重复次数（3-' + String(cfg.maxRuns) + '），默认取配置 defaultRuns。' },
      testName: { type: 'string', description: '按用例名/模式精准过滤（Vitest/Jest -t、pytest -k、node:test --test-name-pattern）。不能以 - 开头。' },
      mode: {
        type: 'string',
        enum: ['full', 'until-flaky', 'verify-fix'],
        description: '执行模式：full（默认，跑满 runs 次）/ until-flaky（一旦确认不稳定即早停）/ verify-fix（修复复测，首次失败即早停）。',
      },
      concurrency: { type: 'integer', description: '受控并发 worker 数（1-4，默认取配置 defaultConcurrency）。' },
      shuffle: { type: 'boolean', description: '是否打乱测试执行顺序（Vitest/Jest 生效，默认 false）。未传 seed 时每轮生成不同随机种子并记录。' },
      seed: { type: 'integer', description: '可选随机种子（0-2147483647），配合 shuffle 复现特定顺序失败。' },
      noCoverage: { type: 'boolean', description: '是否关闭覆盖率采集以加速复跑（Vitest/Jest 生效，默认取配置 noCoverage）。' },
    }),
    output: {
      schema: detectSchema,
      render: (_args, value) => {
        const rec = asRecord(value)
        const summary = typeof rec.summary === 'string' ? rec.summary : ''
        return [{ type: 'text', text: summary === '' ? '检测完成。' : summary }]
      },
    },
    async execute(rawArgs: unknown, exec?: unknown) {
      const { cwd, signal, runner: scopedRunner, store: scopedStore } = resolveInvocation(exec, cfg, runner, store)
      const args = asRecord(rawArgs)
      const target = assertTarget(requiredString(args, 'target', '测试目标'))
      const requested: Framework = readFramework(args.framework)
      const runs = resolveRuns(args.runs, cfg)
      const testName = optionalString(args, 'testName')
      const mode = readDetectMode(args.mode)
      const concurrency = resolveConcurrency(args.concurrency, cfg)
      const noCoverage = optionalBoolean(args, 'noCoverage', cfg.noCoverage)
      const explicitSeed = optionalSeed(args, 'seed')
      const shuffle = args.shuffle === undefined || args.shuffle === null
        ? explicitSeed !== undefined
        : optionalBoolean(args, 'shuffle', false)
      const runSeeds = shuffle && explicitSeed === undefined ? pickDistinctSeeds(runs) : undefined

      const plans = Array.from({ length: runs }, (_, index) => buildPlan(cwd, target, requested, index, cfg.pythonPath, {
        ...(testName !== undefined ? { testName } : {}),
        noCoverage,
        ...(shuffle ? { shuffle: true, seed: explicitSeed ?? runSeeds![index]! } : {}),
        concurrency,
        pythonPathExplicit: cfg.pythonPathExplicit,
      }))
      const framework = plans[0]?.framework ?? 'node'

      const executed = await executePlansBatch(scopedRunner, plans, {
        timeoutMs: cfg.timeoutMs,
        cwd,
        signal,
        concurrency,
        mode,
      })

      const result = aggregate(executed.map(item => ({
        index: item.index,
        report: item.report,
        durationMs: item.durationMs,
        error: item.error,
        timedOut: item.timedOut,
        truncated: item.truncated,
        seed: item.seed,
      })))

      let quarantineWarning: string | undefined
      let quarantineDoc: QuarantineDocument = { version: 1, quarantined: [] }
      if (typeof scopedStore.loadQuarantine === 'function') {
        try {
          quarantineDoc = await scopedStore.loadQuarantine()
        } catch (error) {
          quarantineWarning = error instanceof Error ? error.message : String(error)
        }
      }
      const rawAnnotation = annotateTestsWithQuarantine(result.tests, quarantineDoc)
      const annotation: QuarantineAnnotation<TestRecord> = testName !== undefined
        ? {
            ...rawAnnotation,
            clearCandidates: rawAnnotation.clearCandidates.filter(entry => entry.name !== null),
          }
        : rawAnnotation

      const failedSeedSet = new Set<number>()
      for (const test of result.tests) {
        if (test.failedSeeds !== undefined) {
          for (const seedValue of test.failedSeeds) failedSeedSet.add(seedValue)
        }
      }
      for (const run of result.runs) {
        if (!run.success && run.seed !== undefined) failedSeedSet.add(run.seed)
      }
      const failedSeeds = failedSeedSet.size > 0 ? [...failedSeedSet].sort((a, b) => a - b) : undefined

      const errorSummaryMap = new Map<string, { message: string; count: number }>()
      for (const test of result.tests) {
        if (test.verdict !== 'flaky' && test.verdict !== 'stable-fail') continue
        for (const cluster of test.errorClusters) {
          const text = formatClusterMessage(cluster)
          const shortText = text.length > 160 ? text.slice(0, 159) + '…' : text
          const existing = errorSummaryMap.get(cluster.fingerprint)
          if (existing === undefined) {
            errorSummaryMap.set(cluster.fingerprint, { message: shortText, count: cluster.count })
          } else {
            existing.count += cluster.count
          }
        }
      }
      const errorSummary = errorSummaryMap.size > 0
        ? [...errorSummaryMap.values()].sort((a, b) => b.count - a.count).slice(0, 5)
        : undefined

      const flaky = flakyTests(result)
      const entry: HistoryEntry = {
        timestamp: new Date().toISOString(),
        target,
        framework,
        runs: result.runs.length,
        durationMs: result.durationMs,
        verdict: result.verdict,
        stablePassCount: result.stablePassCount,
        stableFailCount: result.stableFailCount,
        flakyCount: result.flakyCount,
        skippedCount: result.skippedCount,
        flakyTests: flaky,
        ...(scopedStore.workspace !== undefined ? { workspace: scopedStore.workspace } : {}),
        ...(testName !== undefined ? { testName } : {}),
        ...(mode !== 'full' ? { mode } : {}),
        ...(concurrency > 1 ? { concurrency } : {}),
        ...(shuffle ? { shuffle: true } : {}),
        ...(failedSeeds !== undefined ? { failedSeeds } : {}),
        ...(errorSummary !== undefined ? { errorSummary } : {}),
      }
      signal?.throwIfAborted()
      await scopedStore.appendHistory(entry)

      let returnedTests = result.tests
      let testsTruncated = false
      let omittedStablePassCount = 0
      if (result.tests.length > MAX_UNTRUNCATED_TESTS) {
        const nonPass = result.tests.filter(test => test.verdict !== 'stable-pass')
        const stablePass = result.tests.filter(test => test.verdict === 'stable-pass')
        if (stablePass.length > MAX_STABLE_PASS_WHEN_TRUNCATED) {
          returnedTests = [...nonPass, ...stablePass.slice(0, MAX_STABLE_PASS_WHEN_TRUNCATED)]
          testsTruncated = true
          omittedStablePassCount = stablePass.length - MAX_STABLE_PASS_WHEN_TRUNCATED
        }
      }

      const toSyncItem = (test: TestRecord) => ({
        id: test.id,
        file: test.file,
        name: test.name,
        ref: formatRef(test),
        failureRate: test.failureRate,
      })

      const quarantineSync = {
        newFlaky: annotation.newFlaky.filter(test => !isSyntheticTest(test)).map(toSyncItem),
        alreadyQuarantinedFlaky: annotation.alreadyQuarantinedFlaky.map(toSyncItem),
        clearCandidates: annotation.clearCandidates.map(item => ({
          file: item.file,
          name: item.name,
          ref: formatRef(item),
          reason: item.reason,
          since: item.since,
        })),
        ...(quarantineWarning !== undefined ? { warning: quarantineWarning } : {}),
      }

      return {
        target,
        framework,
        runs: result.runs.length,
        plannedRuns: runs,
        mode,
        concurrency,
        ...(testName !== undefined ? { testName } : {}),
        ...(shuffle ? { shuffle: true } : {}),
        ...(executed.length < runs ? { earlyStopped: true } : {}),
        verdict: result.verdict,
        stablePassCount: result.stablePassCount,
        stableFailCount: result.stableFailCount,
        flakyCount: result.flakyCount,
        skippedCount: result.skippedCount,
        durationMs: result.durationMs,
        ...(result.confidence95MaxFlakeRate !== undefined ? { confidence95MaxFlakeRate: result.confidence95MaxFlakeRate } : {}),
        runResults: result.runs,
        tests: returnedTests,
        ...(testsTruncated ? { testsTruncated: true, omittedStablePassCount } : {}),
        flakyTests: flaky,
        quarantineSync,
        summary: resultSummary(result, executed, {
          target,
          framework,
          plannedRuns: runs,
          testName,
          mode,
          concurrency,
          shuffle,
          explicitSeed: shuffle ? explicitSeed : undefined,
          annotation,
          quarantineWarning,
          omittedStablePassCount,
        }),
      }
    },
    timeoutMs: runsTimeout(cfg),
  }

  const history: FlakeToolDefinition = {
    name: 'flaky_history',
    isConcurrencySafe: () => true,
    description: '查询 flaky_detect 的历史记录，默认按当前工作区隔离，可按测试目标过滤或切到 scope=all 跨工作区查看。',
    parameters: compileParameters({
      target: { type: 'string', description: '按测试目标过滤（可选，子串匹配）。' },
      limit: { type: 'integer', description: '返回条数 1-100（默认 20）。' },
      scope: {
        type: 'string',
        enum: ['workspace', 'all'],
        description: '查询范围：workspace（默认，仅当前工作区）/ all（跨工作区汇总）。',
      },
    }),
    output: {
      schema: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          count: { type: 'integer' },
          entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
        additionalProperties: true,
      },
      render: (_args, value) => {
        const rec = asRecord(value)
        const entries = Array.isArray(rec.entries) ? rec.entries : []
        if (entries.length === 0) {
          return [{ type: 'text', text: '历史记录 0 条：还没有跑过 flaky_detect（或过滤条件没有命中）。下一步：先对目标运行 flaky_detect，再用本工具看趋势。' }]
        }
        const scopeNote = rec.scope === 'all' ? '，跨工作区' : ''
        const lines = ['历史记录 ' + String(entries.length) + ' 条（新的在前' + scopeNote + '）：']
        for (const item of entries) {
          const row = asRecord(item)
          const flaky = Number(row.flakyCount ?? 0)
          const extras = [
            String(row.framework ?? ''),
            verdictLabel(String(row.verdict ?? '')),
            String(row.runs ?? '?') + ' 次',
          ]
          if (typeof row.testName === 'string' && row.testName !== '') extras.push('testName=' + row.testName)
          if (typeof row.mode === 'string' && row.mode !== '' && row.mode !== 'full') extras.push('mode=' + row.mode)
          if (flaky > 0) extras.push('flaky ' + String(flaky))
          lines.push('- ' + row.timestamp + ' ' + row.target + '（' + extras.join('，') + '）')
        }
        lines.push('下一步：需要判定标准/隔离清单汇总时用 flaky_report；修复后重新 flaky_detect 复查。')
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(rawArgs: unknown, exec?: unknown) {
      const { store: scopedStore } = resolveInvocation(exec, cfg, runner, store)
      const args = asRecord(rawArgs)
      const target = optionalString(args, 'target')
      const limit = optionalInteger(args, 'limit', '返回条数', 1, 100, 20)
      const scope = readScope(args.scope)
      const entries = await scopedStore.listHistory(target, limit, scope)
      return { scope, count: entries.length, entries }
    },
    timeoutMs: 10000,
  }

  const quarantine: FlakeToolDefinition = {
    name: 'flaky_quarantine',
    description: '把确认的 flaky 用例写入项目根 .flakefinder.json 隔离清单（不修改测试源码），支持记录关联 issue 与最近失败率。需要 flaky_detect 判定为 flaky 后再使用。',
    parameters: compileParameters({
      tests: { type: 'array', items: 'string', required: true, description: '1-100 条测试引用：文件路径，或 "文件路径 > 用例名"。' },
      reason: { type: 'string', required: true, description: '隔离原因（会写进清单，例如：定时器竞态，见 issue #12）。' },
      issue: { type: 'string', description: '关联的 issue / PR / 工单编号或链接（可选，例如 #123）。' },
      lastFailureRate: { type: 'number', description: '最近一次检测到的失败率百分比 0-100（可选）。' },
    }),
    output: {
      schema: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          addedCount: { type: 'integer' },
          updatedCount: { type: 'integer' },
          added: { type: 'array', items: { type: 'object', additionalProperties: true } },
          updated: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
        additionalProperties: true,
      },
      render: (_args, value) => {
        const rec = asRecord(value)
        const added = Number(rec.addedCount ?? 0)
        const updated = Number(rec.updatedCount ?? 0)
        const addedItems = Array.isArray(rec.added) ? rec.added : []
        const updatedItems = Array.isArray(rec.updated) ? rec.updated : []
        let head: string
        if (added > 0 && updated > 0) {
          head = '已更新隔离清单 ' + String(rec.file ?? '') + '：新增 ' + String(added) + ' 条，更新 ' + String(updated) + ' 条。'
        } else if (added > 0) {
          head = '已写入隔离清单 ' + String(rec.file ?? '') + '，新增 ' + String(added) + ' 条。'
        } else if (updated > 0) {
          head = '已更新隔离清单 ' + String(rec.file ?? '') + ' 中已有的 ' + String(updated) + ' 条记录（保留原隔离时间，已更新原因/元数据）。'
        } else {
          head = '隔离清单 ' + String(rec.file ?? '') + ' 无变更。'
        }
        const lines = [head]
        for (const item of addedItems.slice(0, 10)) {
          const row = asRecord(item)
          lines.push('+ ' + formatRef({ file: String(row.file ?? ''), name: typeof row.name === 'string' ? row.name : null }) + '：' + String(row.reason ?? ''))
        }
        for (const item of updatedItems.slice(0, 10)) {
          const row = asRecord(item)
          lines.push('~ ' + formatRef({ file: String(row.file ?? ''), name: typeof row.name === 'string' ? row.name : null }) + '：' + String(row.reason ?? ''))
        }
        lines.push('下一步：修复后运行 flaky_detect 多轮全部通过，再用 flaky_clear 移除这些条目。')
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(rawArgs: unknown, exec?: unknown) {
      const { store: scopedStore } = resolveInvocation(exec, cfg, runner, store)
      const args = asRecord(rawArgs)
      const refs = parseRefList(args)
      const reason = requiredString(args, 'reason', '隔离原因')
      const issue = optionalString(args, 'issue')
      const lastFailureRate = optionalFailureRate(args, 'lastFailureRate')
      const addOptions = {
        ...(issue !== undefined ? { issue } : {}),
        ...(lastFailureRate !== undefined ? { lastFailureRate } : {}),
      }
      const outcome = await scopedStore.addQuarantine(refs, reason, Object.keys(addOptions).length > 0 ? addOptions : undefined)
      const updated = Array.isArray(outcome.updated) ? outcome.updated : []
      return {
        file: outcome.file,
        addedCount: outcome.added.length,
        updatedCount: updated.length,
        added: outcome.added,
        updated,
      }
    },
    timeoutMs: 10000,
  }

  const clear: FlakeToolDefinition = {
    name: 'flaky_clear',
    description: '从隔离清单移除已经恢复稳定的用例。建议先 flaky_detect 验证多轮全部通过后再清除。',
    parameters: compileParameters({
      tests: { type: 'array', items: 'string', required: true, description: '1-100 条测试引用：文件路径，或 "文件路径 > 用例名"。' },
    }),
    output: {
      schema: {
        type: 'object',
        properties: { file: { type: 'string' }, removedCount: { type: 'integer' }, removed: { type: 'array', items: { type: 'object', additionalProperties: true } } },
        additionalProperties: true,
      },
      render: (_args, value) => {
        const rec = asRecord(value)
        const removed = Number(rec.removedCount ?? 0)
        const head = removed === 0
          ? '隔离清单 ' + rec.file + ' 没有匹配条目可移除：请核对测试引用的文件路径与用例名（格式 "文件路径 > 用例名"），可用 flaky_report 查看清单里现有条目。'
          : '已从隔离清单移除 ' + String(removed) + ' 条。'
        return [{ type: 'text', text: head + (removed === 0 ? '' : '\n下一步：建议再跑一次 flaky_detect，确认移除后仍稳定。') }]
      },
    },
    async execute(rawArgs: unknown, exec?: unknown) {
      const { store: scopedStore } = resolveInvocation(exec, cfg, runner, store)
      const args = asRecord(rawArgs)
      const refs = parseRefList(args)
      const outcome = await scopedStore.removeQuarantine(refs)
      return { file: outcome.file, removedCount: outcome.removed.length, removed: outcome.removed }
    },
    timeoutMs: 10000,
  }

  const report: FlakeToolDefinition = {
    name: 'flaky_report',
    isConcurrencySafe: () => true,
    description: '汇总隔离清单、高频不稳定 Top 榜单、超期未复查提醒与检测历史，输出项目测试稳定性报告（只读，不运行测试）。',
    parameters: compileParameters({
      target: { type: 'string', description: '按测试目标过滤历史（可选）。' },
      historyLimit: { type: 'integer', description: '历史条数 1-100（默认 20）。' },
      scope: {
        type: 'string',
        enum: ['workspace', 'all'],
        description: '历史查询范围：workspace（默认，仅当前工作区）/ all（跨工作区汇总）。',
      },
    }),
    output: {
      schema: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          quarantineFile: { type: 'string' },
          quarantinedCount: { type: 'integer' },
          quarantined: { type: 'array', items: { type: 'object', additionalProperties: true } },
          historyCount: { type: 'integer' },
          history: { type: 'array', items: { type: 'object', additionalProperties: true } },
          topFlakyTests: { type: 'array', items: { type: 'object', additionalProperties: true } },
          staleQuarantined: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
        additionalProperties: true,
      },
      render: (_args, value) => {
        const rec = asRecord(value)
        const quarantined = Array.isArray(rec.quarantined) ? rec.quarantined : []
        const history = Array.isArray(rec.history) ? rec.history : []
        const topFlakyTests = Array.isArray(rec.topFlakyTests) ? rec.topFlakyTests : []
        const staleQuarantined = Array.isArray(rec.staleQuarantined) ? rec.staleQuarantined : []
        const staleDays = Number(rec.staleQuarantineDays ?? cfg.staleQuarantineDays)
        const lines = [
          '测试稳定性报告',
          '隔离清单：' + String(rec.quarantineFile ?? '') + '（' + String(rec.quarantinedCount ?? 0) + ' 条）',
        ]
        if (quarantined.length === 0) lines.push('- 清单为空：还没有被隔离的用例。下一步：flaky_detect 判定为 flaky 后用 flaky_quarantine 写入。')
        for (const item of quarantined) {
          const row = asRecord(item)
          const meta: string[] = []
          if (typeof row.issue === 'string' && row.issue !== '') meta.push('关联 ' + row.issue)
          if (typeof row.lastFailureRate === 'number') meta.push('最近失败率 ' + String(row.lastFailureRate) + '%')
          const suffix = meta.length > 0 ? '（' + meta.join('，') + '）' : ''
          lines.push('- ' + formatRef({ file: String(row.file ?? ''), name: typeof row.name === 'string' ? row.name : null }) + '：' + String(row.reason ?? '') + suffix)
        }

        if (staleQuarantined.length > 0) {
          lines.push('', '超期未复查隔离项（>' + String(staleDays) + ' 天，共 ' + String(staleQuarantined.length) + ' 条）：')
          for (const item of staleQuarantined) {
            const row = asRecord(item)
            lines.push(
              '- ' + formatRef({ file: String(row.file ?? ''), name: typeof row.name === 'string' ? row.name : null })
              + '：已隔离 ' + String(row.ageDays ?? '?') + ' 天（原因：' + String(row.reason ?? '') + '）',
            )
          }
          lines.push('建议对上述超期条目重新运行 flaky_detect 复查；若已稳定通过，用 flaky_clear 清理。')
        }

        if (topFlakyTests.length > 0) {
          lines.push('', '历史高频不稳定 Top ' + String(topFlakyTests.length) + '：')
          for (const item of topFlakyTests) {
            const row = asRecord(item)
            const tag = row.quarantined === true ? '[已隔离]' : '[未隔离]'
            lines.push(
              '- ' + formatRef({ file: String(row.file ?? ''), name: typeof row.name === 'string' ? row.name : null }) + ' ' + tag
              + '：出现 ' + String(row.occurrences ?? 0) + ' 次，平均失败率 ' + String(row.avgFailureRate ?? 0)
              + '%（最高 ' + String(row.maxFailureRate ?? 0) + '%）',
            )
          }
        }

        lines.push('', '检测历史：' + String(rec.historyCount ?? history.length) + ' 条')
        if (history.length === 0) lines.push('- 还没有检测记录：先对一个目标运行 flaky_detect。')
        for (const item of history.slice(0, 10)) {
          const row = asRecord(item)
          const flaky = Number(row.flakyCount ?? 0)
          const extras = [verdictLabel(String(row.verdict ?? '')), String(row.runs ?? '?') + ' 次']
          if (typeof row.testName === 'string' && row.testName !== '') extras.push('testName=' + row.testName)
          if (typeof row.mode === 'string' && row.mode !== '' && row.mode !== 'full') extras.push('mode=' + row.mode)
          if (flaky > 0) extras.push('flaky ' + String(flaky))
          lines.push('- ' + row.timestamp + ' ' + row.target + '（' + extras.join('，') + '）')
        }
        if (history.length > 10) lines.push('…仅展示最近 10 条，其余用 flaky_history 查看')
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(rawArgs: unknown, exec?: unknown) {
      const { store: scopedStore } = resolveInvocation(exec, cfg, runner, store)
      const args = asRecord(rawArgs)
      const target = optionalString(args, 'target')
      const historyLimit = optionalInteger(args, 'historyLimit', '历史条数', 1, 100, 20)
      const scope = readScope(args.scope)
      const doc = await scopedStore.loadQuarantine()
      const historyEntries = await scopedStore.listHistory(target, historyLimit, scope)
      const stability = summarizeStability(historyEntries, doc, { staleDays: cfg.staleQuarantineDays, topN: 5 })
      return {
        scope,
        quarantineFile: scopedStore.quarantinePath,
        quarantinedCount: doc.quarantined.length,
        quarantined: doc.quarantined,
        historyCount: historyEntries.length,
        history: historyEntries,
        staleQuarantineDays: cfg.staleQuarantineDays,
        topFlakyTests: stability.topFlakyTests,
        staleQuarantined: stability.staleQuarantined,
      }
    },
    timeoutMs: 10000,
  }

  const flakyHealth: FlakeToolDefinition = {
    name: 'flaky_health',
    isConcurrencySafe: () => true,
    description: 'dsh-flakefinder 自检：检查 Node 版本、工作区自动探测的测试框架（Vitest/Jest/pytest/node:test）、Python/pytest 可用性、隔离清单与历史文件可读性，并汇总默认配置。遇到问题时先运行本工具定位。',
    parameters: compileParameters({}),
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const rec = asRecord(value)
        const checks = Array.isArray(rec.checks) ? rec.checks : []
        const lines = ['dsh-flakefinder 自检' + (rec.ok === true ? '：正常。' : '：发现问题。')]
        const requiredFailed: string[] = []
        const optionalFailed: string[] = []
        for (const item of checks) {
          const c = asRecord(item)
          const detail = String(c.detail ?? '')
          if (c.ok === true) {
            lines.push('- ' + c.name + '：✅' + (detail !== '' ? ' ' + detail : ''))
          } else if (c.required === false) {
            lines.push('- ' + c.name + '：ℹ️（可选）' + detail)
            optionalFailed.push(String(c.name))
          } else {
            lines.push('- ' + c.name + '：❌ ' + detail)
            requiredFailed.push(String(c.name))
          }
        }
        if (requiredFailed.includes('pytest') || requiredFailed.includes('python')) {
          lines.push('下一步：当前工作区需要 Python/pytest，请先 pip install pytest，或把插件配置里的 pythonPath 指到正确的解释器，再运行 flaky_health 复查。')
        } else if (requiredFailed.length > 0) {
          lines.push('下一步：按上面 ❌ 项的说明修好环境或备份修复损坏的文件，再运行 flaky_health 复查。')
        } else if (optionalFailed.includes('pytest') || optionalFailed.includes('python')) {
          lines.push('说明：仅用 vitest / jest / node:test 时 Python/pytest 缺失不影响使用；若后续需要跑 Python 测试，再 pip install pytest 或配置 pythonPath。')
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(_rawArgs: unknown, exec?: unknown) {
      const { cwd, signal, runner: scopedRunner, store: scopedStore } = resolveInvocation(exec, cfg, runner, store)
      const env = detectEnvironment(cwd, cfg)
      const pythonRequired = env.pytest.configFound || cfg.pythonPathExplicit === true
      const checks: Array<Record<string, unknown>> = []
      let ok = true

      checks.push({
        name: 'node',
        ok: true,
        required: true,
        detail: env.nodeVersion + '（' + env.nodePath + '）',
      })

      const detectedParts = ['默认=' + env.defaultFramework]
      if (env.vitest.available) detectedParts.push('vitest=' + env.vitest.entryPath)
      if (env.jest.available) detectedParts.push('jest=' + env.jest.entryPath)
      if (env.pytest.configFound) detectedParts.push('pytest配置=' + env.pytest.configPath)
      detectedParts.push('node:test=内置')
      checks.push({
        name: '工作区框架',
        ok: true,
        required: true,
        detail: detectedParts.join('；'),
      })

      const pythonBin = env.pytest.pythonPath
      try {
        const result = await scopedRunner.run([pythonBin, '--version'], { timeoutMs: 15000 })
        signal?.throwIfAborted()
        const version = (result.stdout + result.stderr).split(/\r?\n/)[0]?.trim() ?? ''
        if (result.exitCode === 0) {
          checks.push({
            name: 'python',
            ok: true,
            required: pythonRequired,
            detail: version + '（' + pythonBin + '，' + pythonSourceLabel(env.pytest.pythonSource) + '）',
          })
        } else {
          if (pythonRequired) ok = false
          checks.push({
            name: 'python',
            ok: false,
            required: pythonRequired,
            detail: '退出码 ' + String(result.exitCode) + '（' + pythonBin + '）',
          })
        }
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error
        if (pythonRequired) ok = false
        checks.push({
          name: 'python',
          ok: false,
          required: pythonRequired,
          detail: error instanceof Error ? error.message : String(error),
        })
      }

      signal?.throwIfAborted()
      try {
        const result = await scopedRunner.run([pythonBin, '-m', 'pytest', '--version'], { timeoutMs: 20000 })
        signal?.throwIfAborted()
        const version = (result.stdout + result.stderr).split(/\r?\n/)[0]?.trim() ?? ''
        if (result.exitCode === 0) {
          checks.push({ name: 'pytest', ok: true, required: pythonRequired, detail: version })
        } else {
          if (pythonRequired) ok = false
          checks.push({ name: 'pytest', ok: false, required: pythonRequired, detail: '未安装或不可用（pip install pytest）' })
        }
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error
        if (pythonRequired) ok = false
        checks.push({
          name: 'pytest',
          ok: false,
          required: pythonRequired,
          detail: error instanceof Error ? error.message : String(error),
        })
      }

      signal?.throwIfAborted()

      if (typeof scopedStore.loadQuarantine === 'function') {
        try {
          const doc = await scopedStore.loadQuarantine()
          checks.push({
            name: '隔离清单',
            ok: true,
            required: true,
            detail: scopedStore.quarantinePath + '（' + String(doc.quarantined.length) + ' 条）',
          })
        } catch (error) {
          ok = false
          checks.push({
            name: '隔离清单',
            ok: false,
            required: true,
            detail: error instanceof Error ? error.message : String(error),
          })
        }
      }

      if (typeof scopedStore.listHistory === 'function') {
        try {
          await scopedStore.listHistory(undefined, 1, 'workspace')
          checks.push({
            name: '历史记录',
            ok: true,
            required: true,
            detail: (scopedStore.historyPath ?? cfg.dataDir) + '（可读）',
          })
        } catch (error) {
          ok = false
          checks.push({
            name: '历史记录',
            ok: false,
            required: true,
            detail: error instanceof Error ? error.message : String(error),
          })
        }
      }

      checks.push({
        name: '默认配置',
        ok: true,
        required: false,
        detail: 'defaultRuns=' + String(cfg.defaultRuns)
          + ', maxRuns=' + String(cfg.maxRuns)
          + ', defaultConcurrency=' + String(cfg.defaultConcurrency)
          + ', noCoverage=' + String(cfg.noCoverage)
          + ', timeoutMs=' + String(cfg.timeoutMs)
          + ', staleQuarantineDays=' + String(cfg.staleQuarantineDays),
      })

      return {
        ok,
        plugin: 'dsh-flakefinder',
        workspace: cwd,
        pythonRequired,
        environment: env,
        checks,
      }
    },
    timeoutMs: 40000,
  }

  return [detect, history, quarantine, clear, report, flakyHealth]
}

function runsTimeout(cfg: ResolvedFlakeConfig): number {
  return Math.min(10 * 60 * 1000, cfg.maxRuns * cfg.timeoutMs + 15000)
}
