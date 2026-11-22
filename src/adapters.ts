/**
 * 测试框架适配器与注册表：覆盖 vitest / jest / pytest / node:test，
 * 支持 monorepo 向上查找 node_modules、workspace .venv 自动探测、
 * 精准过滤、关闭覆盖率与顺序打乱（shuffle + seed）。
 * 全程 argv 数组、无 shell，避免 npx 下载与命令注入。
 *
 * @module dsh-flakefinder/adapters
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertTarget, type ResolvedFlakeConfig } from './config.js'

export type ConcreteFramework = 'vitest' | 'jest' | 'pytest' | 'node'
export type Framework = 'auto' | ConcreteFramework
export type ReportKind = 'json' | 'tap' | 'junit'

export interface PlanBuildOptions {
  /** 按用例名/模式过滤单个或多个用例。 */
  testName?: string
  /** 是否关闭覆盖率采集以加速复跑（默认 true，对 vitest / jest 生效）。 */
  noCoverage?: boolean
  /** 是否打乱测试执行顺序（对 vitest / jest 生效）。 */
  shuffle?: boolean
  /** 随机种子（0-2147483647）；与 shuffle 配合或单独传入用于复现。 */
  seed?: number
  /** 外部批次并发数；Jest 在 concurrency<=1 且未开启 shuffle 时默认带 --runInBand。 */
  concurrency?: number
  /** pythonPath 是否由用户显式配置（为 true 时跳过 .venv 自动探测）。 */
  pythonPathExplicit?: boolean
}

export interface TestPlan {
  framework: ConcreteFramework
  reportKind: ReportKind
  reportPath: string
  argv: string[]
  label: string
  seed?: number
  target?: string
}

export interface AdapterContext {
  cwd: string
  target: string
  runIndex: number
  token: string
  pythonPath?: string
  options?: PlanBuildOptions
}

/** 面向未来框架扩展（如 Playwright / Go）的标准适配器契约。 */
export interface FrameworkAdapter {
  readonly id: ConcreteFramework
  readonly aliases?: readonly string[]
  readonly reportKind: ReportKind
  /** auto 探测优先级，数字越小越优先。 */
  readonly priority: number
  /** 显式指定该框架时，是否要求本地入口必须存在。 */
  readonly requireLocalOnExplicit?: boolean
  /** 探测当前工作区是否具备该框架（返回入口或配置文件路径，未找到返回 null）。 */
  detect(cwd: string): string | null
  /** 显式指定但本地缺失时的中文指引。 */
  missingMessage?(cwd: string): string
  /** 构建单轮执行的完整计划。 */
  buildPlan(ctx: AdapterContext): TestPlan
}

export type PythonPathSource = 'explicit' | 'virtual-env' | 'workspace-venv' | 'default'

export interface PythonResolution {
  pythonPath: string
  source: PythonPathSource
}

export interface EnvironmentDetection {
  cwd: string
  defaultFramework: ConcreteFramework
  nodeVersion: string
  nodePath: string
  vitest: { available: boolean; entryPath: string | null }
  jest: { available: boolean; entryPath: string | null }
  pytest: {
    configFound: boolean
    configPath: string | null
    pythonPath: string
    pythonSource: PythonPathSource
  }
  frameworks: {
    vitest: string | null
    jest: string | null
    pytestConfig: string | null
    pythonPath: string
    node: string
  }
}

const MAX_SEED = 2147483647

