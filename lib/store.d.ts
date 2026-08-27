/**
 * 历史与隔离清单存储：JSON 文件、原子写入、零运行时依赖。
 *
 * @module dsh-flakefinder/store
 */
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
    flakyTests: Array<{
        file: string;
        name: string;
        failureRate: number;
    }>;
}
export interface QuarantineEntry {
    file: string;
    name: string | null;
    reason: string;
    since: string;
}
export interface QuarantineDocument {
    version: 1;
    quarantined: QuarantineEntry[];
}
export interface Store {
    appendHistory(entry: HistoryEntry): Promise<void>;
    listHistory(target: string | undefined, limit: number): Promise<HistoryEntry[]>;
    loadQuarantine(): Promise<QuarantineDocument>;
    addQuarantine(refs: ParsedRef[], reason: string): Promise<{
        added: QuarantineEntry[];
        file: string;
    }>;
    removeQuarantine(refs: ParsedRef[]): Promise<{
        removed: QuarantineEntry[];
        file: string;
    }>;
    quarantinePath: string;
}
export interface ParsedRef {
    file: string;
    name: string | null;
}
export declare function createStore(dataDir: string, quarantineFile: string): Store;
/** 解析 "file.test.mjs" 或 "file.test.mjs > 用例名" 形式的引用。 */
export declare function parseRef(raw: string): ParsedRef;
/** 隔离清单条目的可读格式。 */
export declare function formatRef(entry: {
    file: string;
    name: string | null;
}): string;
