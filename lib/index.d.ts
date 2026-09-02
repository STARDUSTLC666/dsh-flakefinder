/**
 * dsh-flakefinder —— 测试稳定性工具插件（node 半身，配置走 cordis.patch.yml）。
 *
 * 插件导出 apply(ctx, config)：注册五个面向模型的工具（flaky_detect / flaky_history /
 * flaky_quarantine / flaky_clear / flaky_report）。测试进程走 DSH 官方 subprocess 服务
 * （argv 数组、无 shell），隔离清单写操作默认走宿主审批门。零运行时依赖。
 *
 * @module dsh-flakefinder
 */
import { type FlakeConfig } from './config.js';
import { type SubprocessSpawnLike } from './runner.js';
import { type FlakeToolDefinition } from './tools.js';
/** cordis 服务注入：apply 里要用 ctx.subprocess 与 ctx.tools。 */
export declare const name = "flakefinder";
export declare const inject: string[];
/** 插件所需的最小 ctx 面。 */
export interface FlakePluginContext {
    subprocess: {
        spawn: SubprocessSpawnLike;
    };
    tools: {
        register(definition: FlakeToolDefinition): () => void;
    };
    on?(event: string, listener: (...args: any[]) => unknown, options?: {
        prepend?: boolean;
    }): (() => void) | void;
}
/**
 * 插件入口：解析配置、封装执行器与存储、注册五个工具。
 */
export declare function apply(ctx: FlakePluginContext, config?: FlakeConfig | null): void;
export * from './args.js';
export * from './classify.js';
export * from './config.js';
export * from './parse.js';
export * from './runner.js';
export * from './store.js';
export * from './tools.js';