/** 从 cwd 向上逐级查找本地 node_modules 里的 CLI 入口（适配 monorepo hoisted 依赖）。 */
export function findLocalModuleEntry(cwd: string, ...parts: string[]): string | null {
  let current = path.resolve(cwd)
  while (true) {
    const candidate = path.join(current, ...parts)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/** 在 cwd 中查找 pytest 配置文件路径。 */
export function findPytestConfig(cwd: string): string | null {
  const pytestIni = path.join(cwd, 'pytest.ini')
  if (fs.existsSync(pytestIni)) return pytestIni
  const toxIni = path.join(cwd, 'tox.ini')
  if (fs.existsSync(toxIni)) return toxIni
  const pyproject = path.join(cwd, 'pyproject.toml')
  if (fs.existsSync(pyproject)) {
    try {
      if (/\[tool\.pytest(\.ini_options)?\]/.test(fs.readFileSync(pyproject, 'utf8'))) return pyproject
    } catch {
      // 读不了就当没有配置，继续探测 setup.cfg。
    }
  }
  const setupCfg = path.join(cwd, 'setup.cfg')
  if (!fs.existsSync(setupCfg)) return null
  try {
    return /\[tool:pytest\]/.test(fs.readFileSync(setupCfg, 'utf8')) ? setupCfg : null
  } catch {
    return null
  }
}

function venvPythonCandidates(venvRoot: string, platform: NodeJS.Platform): string[] {
  if (platform === 'win32') {
    return [path.join(venvRoot, 'Scripts', 'python.exe')]
  }
  return [
    path.join(venvRoot, 'bin', 'python'),
    path.join(venvRoot, 'bin', 'python3'),
  ]
}

function existingVenvPython(venvRoot: string, platform: NodeJS.Platform): string | null {
  for (const candidate of venvPythonCandidates(venvRoot, platform)) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/**
 * 解析 pytest 使用的 Python 解释器路径及来源。
 * 当用户未显式配置 pythonPath / DSH_FLAKEFINDER_PYTHON 时，按顺序自动探测：
 * VIRTUAL_ENV -> 向上查找 .venv / venv -> 平台默认 python / python3。
 */
export function resolvePythonPathInfo(
  cwd: string,
  cfg?: Pick<ResolvedFlakeConfig, 'pythonPath' | 'pythonPathExplicit'>,
  runtime?: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform },
): PythonResolution {
  const env = runtime?.env ?? process.env
  const platform = runtime?.platform ?? process.platform

  if (cfg?.pythonPathExplicit === true && typeof cfg.pythonPath === 'string' && cfg.pythonPath.trim() !== '') {
    return { pythonPath: cfg.pythonPath.trim(), source: 'explicit' }
  }
  if (cfg === undefined) {
    const envPy = env.DSH_FLAKEFINDER_PYTHON?.trim()
    if (envPy) return { pythonPath: envPy, source: 'explicit' }
  }

  const virtualEnv = env.VIRTUAL_ENV?.trim()
  if (virtualEnv) {
    const found = existingVenvPython(virtualEnv, platform)
    if (found !== null) return { pythonPath: found, source: 'virtual-env' }
  }

  let current = path.resolve(cwd)
  while (true) {
    for (const dirName of ['.venv', 'venv']) {
      const found = existingVenvPython(path.join(current, dirName), platform)
      if (found !== null) return { pythonPath: found, source: 'workspace-venv' }
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  const fallback = typeof cfg?.pythonPath === 'string' && cfg.pythonPath.trim() !== ''
    ? cfg.pythonPath.trim()
    : (platform === 'win32' ? 'python' : 'python3')
  return { pythonPath: fallback, source: 'default' }
}

/** 解析 pytest 使用的 Python 解释器路径。 */
export function resolvePythonPath(
  cwd: string,
  cfg?: Pick<ResolvedFlakeConfig, 'pythonPath' | 'pythonPathExplicit'>,
  runtime?: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform },
): string {
  return resolvePythonPathInfo(cwd, cfg, runtime).pythonPath
}

function validateTestName(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed === '') throw new Error('testName 不能为空字符串。')
  if (trimmed.startsWith('-')) throw new Error('testName 不能以 - 开头：' + raw)
  return trimmed
}

function resolveShuffleSeed(options?: PlanBuildOptions): number | undefined {
  const enableShuffle = options?.shuffle === true || (options?.shuffle === undefined && options?.seed !== undefined)
  if (!enableShuffle) return undefined
  if (options?.seed !== undefined) {
    if (typeof options.seed !== 'number' || !Number.isFinite(options.seed) || !Number.isInteger(options.seed)) {
      throw new Error('seed 必须是整数。')
    }
    if (options.seed < 0 || options.seed > MAX_SEED) {
      throw new Error('seed 必须在 0-' + String(MAX_SEED) + ' 之间。')
    }
    return options.seed
  }
  return crypto.randomInt(1, MAX_SEED)
}

function toPosixTarget(target: string): string {
  return target.replace(/\\/g, '/')
}

const vitestAdapter: FrameworkAdapter = {
  id: 'vitest',
  reportKind: 'json',
  priority: 10,
  requireLocalOnExplicit: true,
  detect(cwd) {
    return findLocalModuleEntry(cwd, 'node_modules', 'vitest', 'vitest.mjs')
  },
  missingMessage(cwd) {
    return 'framework=vitest，但在 ' + cwd + ' 下找不到 node_modules/vitest/vitest.mjs。请先安装 vitest（例如 pnpm add -D vitest）。'
  },
  buildPlan({ cwd, target, runIndex, token, options }) {
    const entry = this.detect(cwd)
    if (entry === null) throw new Error('未找到本地 vitest 入口：node_modules/vitest/vitest.mjs')
    const normalizedTarget = toPosixTarget(target)
    const testName = validateTestName(options?.testName)
    const noCoverage = options?.noCoverage !== false
    const seed = resolveShuffleSeed(options)
    const reportPath = path.join(os.tmpdir(), 'dsh-flakefinder-vitest-' + process.pid + '-' + String(runIndex) + '-' + token + '.json')
    const argv = [process.execPath, entry, 'run', normalizedTarget, '--reporter=json', '--outputFile', reportPath]
    if (noCoverage) argv.push('--coverage.enabled=false')
    if (seed !== undefined) argv.push('--sequence.shuffle', '--sequence.seed=' + String(seed))
    if (testName !== undefined) argv.push('-t', testName)
    return {
      framework: 'vitest',
      reportKind: 'json',
      reportPath,
      argv,
      label: 'vitest run ' + normalizedTarget,
      target: normalizedTarget,
      ...(seed !== undefined ? { seed } : {}),
    }
  },
}

const jestAdapter: FrameworkAdapter = {
  id: 'jest',
  reportKind: 'json',
  priority: 20,
  requireLocalOnExplicit: true,
  detect(cwd) {
    return findLocalModuleEntry(cwd, 'node_modules', 'jest', 'bin', 'jest.js')
  },
  missingMessage(cwd) {
    return 'framework=jest，但在 ' + cwd + ' 下找不到 node_modules/jest/bin/jest.js。请先安装 jest。'
  },
  buildPlan({ cwd, target, runIndex, token, options }) {
    const entry = this.detect(cwd)
    if (entry === null) throw new Error('未找到本地 jest 入口：node_modules/jest/bin/jest.js')
    const normalizedTarget = toPosixTarget(target)
    const testName = validateTestName(options?.testName)
    const noCoverage = options?.noCoverage !== false
    const seed = resolveShuffleSeed(options)
    const useRunInBand = (options?.concurrency ?? 1) <= 1 && seed === undefined
    const reportPath = path.join(os.tmpdir(), 'dsh-flakefinder-jest-' + process.pid + '-' + String(runIndex) + '-' + token + '.json')
    const argv = [process.execPath, entry]
    if (useRunInBand) argv.push('--runInBand')
    argv.push('--json', '--outputFile', reportPath)
    if (noCoverage) argv.push('--coverage=false')
    if (seed !== undefined) argv.push('--randomize', '--seed=' + String(seed))
    if (testName !== undefined) argv.push('-t', testName)
    argv.push(normalizedTarget)
    return {
      framework: 'jest',
      reportKind: 'json',
      reportPath,
      argv,
      label: 'jest run ' + normalizedTarget,
      target: normalizedTarget,
      ...(seed !== undefined ? { seed } : {}),
    }
  },
}

const pytestAdapter: FrameworkAdapter = {
  id: 'pytest',
  aliases: ['py'],
  reportKind: 'junit',
  priority: 30,
  detect(cwd) {
    return findPytestConfig(cwd)
  },
  buildPlan({ cwd, target, runIndex, token, pythonPath, options }) {
    const testName = validateTestName(options?.testName)
    const explicit = options?.pythonPathExplicit ?? (pythonPath !== undefined)
    const resolvedPython = explicit && pythonPath !== undefined && pythonPath.trim() !== ''
      ? pythonPath.trim()
      : (pythonPath === undefined && options?.pythonPathExplicit === undefined
        ? resolvePythonPath(cwd)
        : resolvePythonPath(cwd, { pythonPath: pythonPath ?? '', pythonPathExplicit: false }))
    const reportPath = path.join(os.tmpdir(), 'dsh-flakefinder-pytest-' + process.pid + '-' + String(runIndex) + '-' + token + '.xml')
    const argv = [resolvedPython, '-m', 'pytest', target, '-q', '--junitxml=' + reportPath]
    if (testName !== undefined) argv.push('-k', testName)
    return {
      framework: 'pytest',
      reportKind: 'junit',
      reportPath,
      argv,
      label: 'pytest ' + target,
      target,
    }
  },
}

const nodeAdapter: FrameworkAdapter = {
  id: 'node',
  aliases: ['node:test'],
  reportKind: 'tap',
  priority: 40,
  detect() {
    return process.execPath
  },
  buildPlan({ target, options }) {
    const testName = validateTestName(options?.testName)
    const argv = [process.execPath, '--test', '--test-reporter=tap']
    if (testName !== undefined) argv.push('--test-name-pattern=' + testName)
    argv.push(target)
    return {
      framework: 'node',
      reportKind: 'tap',
      reportPath: '',
      argv,
      label: 'node --test ' + target,
      target,
    }
  },
}

const registry = new Map<ConcreteFramework, FrameworkAdapter>()
const aliasMap = new Map<string, ConcreteFramework>()

/** 注册一个测试框架适配器（覆盖同 id 适配器并更新别名映射）。 */
export function registerAdapter(adapter: FrameworkAdapter): void {
  registry.set(adapter.id, adapter)
  aliasMap.set(adapter.id, adapter.id)
  if (adapter.aliases !== undefined) {
    for (const alias of adapter.aliases) {
      aliasMap.set(alias.toLowerCase(), adapter.id)
    }
  }
}

/** 按框架 id 获取适配器。 */
export function getAdapter(id: ConcreteFramework): FrameworkAdapter {
  const found = registry.get(id)
  if (found === undefined) throw new Error('未注册的测试框架适配器：' + id)
  return found
}

/** 返回按 auto 优先级排序的所有已注册适配器。 */
export function listAdapters(): FrameworkAdapter[] {
  return [...registry.values()].sort((a, b) => a.priority - b.priority)
}

registerAdapter(vitestAdapter)
registerAdapter(jestAdapter)
registerAdapter(pytestAdapter)
registerAdapter(nodeAdapter)

/** 解析 framework 参数（含别名 node:test -> node、py -> pytest）；非法值抛中文错误。 */
export function readFramework(raw: unknown): Framework {
  if (raw === undefined || raw === null) return 'auto'
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'auto') return 'auto'
    const mapped = aliasMap.get(normalized)
    if (mapped !== undefined) return mapped
  }
  throw new Error('framework 只支持 auto / vitest / jest / pytest / node，收到：' + String(raw))
}

