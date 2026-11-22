/**
 * 多轮结果聚合、flaky 判定与根因诊断：纯函数，零运行时依赖，便于单测边界。
 *
 * @module dsh-flakefinder/classify
 */
import type { NormalizedRun, TestErrorInfo } from './parse.js';
export type RunVerdict = 'stable-pass' | 'stable-fail' | 'flaky' | 'empty' | 'skipped';
export type TestVerdict = 'stable-pass' | 'stable-fail' | 'flaky' | 'skipped';
export type TimelineSymbol = 'P' | 'F' | 'S' | 'T' | '-';
export type FlakePattern = 'cold-start' | 'state-leak' | 'timeout-race' | 'order-dependent' | 'teardown-crash' | 'intermittent';
export interface AggregateRunInput {
    index: number;
    report: NormalizedRun | null;
    durationMs: number;
    error?: string;
    timedOut?: boolean;
    truncated?: boolean;
    seed?: number;
}
export interface ErrorCluster {
    fingerprint: string;
    count: number;
    type?: string;
    message: string;
    sampleStack?: string;
    runIndices: number[];
}
export interface RunRecord {
    runIndex: number;
    success: boolean;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
    timedOut?: boolean;
    truncated?: boolean;
    seed?: number;
    error?: string;
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
    timeline: TimelineSymbol[];
    passDurationAvgMs: number | null;
    failDurationAvgMs: number | null;
    maxDurationMs: number;
    p95DurationMs: number;
    errorClusters: ErrorCluster[];
    patterns: FlakePattern[];
    failedSeeds?: number[];
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
    confidence95MaxFlakeRate?: number;
}
export interface FlakyTestSummary {
    file: string;
    name: string;
    failureRate: number;
    patterns?: FlakePattern[];
    topError?: string;
}
/** 脱敏常见密钥/令牌，避免写入诊断报告或堆栈采样。 */
export declare function redactSecrets(text: string): string;
/** 归一化错误文本中的动态噪声（时间戳、UUID、地址、端口、临时路径、数字差异），用于聚类指纹。 */
export declare function normalizeErrorForFingerprint(text: string): string;
/** 计算结构化错误指纹，用于把同一根因的多次失败归为一簇。 */
export declare function errorFingerprint(error: TestErrorInfo): string;
/** 压缩代表堆栈：脱敏、保留头部与关键业务帧，限制行数（默认 12 行）与字符数（默认 1200）。 */
export declare function compactStack(stack: string, maxLines?: number, maxChars?: number): string;
/** 根因模式的简明中文说明。 */
export declare function patternLabel(pattern: FlakePattern): string;
/**
 * 连续全通过 runs 轮后，在指定置信度下的最大潜在偶发失败率上界（百分比，保留 1 位小数）。
 * 公式：1 - (1 - confidence)^(1 / runs)
 */
export declare function confidenceUpperBound(runs: number, confidence?: number): number;
/**
 * 在指定置信度下，要将潜在偶发失败率压到 maxFlakeRate 以下所需的最少全通过轮数。
 * maxFlakeRate 同时支持百分比（如 5 表示 5%、10 表示 10%）与比例（如 0.05、0.1）。
 */
export declare function runsNeededForThreshold(maxFlakeRate: number, confidence?: number): number;
export declare function aggregate(runs: AggregateRunInput[]): DetectionResult;
/** 结果里需要写入历史的 flaky 用例（保持精简，不携带大堆栈）。 */
export declare function flakyTests(result: DetectionResult): FlakyTestSummary[];
