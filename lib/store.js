/**
 * 历史与隔离清单存储：JSON 文件、原子写入、零运行时依赖。
 *
 * @module dsh-flakefinder/store
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
const HISTORY_FILE = 'history.json';
const HISTORY_LIMIT = 200;
export function createStore(dataDir, quarantineFile) {
    const historyPath = path.join(dataDir, HISTORY_FILE);
    async function readJson(file) {
        try {
            const info = await fs.lstat(file);
            if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024)
                throw new Error('文件不是普通 JSON 文件或超过 8 MiB');
            return JSON.parse(await fs.readFile(file, 'utf8'));
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return undefined;
            throw new Error('记录无法读取，原文件已保留：' + file + '。' + (error instanceof Error ? error.message : String(error)));
        }
    }
    async function locked(file, update) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        const unlock = await lockfile.lock(file, { realpath: false, retries: { retries: 30, minTimeout: 25, maxTimeout: 100 } });
        try {
            return await update();
        }
        finally {
            await unlock();
        }
    }
    async function atomicWrite(file, value) {
        const bytes = JSON.stringify(value, null, 2) + '\n';
        if (Buffer.byteLength(bytes) > 8 * 1024 * 1024)
            throw new Error('记录超过 8 MiB，本次没有保存。');
        const temp = file + '.tmp-' + randomUUID();
        try {
            await fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
            await fs.rename(temp, file);
        }
        finally {
            await fs.unlink(temp).catch(() => { });
        }
    }
    async function ensureDir() {
        await fs.mkdir(dataDir, { recursive: true });
    }
    async function readHistory() {
        const parsed = await readJson(historyPath);
        if (parsed === undefined)
            return [];
        if (!Array.isArray(parsed) || parsed.some(entry => !entry || typeof entry.target !== 'string' || typeof entry.timestamp !== 'string' || !Array.isArray(entry.flakyTests)))
            throw new Error('历史记录格式无效，原文件已保留：' + historyPath);
        return parsed;
    }
    async function appendHistory(entry) {
        await ensureDir();
        return locked(historyPath, async () => {
            const list = await readHistory();
            list.unshift(entry);
            const trimmed = list.slice(0, HISTORY_LIMIT);
            await atomicWrite(historyPath, trimmed);
        });
    }
    async function listHistory(target, limit) {
        const list = await readHistory();
        const filtered = target === undefined ? list : list.filter(entry => entry.target === target || entry.target.includes(target));
        return filtered.slice(0, limit);
    }
    async function readQuarantine() {
        const parsed = await readJson(quarantineFile);
        if (parsed === undefined)
            return { version: 1, quarantined: [] };
        const obj = parsed;
        if (!obj || obj.version !== 1 || !Array.isArray(obj.quarantined) || obj.quarantined.some(entry => !entry || typeof entry.file !== 'string' || !entry.file || entry.name !== null && typeof entry.name !== 'string' || typeof entry.reason !== 'string' || typeof entry.since !== 'string'))
            throw new Error('隔离清单格式无效，原文件已保留：' + quarantineFile);
        return obj;
    }
    async function writeQuarantine(doc) {
        await fs.mkdir(path.dirname(quarantineFile), { recursive: true });
        await atomicWrite(quarantineFile, doc);
    }
    async function addQuarantine(refs, reason) {
        return locked(quarantineFile, async () => {
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
        });
    }
    async function removeQuarantine(refs) {
        return locked(quarantineFile, async () => {
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
        });
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