/** 在 cwd 里探测本地框架 CLI 入口；显式指定时缺失会给出中文指引。 */
export function detectFramework(cwd: string, requested: Framework): ConcreteFramework {
  if (requested !== 'auto') {
    const adapter = getAdapter(requested)
    if (adapter.requireLocalOnExplicit && adapter.detect(cwd) === null) {
      throw new Error(adapter.missingMessage ? adapter.missingMessage(cwd) : '未找到本地 ' + requested + ' 框架入口。')
    }
    return requested
  }
  for (const adapter of listAdapters()) {
    if (adapter.detect(cwd) !== null) return adapter.id
  }
  return 'node'
}

/** 构建一次测试运行的执行计划。runIndex 仅用于给临时报告文件命名。 */
export function buildPlan(
  cwd: string,
  target: string,
  requested: Framework,
  runIndex: number,
  pythonPath?: string,
  options?: PlanBuildOptions,
): TestPlan {
  const safeTarget = assertTarget(target)
  const framework = detectFramework(cwd, requested)
  const token = crypto.randomBytes(6).toString('hex')
  const adapter = getAdapter(framework)
  return adapter.buildPlan({
    cwd,
    target: safeTarget,
    runIndex,
    token,
    pythonPath,
    options,
  })
}

/** 汇总当前工作区可用的测试框架与解释器环境，供 flaky_health 自检使用。 */
export function detectEnvironment(
  cwd: string,
  cfg?: Pick<ResolvedFlakeConfig, 'pythonPath' | 'pythonPathExplicit'>,
): EnvironmentDetection {
  const vitestPath = vitestAdapter.detect(cwd)
  const jestPath = jestAdapter.detect(cwd)
  const pytestConfig = pytestAdapter.detect(cwd)
  const pythonInfo = resolvePythonPathInfo(cwd, cfg)
  const defaultFramework = detectFramework(cwd, 'auto')
  return {
    cwd,
    defaultFramework,
    nodeVersion: process.version,
    nodePath: process.execPath,
    vitest: { available: vitestPath !== null, entryPath: vitestPath },
    jest: { available: jestPath !== null, entryPath: jestPath },
    pytest: {
      configFound: pytestConfig !== null,
      configPath: pytestConfig,
      pythonPath: pythonInfo.pythonPath,
      pythonSource: pythonInfo.source,
    },
    frameworks: {
      vitest: vitestPath,
      jest: jestPath,
      pytestConfig,
      pythonPath: pythonInfo.pythonPath,
      node: process.version,
    },
  }
}
