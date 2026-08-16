/**
 * dsh-flakefinder 配置解析：重复次数、超时、审批策略与存储路径。
 *
 * @module dsh-flakefinder/config
 */

import { homedir } from 'node:os'
import path from 'node:path'

/** 插件行配置（cordis.patch.yml 里的 config 段，可缺省）。 */
export interface FlakeConfig {
  /** flaky_detect 默认重复次数（3-20）。 */
  defaultRuns?: number
  /** 单次运行允许的最大重复次数（3-50，默认 20）。 */
  maxRuns?: number
  /** 单次测试运行的超时（毫秒，默认 120000）。 */
  timeoutMs?: number
  /** 超时后给测试进程的宽限时间（毫秒，默认 10000）。 */
  graceMs?: number
  /** quarantine/clear 两个写工具是否走宿主审批门（默认 true）。 */
  writeApproval?: boolean
  /** 历史存储目录（默认 DSH_HOME/.dsh-flakefinder）。 */
  dataDir?: string
  /** 项目隔离清单路径（默认 cwd/.flakefinder.json）。 */
  quarantineFile?: string
  /** Python 解释器命令（pytest 框架使用，默认 DSH_FLAKEFINDER_PYTHON 或 python/python3）。 */
  pythonPath?: string
}

/** 解析后的配置。 */
export interface ResolvedFlakeConfig {
  defaultRuns: number
  maxRuns: number
  timeoutMs: number
  graceMs: number
  writeApproval: boolean
  dataDir: string
  quarantineFile: string
  pythonPath: string
}

const MIN_RUNS = 3
const MAX_RUNS = 50

/** DSH_HOME 缺省时退回用户目录下的 .dsh。 */
function defaultDataDir(): string {
  const home = process.env.DSH_HOME?.trim()
  return path.join(home !== undefined && home !== '' ? home : path.join(homedir(), '.dsh'), '.dsh-flakefinder')
}

/** 解析并校验配置，非法值抛出中文错误。 */
export function resolveConfig(config: FlakeConfig | undefined | null, cwd = process.cwd()): ResolvedFlakeConfig {
  const cfg = config ?? {}

  let defaultRuns = 5
  if (cfg.defaultRuns !== undefined) {
    defaultRuns = readRuns('defaultRuns', cfg.defaultRuns, 3, 20)
  }
  let maxRuns = 20
  if (cfg.maxRuns !== undefined) {
    maxRuns = readRuns('maxRuns', cfg.maxRuns, MIN_RUNS, MAX_RUNS)
  }
  if (defaultRuns > maxRuns) defaultRuns = maxRuns

  let timeoutMs = 120000
  if (cfg.timeoutMs !== undefined) {
    if (typeof cfg.timeoutMs !== 'number' || !Number.isFinite(cfg.timeoutMs) || cfg.timeoutMs <= 0) {
      throw new Error('timeoutMs 必须是大于 0 的数字（毫秒）。')
    }
    timeoutMs = Math.min(10 * 60 * 1000, Math.max(10000, Math.round(cfg.timeoutMs)))
  }

  let graceMs = 10000
  if (cfg.graceMs !== undefined) {
    if (typeof cfg.graceMs !== 'number' || !Number.isFinite(cfg.graceMs) || cfg.graceMs <= 0) {
      throw new Error('graceMs 必须是大于 0 的数字（毫秒）。')
    }
    graceMs = Math.min(120000, Math.max(1000, Math.round(cfg.graceMs)))
  }

  const writeApproval = cfg.writeApproval !== false

  const dataDir = typeof cfg.dataDir === 'string' && cfg.dataDir.trim() !== ''
    ? path.resolve(cwd, cfg.dataDir.trim())
    : defaultDataDir()

  const quarantineFile = typeof cfg.quarantineFile === 'string' && cfg.quarantineFile.trim() !== ''
    ? path.resolve(cwd, cfg.quarantineFile.trim())
    : path.join(cwd, '.flakefinder.json')

  const pythonPath = typeof cfg.pythonPath === 'string' && cfg.pythonPath.trim() !== ''
    ? cfg.pythonPath.trim()
    : (process.env.DSH_FLAKEFINDER_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3'))

  return { defaultRuns, maxRuns, timeoutMs, graceMs, writeApproval, dataDir, quarantineFile, pythonPath }
}

function readRuns(label: string, value: unknown, lo: number, hi: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(label + ' 必须是数字。')
  const rounded = Math.round(value)
  if (rounded < lo || rounded > hi) throw new Error(label + ' 必须在 ' + String(lo) + '-' + String(hi) + ' 之间。')
  return rounded
}

/** 解析并钳制 flaky_detect 的 runs 参数。 */
export function resolveRuns(raw: unknown, cfg: ResolvedFlakeConfig): number {
  if (raw === undefined || raw === null) return cfg.defaultRuns
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error('runs 必须是数字（3-' + String(cfg.maxRuns) + '）。')
  const runs = Math.round(raw)
  if (runs < 3 || runs > cfg.maxRuns) throw new Error('runs 必须在 3-' + String(cfg.maxRuns) + ' 之间。')
  return runs
}

/** 校验测试目标：非空且不能以 - 开头，避免被测试框架解析成选项。 */
export function assertTarget(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new Error('target（测试文件/目录/glob）为必填，请提供非空字符串。')
  if (trimmed.startsWith('-')) throw new Error('target 不能以 - 开头：' + value)
  return trimmed
}

/** 从参数里取字符串；不识别类型时返回 undefined。 */
export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** 从参数里取必填字符串；缺失时抛中文错误。 */
export function requiredString(args: Record<string, unknown>, key: string, label: string): string {
  const value = optionalString(args, key)
  if (value === undefined) throw new Error(label + '（参数 ' + key + '）为必填，请提供非空字符串。')
  return value
}

/** 从参数里取整数；缺失用默认值，非法抛中文错误。 */
export function optionalInteger(args: Record<string, unknown>, key: string, label: string, lo: number, hi: number, fallback: number): number {
  const value = args[key]
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(label + '（参数 ' + key + '）必须是数字。')
  const rounded = Math.round(value)
  if (rounded < lo || rounded > hi) throw new Error(label + '（参数 ' + key + '）必须在 ' + String(lo) + '-' + String(hi) + ' 之间。')
  return rounded
}
