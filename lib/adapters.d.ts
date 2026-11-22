/**
 * 测试框架适配器与注册表：覆盖 vitest / jest / pytest / node:test，
 * 支持 monorepo 向上查找 node_modules、workspace .venv 自动探测、
 * 精准过滤、关闭覆盖率与顺序打乱（shuffle + seed）。
 * 全程 argv 数组、无 shell，避免 npx 下载与命令注入。
 *
 * @module dsh-flakefinder/adapters
 */
import { type ResolvedFlakeConfig } from './config.js';
export type ConcreteFramework = 'vitest' | 'jest' | 'pytest' | 'node';
export type Framework = 'auto' | ConcreteFramework;
export type ReportKind = 'json' | 'tap' | 'junit';
export interface PlanBuildOptions {
    /** 按用例名/模式过滤单个或多个用例。 */
    testName?: string;
    /** 是否关闭覆盖率采集以加速复跑（默认 true，对 vitest / jest 生效）。 */
    noCoverage?: boolean;
    /** 是否打乱测试执行顺序（对 vitest / jest 生效）。 */
    shuffle?: boolean;
    /** 随机种子（0-2147483647）；与 shuffle 配合或单独传入用于复现。 */
    seed?: number;
    /** 外部批次并发数；Jest 在 concurrency<=1 且未开启 shuffle 时默认带 --runInBand。 */
    concurrency?: number;
    /** pythonPath 是否由用户显式配置（为 true 时跳过 .venv 自动探测）。 */
    pythonPathExplicit?: boolean;
}
export interface TestPlan {
    framework: ConcreteFramework;
    reportKind: ReportKind;
    reportPath: string;
    argv: string[];
    label: string;
    seed?: number;
    target?: string;
}
export interface AdapterContext {
    cwd: string;
    target: string;
    runIndex: number;
    token: string;
    pythonPath?: string;
    options?: PlanBuildOptions;
}
/** 面向未来框架扩展（如 Playwright / Go）的标准适配器契约。 */
export interface FrameworkAdapter {
    readonly id: ConcreteFramework;
    readonly aliases?: readonly string[];
    readonly reportKind: ReportKind;
    /** auto 探测优先级，数字越小越优先。 */
    readonly priority: number;
    /** 显式指定该框架时，是否要求本地入口必须存在。 */
    readonly requireLocalOnExplicit?: boolean;
    /** 探测当前工作区是否具备该框架（返回入口或配置文件路径，未找到返回 null）。 */
    detect(cwd: string): string | null;
    /** 显式指定但本地缺失时的中文指引。 */
    missingMessage?(cwd: string): string;
    /** 构建单轮执行的完整计划。 */
    buildPlan(ctx: AdapterContext): TestPlan;
}
export type PythonPathSource = 'explicit' | 'virtual-env' | 'workspace-venv' | 'default';
export interface PythonResolution {
    pythonPath: string;
    source: PythonPathSource;
}
export interface EnvironmentDetection {
    cwd: string;
    defaultFramework: ConcreteFramework;
    nodeVersion: string;
    nodePath: string;
    vitest: {
        available: boolean;
        entryPath: string | null;
    };
    jest: {
        available: boolean;
        entryPath: string | null;
    };
    pytest: {
        configFound: boolean;
        configPath: string | null;
        pythonPath: string;
        pythonSource: PythonPathSource;
    };
    frameworks: {
        vitest: string | null;
        jest: string | null;
        pytestConfig: string | null;
        pythonPath: string;
        node: string;
    };
}
/** 从 cwd 向上逐级查找本地 node_modules 里的 CLI 入口（适配 monorepo hoisted 依赖）。 */
export declare function findLocalModuleEntry(cwd: string, ...parts: string[]): string | null;
/** 在 cwd 中查找 pytest 配置文件路径。 */
export declare function findPytestConfig(cwd: string): string | null;
/**
 * 解析 pytest 使用的 Python 解释器路径及来源。
 * 当用户未显式配置 pythonPath / DSH_FLAKEFINDER_PYTHON 时，按顺序自动探测：
 * VIRTUAL_ENV -> 向上查找 .venv / venv -> 平台默认 python / python3。
 */
export declare function resolvePythonPathInfo(cwd: string, cfg?: Pick<ResolvedFlakeConfig, 'pythonPath' | 'pythonPathExplicit'>, runtime?: {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
}): PythonResolution;
/** 解析 pytest 使用的 Python 解释器路径。 */
export declare function resolvePythonPath(cwd: string, cfg?: Pick<ResolvedFlakeConfig, 'pythonPath' | 'pythonPathExplicit'>, runtime?: {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
}): string;
/** 注册一个测试框架适配器（覆盖同 id 适配器并更新别名映射）。 */
export declare function registerAdapter(adapter: FrameworkAdapter): void;
/** 按框架 id 获取适配器。 */
export declare function getAdapter(id: ConcreteFramework): FrameworkAdapter;
/** 返回按 auto 优先级排序的所有已注册适配器。 */
export declare function listAdapters(): FrameworkAdapter[];
/** 解析 framework 参数（含别名 node:test -> node、py -> pytest）；非法值抛中文错误。 */
export declare function readFramework(raw: unknown): Framework;
/** 在 cwd 里探测本地框架 CLI 入口；显式指定时缺失会给出中文指引。 */
export declare function detectFramework(cwd: string, requested: Framework): ConcreteFramework;
/** 构建一次测试运行的执行计划。runIndex 仅用于给临时报告文件命名。 */
export declare function buildPlan(cwd: string, target: string, requested: Framework, runIndex: number, pythonPath?: string, options?: PlanBuildOptions): TestPlan;
/** 汇总当前工作区可用的测试框架与解释器环境，供 flaky_health 自检使用。 */
export declare function detectEnvironment(cwd: string, cfg?: Pick<ResolvedFlakeConfig, 'pythonPath' | 'pythonPathExplicit'>): EnvironmentDetection;
