/**
 * 历史与隔离清单存储：按工作区隔离历史、兼容旧版全局历史与 v1 隔离清单、原子写入与文件锁。
 *
 * @module dsh-flakefinder/store
 */
export interface HistoryFlakyTest {
    file: string;
    name: string;
    failureRate: number;
    patterns?: string[];
    topError?: string;
}
export interface HistoryEntry {
    timestamp: string;
    target: string;
    framework: string;
    runs: number;
    durationMs: number;
    verdict: string;
    stablePassCount: number;
    stableFailCount: number;
    flakyCount: number;
    skippedCount: number;
    flakyTests: HistoryFlakyTest[];
    workspace?: string;
    testName?: string;
    mode?: string;
    concurrency?: number;
    shuffle?: boolean;
    failedSeeds?: number[];
    errorSummary?: Array<{
        message: string;
        count: number;
    }>;
}
export interface QuarantineEntry {
    file: string;
    name: string | null;
    reason: string;
    since: string;
    updatedAt?: string;
    lastVerifiedAt?: string;
    lastFailureRate?: number;
    issue?: string;
}
export interface QuarantineDocument {
    version: 1;
    quarantined: QuarantineEntry[];
}
export interface QuarantineAddOptions {
    issue?: string;
    lastFailureRate?: number;
    lastVerifiedAt?: string;
}
export interface StoreOptions {
    workspace?: string;
}
export type HistoryScope = 'workspace' | 'all';
export interface Store {
    appendHistory(entry: HistoryEntry): Promise<void>;
    listHistory(target: string | undefined, limit: number, scope?: HistoryScope): Promise<HistoryEntry[]>;
    loadQuarantine(): Promise<QuarantineDocument>;
    addQuarantine(refs: ParsedRef[], reason: string, options?: QuarantineAddOptions): Promise<{
        added: QuarantineEntry[];
        updated: QuarantineEntry[];
        file: string;
    }>;
    removeQuarantine(refs: ParsedRef[]): Promise<{
        removed: QuarantineEntry[];
        file: string;
    }>;
    quarantinePath: string;
    historyPath?: string;
    workspace?: string;
}
export interface ParsedRef {
    file: string;
    name: string | null;
}
export interface AnnotatableTest {
    file: string;
    name: string;
    verdict: string;
    failureRate?: number;
}
export interface QuarantineAnnotation<T extends AnnotatableTest = AnnotatableTest> {
    newFlaky: T[];
    alreadyQuarantinedFlaky: T[];
    clearCandidates: QuarantineEntry[];
}
export interface TopFlakyTest {
    file: string;
    name: string;
    occurrences: number;
    avgFailureRate: number;
    maxFailureRate: number;
    lastSeen: string;
    quarantined: boolean;
}
export interface StaleQuarantineEntry extends QuarantineEntry {
    ageDays: number;
}
export interface StabilitySummary {
    topFlakyTests: TopFlakyTest[];
    staleQuarantined: StaleQuarantineEntry[];
}
export interface SummarizeStabilityOptions {
    staleDays?: number;
    topN?: number;
    now?: Date;
}
/** 计算工作区稳定哈希，用于按工作区分文件存储历史。 */
export declare function workspaceHash(workspace: string): string;
/**
 * 规范化隔离清单中的文件路径为 POSIX 相对路径；
 * 拒绝工作区外的绝对路径与越界相对路径，避免把本机路径污染进 .flakefinder.json。
 */
export declare function normalizeQuarantinePath(rawFile: string, workspace?: string): string;
export declare function createStore(dataDir: string, quarantineFile: string, options?: StoreOptions): Store;
/**
 * 将本次检测结果中的用例与隔离清单交叉对照：
 * - newFlaky: 本次新发现（尚未隔离）的 flaky 用例
 * - alreadyQuarantinedFlaky: 已在隔离清单中且本次仍为 flaky 的用例
 * - clearCandidates: 隔离清单中在本次运行全部稳定通过（stable-pass）的候选清理条目
 */
export declare function annotateTestsWithQuarantine<T extends AnnotatableTest>(tests: readonly T[], quarantineDoc: QuarantineDocument): QuarantineAnnotation<T>;
/**
 * 汇总历史与隔离清单的稳定性概览：高频 flaky 榜单 + 超期未复查的陈旧隔离条目。
 */
export declare function summarizeStability(history: readonly HistoryEntry[], quarantineDoc: QuarantineDocument, options?: SummarizeStabilityOptions): StabilitySummary;
/** 解析 "file.test.mjs" 或 "file.test.mjs > 用例名" 形式的引用。 */
export declare function parseRef(raw: string): ParsedRef;
/** 隔离清单条目的可读格式。 */
export declare function formatRef(entry: {
    file: string;
    name: string | null;
}): string;
