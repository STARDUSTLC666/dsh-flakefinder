/**
 * dsh-flakefinder —— 测试稳定性工具插件（node 半身，配置走 cordis.patch.yml）。
 *
 * 插件导出 apply(ctx, config)：注册五个面向模型的工具（flaky_detect / flaky_history /
 * flaky_quarantine / flaky_clear / flaky_report）。测试进程走 DSH 官方 subprocess 服务
 * （argv 数组、无 shell），隔离清单写操作默认走宿主审批门。零运行时依赖。
 *
 * @module dsh-flakefinder
 */

import { resolveConfig, type FlakeConfig } from './config.js'
import { createSubprocessRunner, type SubprocessSpawnLike } from './runner.js'
import { createStore } from './store.js'
import { buildFlakeTools, type FlakeToolDefinition } from './tools.js'

/** cordis 服务注入：apply 里要用 ctx.subprocess 与 ctx.tools。 */
export const inject = ['subprocess', 'tools']

/** 插件所需的最小 ctx 面。 */
export interface FlakePluginContext {
  subprocess: { spawn: SubprocessSpawnLike }
  tools: { register(definition: FlakeToolDefinition, options?: { prepend?: boolean }): () => void }
  get?(name: 'approval'): unknown
  on?(event: string, listener: () => void): () => void
}

/**
 * 插件入口：解析配置、封装执行器与存储、注册五个工具。
 */
export function apply(ctx: FlakePluginContext, config?: FlakeConfig | null): void {
  let cfg
  try {
    cfg = resolveConfig(config)
  } catch (error) {
    console.warn('[dsh-flakefinder] ' + (error instanceof Error ? error.message : String(error)))
    cfg = resolveConfig(null)
  }

  const runner = createSubprocessRunner(ctx.subprocess.spawn, cfg.graceMs, cfg.timeoutMs)
  const store = createStore(cfg.dataDir, cfg.quarantineFile)
  const tools = buildFlakeTools(cfg, runner, store)
  const disposers: Array<() => void> = []
  for (const definition of tools) {
    const wrapped = { ...definition }
    if (wrapped.gate !== undefined) {
      const original = wrapped.gate.bind(wrapped)
      wrapped.gate = async (exec: unknown, next: () => Promise<unknown>) => {
        const record = (typeof exec === 'object' && exec !== null ? exec : {}) as Record<string, unknown>
        return original({ ...record, approval: ctx.get?.('approval') }, next)
      }
    }
    disposers.push(ctx.tools.register(wrapped, { prepend: true }))
  }
  if (typeof ctx.on === 'function') {
    ctx.on('dispose', () => {
      for (const dispose of disposers) dispose()
    })
  }
}

export * from './args.js'
export * from './classify.js'
export * from './config.js'
export * from './parse.js'
export * from './runner.js'
export * from './store.js'
export * from './tools.js'
