/**
 * 多轮结果聚合与 flaky 判定：纯函数，便于单测边界。
 *
 * @module dsh-flakefinder/classify
 */
import type { NormalizedRun } from './parse.js';
export type RunVerdict = 'stable-pass' | 'stable-fail' | 'flaky' | 'empty' | 'skipped';
export type TestVerdict = 'stable-pass' | 'stable-fail' | 'flaky' | 'skipped';
export interface RunRecord {
    runIndex: number;
    success: boolean;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
}
export interface TestRecord {
    id: string;
    file: string;
    name: string;
    passes: number;
    failures: number;
    skips: number;
    failureRate: number;
    verdict: TestVerdict;
}
export interface DetectionResult {
    runs: RunRecord[];
    verdict: RunVerdict;
    stablePassCount: number;
    stableFailCount: number;
    flakyCount: number;
    skippedCount: number;
    tests: TestRecord[];
    durationMs: number;
}
export declare function aggregate(runs: Array<{
    index: number;
    report: NormalizedRun | null;
    durationMs: number;
    error?: string;
}>): DetectionResult;
/** 结果里需要写入历史的 flaky 用例。 */
export declare function flakyTests(result: DetectionResult): Array<{
    file: string;
    name: string;
    failureRate: number;
}>;
