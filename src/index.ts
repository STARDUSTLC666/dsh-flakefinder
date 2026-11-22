import { registerUpdates } from '@stardustlc/dsh-updates'
/**
 * dsh-flakefinder —— 测试稳定性工具插件（node 半身，配置走 cordis.patch.yml）。
 *
 * 插件导出 apply(ctx, config)：注册六个面向模型的工具（flaky_detect / flaky_history /
 * flaky_quarantine / flaky_clear / flaky_report / flaky_health）。测试进程走 DSH 官方
 * subprocess 服务（argv 数组、无 shell），隔离清单写操作默认走宿主审批门。
 * 运行时依赖 proper-lockfile 与 @stardustlc/dsh-updates。
 *
 * @module dsh-flakefinder
 */

import { resolveConfig, type FlakeConfig } from './config.js'
import { createSubprocessRunner, type SubprocessSpawnLike } from './runner.js'
import { createStore } from './store.js'
import { buildFlakeTools, type FlakeToolDefinition } from './tools.js'
import { approvalPolicy, approvalProblem, type ApprovalContext } from './approval.js'

/** cordis 服务注入：apply 里要用 ctx.subprocess 与 ctx.tools。 */
export const name = 'flakefinder'
export const inject = ['subprocess', 'tools']

/** 插件所需的最小 ctx 面。 */
export interface FlakePluginContext extends ApprovalContext {
  logger?: { warn?(message: string, ...args: unknown[]): void }
  subprocess: { spawn: SubprocessSpawnLike }
  tools: { register(definition: FlakeToolDefinition): () => void }
  effect?(effect: () => () => void, label?: string): unknown
  on?(event: string, listener: (...args: any[]) => unknown, options?: { prepend?: boolean }): (() => void) | void
}

function parsePreExecuteArgs(rawArgs: unknown): Record<string, unknown> {
  if (typeof rawArgs === 'object' && rawArgs !== null) return rawArgs as Record<string, unknown>
  if (typeof rawArgs === 'string' && rawArgs.trim() !== '') {
    try {
      const parsed = JSON.parse(rawArgs)
      if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>
    } catch {
      // 参数不是合法 JSON 时退回默认审批说明。
    }
  }
  return {}
}

function formatApprovalReason(toolName: 'flaky_quarantine' | 'flaky_clear', rawArgs: unknown): string {
  const args = parsePreExecuteArgs(rawArgs)
  const tests = Array.isArray(args.tests)
    ? args.tests.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim())
    : []

  if (tests.length === 0) {
    return toolName === 'flaky_quarantine'
      ? '把测试用例写入 .flakefinder.json 隔离清单'
      : '从 .flakefinder.json 隔离清单移除测试用例'
  }

  const list = tests.map(item => '  - ' + item).join('\n')
  if (toolName === 'flaky_quarantine') {
    const meta: string[] = []
    if (typeof args.reason === 'string' && args.reason.trim() !== '') {
      meta.push('原因：' + args.reason.trim())
    }
    if (typeof args.issue === 'string' && args.issue.trim() !== '') {
      meta.push('关联：' + args.issue.trim())
    }
    const suffix = meta.length > 0 ? '\n' + meta.join('；') : ''
    return '把以下 ' + String(tests.length) + ' 条测试用例写入 .flakefinder.json 隔离清单：\n' + list + suffix
  }

  return '从 .flakefinder.json 隔离清单移除以下 ' + String(tests.length) + ' 条测试用例：\n' + list
}

/**
 * 插件入口：解析配置、封装执行器与存储、注册六个工具。
 */
export function apply(ctx: FlakePluginContext, config?: FlakeConfig | null): void {
  registerUpdates(ctx, { name: "dsh-flakefinder" })

  const warn = (message: string) => {
    if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message)
    else console.warn(message)
  }

  let cfg
  try {
    cfg = resolveConfig(config)
  } catch (error) {
    warn('[dsh-flakefinder] ' + (error instanceof Error ? error.message : String(error)))
    cfg = resolveConfig(null)
  }

  const runner = createSubprocessRunner((spec) => ctx.subprocess.spawn(spec), cfg.graceMs, cfg.timeoutMs)
  const store = createStore(cfg.dataDir, cfg.quarantineFile)
  const tools = buildFlakeTools(cfg, runner, store)
  const disposers: Array<() => void> = []
  for (const definition of tools) {
    disposers.push(ctx.tools.register(definition))
  }
  if (typeof ctx.on === 'function' && cfg.writeApproval) {
    ctx.on('tools/pre-execute', async (exec: { name?: unknown; arguments?: unknown }, next: () => Promise<unknown>) => {
      if (exec.name !== 'flaky_quarantine' && exec.name !== 'flaky_clear') return next()
      const downstream = await next()
      if ((downstream as { kind?: unknown })?.kind === 'deny') return downstream
      const problem = approvalProblem(approvalPolicy(ctx, exec), 'writeApproval')
      if (problem) return { kind: 'deny', reason: problem }
      return { kind: 'ask', reason: formatApprovalReason(exec.name, exec.arguments) }
    }, { prepend: true })
  }
  const teardown = () => {
    for (const dispose of disposers) dispose()
  }
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => teardown, 'flakefinder.tools()')
  } else if (typeof ctx.on === 'function') {
    ctx.on('dispose', teardown)
  }
}

export * from './adapters.js'
export * from './args.js'
export * from './classify.js'
export * from './config.js'
export * from './parse.js'
export * from './runner.js'
export * from './store.js'
export * from './tools.js'
