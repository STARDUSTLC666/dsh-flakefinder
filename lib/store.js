/**
 * 历史与隔离清单存储：JSON 文件、原子写入、零运行时依赖。
 *
 * @module dsh-flakefinder/store
 */
import fs from 'node:fs/promises';
import path from 'node:path';
const HISTORY_FILE = 'history.json';
const HISTORY_LIMIT = 200;
export function createStore(dataDir, quarantineFile) {
    const historyPath = path.join(dataDir, HISTORY_FILE);
    async function ensureDir() {
        await fs.mkdir(dataDir, { recursive: true });
    }
    async function readHistory() {
        try {
            const text = await fs.readFile(historyPath, 'utf8');
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
    }
    async function appendHistory(entry) {
        await ensureDir();
        const list = await readHistory();
        list.unshift(entry);
        const trimmed = list.slice(0, HISTORY_LIMIT);
        const tmp = historyPath + '.tmp-' + process.pid;
        await fs.writeFile(tmp, JSON.stringify(trimmed, null, 2), 'utf8');
        await fs.rename(tmp, historyPath);
    }
    async function listHistory(target, limit) {
        const list = await readHistory();
        const filtered = target === undefined ? list : list.filter(entry => entry.target === target || entry.target.includes(target));
        return filtered.slice(0, limit);
    }
    async function readQuarantine() {
        try {
            const text = await fs.readFile(quarantineFile, 'utf8');
            const parsed = JSON.parse(text);
            const obj = (parsed ?? {});
            return {
                version: 1,
                quarantined: Array.isArray(obj.quarantined) ? obj.quarantined : [],
            };
        }
        catch {
            return { version: 1, quarantined: [] };
        }
    }
    async function writeQuarantine(doc) {
        await fs.mkdir(path.dirname(quarantineFile), { recursive: true });
        const tmp = quarantineFile + '.tmp-' + process.pid;
        await fs.writeFile(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
        await fs.rename(tmp, quarantineFile);
    }
    async function addQuarantine(refs, reason) {
        const doc = await readQuarantine();
        const now = new Date().toISOString();
        const added = [];
        for (const ref of refs) {
            const existing = doc.quarantined.find(item => sameRef(item, ref));
            if (existing !== undefined) {
                existing.reason = reason;
                existing.since = now;
                continue;
            }
            const entry = { file: ref.file, name: ref.name, reason, since: now };
            doc.quarantined.push(entry);
            added.push(entry);
        }
        doc.quarantined.sort((a, b) => a.file.localeCompare(b.file) || (a.name ?? '').localeCompare(b.name ?? ''));
        await writeQuarantine(doc);
        return { added, file: quarantineFile };
    }
    async function removeQuarantine(refs) {
        const doc = await readQuarantine();
        const removed = [];
        doc.quarantined = doc.quarantined.filter(item => {
            const hit = refs.some(ref => sameRef(item, ref));
            if (hit)
                removed.push(item);
            return !hit;
        });
        await writeQuarantine(doc);
        return { removed, file: quarantineFile };
    }
    return {
        appendHistory,
        listHistory,
        loadQuarantine: readQuarantine,
        addQuarantine,
        removeQuarantine,
        quarantinePath: quarantineFile,
    };
}
function sameRef(item, ref) {
    if (item.file !== ref.file)
        return false;
    if (ref.name === null)
        return true;
    return item.name === ref.name;
}
/** 解析 "file.test.mjs" 或 "file.test.mjs > 用例名" 形式的引用。 */
export function parseRef(raw) {
    const trimmed = raw.trim();
    if (trimmed === '')
        throw new Error('测试引用不能为空。格式：文件路径，或 "文件路径 > 用例名"。');
    const index = trimmed.indexOf(' > ');
    if (index === -1)
        return { file: trimmed, name: null };
    const file = trimmed.slice(0, index).trim();
    const name = trimmed.slice(index + 3).trim();
    if (file === '')
        throw new Error('测试引用缺少文件路径：' + raw);
    return { file, name: name === '' ? null : name };
}
/** 隔离清单条目的可读格式。 */
export function formatRef(entry) {
    return entry.name === null ? entry.file : entry.file + ' > ' + entry.name;
}
