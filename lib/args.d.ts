/**
 * 测试框架探测与 argv 构建：直接调用本地 node_modules 里的 CLI 入口，
 * 全程 argv 数组、无 shell，避免 npx 下载与命令注入。
 *
 * @module dsh-flakefinder/args
 */
export type Framework = 'auto' | 'vitest' | 'jest' | 'pytest' | 'node';
export type ReportKind = 'json' | 'tap' | 'junit';
export interface TestPlan {
    framework: Exclude<Framework, 'auto'>;
    reportKind: ReportKind;
    reportPath: string;
    argv: string[];
    label: string;
}
/** 解析 framework 参数；非法值抛中文错误。 */
export declare function readFramework(raw: unknown): Framework;
/** 在 cwd 里探测本地框架 CLI 入口；显式指定时缺失会给出中文指引。 */
export declare function detectFramework(cwd: string, requested: Framework): Exclude<Framework, 'auto'>;
/** 构建一次测试运行的执行计划。runIndex 仅用于给临时报告文件命名。 */
export declare function buildPlan(cwd: string, target: string, requested: Framework, runIndex: number, pythonPath?: string): TestPlan;
