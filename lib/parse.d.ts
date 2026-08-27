/**
 * 测试报告解析：vitest / jest 的 JSON reporter 与 node:test 的 TAP 输出统一成
 * 一次运行的扁平用例列表。
 *
 * @module dsh-flakefinder/parse
 */
export type TestStatus = 'passed' | 'failed' | 'skipped';
export interface NormalizedTest {
    id: string;
    file: string;
    name: string;
    status: TestStatus;
    durationMs: number;
}
export interface NormalizedRun {
    framework: string;
    success: boolean;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    tests: NormalizedTest[];
}
/** vitest 与 jest 的 JSON 结构高度接近，这里统一读取。 */
export declare function parseJsonReport(text: string, framework: string): NormalizedRun;
/** 解析 pytest 的 JUnit XML 报告。 */
export declare function parseJunitReport(text: string): NormalizedRun;
/** 解析 node:test 的 TAP 输出；子测试行忽略，只保留顶层用例。 */
export declare function parseTapReport(text: string): NormalizedRun;
