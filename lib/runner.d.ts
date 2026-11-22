/**
 * 进程执行层：复用 dsh-docker 同款 subprocess 包装，并按计划读取 JSON / JUnit / TAP 报告。
 * 支持单轮超时错误区分、4MB 截断检测、以及受控并发与早停批次调度。
 *
 * @module dsh-flakefinder/runner
 */
import type { TestPlan } from './args.js';
import type { DetectMode } from './config.js';
import { type NormalizedRun } from './parse.js';
export interface RunResult {
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    truncated?: boolean;
}
export interface ProcessRunner {
    run(argv: readonly string[], options?: {
        timeoutMs?: number;
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<RunResult>;
}
export interface SubprocessHandleLike {
    done: Promise<{
        exitCode: number | null;
        signal: string | null;
    }>;
    collected: {
        stdout?: {
            readFrom(offset: number): {
                text: string;
                lossy?: boolean;
            };
        };
        stderr?: {
            readFrom(offset: number): {
                text: string;
                lossy?: boolean;
            };
        };
    };
    terminate(): void;
}
export interface SubprocessSpawnLike {
    (spec: {
        argv: readonly string[];
        cwd: string;
        stdio: {
            stdin: 'ignore';
            stdout: {
                maxBytes: number;
            };
            stderr: {
                maxBytes: number;
            };
        };
        graceMs: number;
        signal?: AbortSignal;
    }): SubprocessHandleLike;
}
/** 单轮测试运行超时错误，与宿主 AbortSignal 取消严格区分。 */
export declare class FlakeTimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(timeoutMs: number, message?: string);
}
/** 判断错误是否为单轮测试超时错误。 */
export declare function isTimeoutError(error: unknown): error is FlakeTimeoutError;
/** 用 DSH subprocess 服务构造 ProcessRunner。 */
export declare function createSubprocessRunner(spawn: SubprocessSpawnLike, graceMs: number, defaultTimeoutMs: number): ProcessRunner;
export interface FlakeRun {
    index: number;
    report: NormalizedRun | null;
    durationMs: number;
    exitCode: number | null;
    stderr: string;
    timedOut?: boolean;
    truncated?: boolean;
    seed?: number;
    error?: string;
}
export interface BatchOptions {
    timeoutMs: number;
    cwd?: string;
    signal?: AbortSignal;
    concurrency?: number;
    mode?: DetectMode;
}
/** 执行一个测试计划并读取报告；进程失败但报告存在时仍返回报告，单轮超时返回结构化超时记录。 */
export declare function executePlan(runner: ProcessRunner, plan: TestPlan, index: number, timeoutMs: number, cwd?: string, signal?: AbortSignal): Promise<FlakeRun>;
/**
 * 批量执行多个测试计划：支持 1-4 路并发 worker 池，以及 verify-fix / until-flaky 早停模式。
 * 返回结果始终按 1-based `index` 升序排列；宿主 signal 取消时立刻中止并抛出取消原因。
 */
export declare function executePlansBatch(runner: ProcessRunner, plans: readonly TestPlan[], options: BatchOptions): Promise<FlakeRun[]>;
