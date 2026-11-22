/**
 * 测试报告解析：vitest / jest 的 JSON reporter、pytest 的 JUnit XML、
 * 与 node:test 的层级 TAP 13（含 YAML 诊断块）统一成一次运行的扁平用例列表。
 *
 * @module dsh-flakefinder/parse
 */
export type TestStatus = 'passed' | 'failed' | 'skipped';
export interface TestErrorInfo {
    type?: string;
    message: string;
    stack?: string;
}
export interface NormalizedTest {
    id: string;
    file: string;
    name: string;
    status: TestStatus;
    durationMs: number;
    error?: TestErrorInfo;
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
export interface TapParseOptions {
    cwd?: string;
    target?: string;
}
/** vitest 与 jest 的 JSON 结构高度接近，这里统一读取。 */
export declare function parseJsonReport(text: string, framework: string, cwd?: string): NormalizedRun;
/** 解析 pytest 的 JUnit XML 报告。 */
export declare function parseJunitReport(text: string, cwd?: string): NormalizedRun;
/** 解析 node:test 的 TAP 13 输出：支持层级子测试（仅输出叶节点）与 YAML 诊断块。 */
export declare function parseTapReport(text: string, options?: TapParseOptions): NormalizedRun;
