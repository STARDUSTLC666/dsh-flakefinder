/**
 * 进程执行层：复用 dsh-docker 同款 subprocess 包装，并按计划读取 JSON 报告。
 *
 * @module dsh-flakefinder/runner
 */
import type { TestPlan } from './args.js';
import { type NormalizedRun } from './parse.js';
export interface RunResult {
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
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
            };
        };
        stderr?: {
            readFrom(offset: number): {
                text: string;
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
/** 用 DSH subprocess 服务构造 ProcessRunner。 */
export declare function createSubprocessRunner(spawn: SubprocessSpawnLike, graceMs: number, defaultTimeoutMs: number): ProcessRunner;
export interface FlakeRun {
    index: number;
    report: NormalizedRun | null;
    durationMs: number;
    exitCode: number | null;
    stderr: string;
    error?: string;
}
/** 执行一个测试计划并读取报告；进程失败但报告存在时仍返回报告。 */
export declare function executePlan(runner: ProcessRunner, plan: TestPlan, index: number, timeoutMs: number, cwd?: string, signal?: AbortSignal): Promise<FlakeRun>;
