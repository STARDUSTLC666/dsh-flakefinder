/**
 * 六个面向模型的测试稳定性工具：
 * flaky_detect / flaky_history / flaky_quarantine / flaky_clear / flaky_report / flaky_health。
 *
 * @module dsh-flakefinder/tools
 */
import { type ResolvedFlakeConfig } from './config.js';
import { type ProcessRunner } from './runner.js';
import { type Store } from './store.js';
export interface ContentBlock {
    type: 'text';
    text: string;
}
export interface FlakeToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
    output: {
        schema: Record<string, unknown>;
        render(args: unknown, value: unknown): ContentBlock[];
    };
    isConcurrencySafe?(args?: unknown): boolean;
    execute(args: unknown, exec?: unknown): Promise<unknown>;
    timeoutMs?: number;
}
/** 构建六个工具定义（每次执行只解析当前调用的工作区与取消信号，不重建工具定义）。 */
export declare function buildFlakeTools(cfg: ResolvedFlakeConfig, runner: ProcessRunner, store: Store): FlakeToolDefinition[];
