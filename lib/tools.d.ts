/**
 * 五个面向模型的测试稳定性工具：
 * flaky_detect / flaky_history / flaky_quarantine / flaky_clear / flaky_report。
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
    execute(args: unknown, exec: unknown): Promise<unknown>;
    gate?(exec: unknown, next: () => Promise<unknown>): Promise<unknown>;
    timeoutMs?: number;
}
/** 构建五个工具定义。 */
export declare function buildFlakeTools(cfg: ResolvedFlakeConfig, runner: ProcessRunner, store: Store): FlakeToolDefinition[];
