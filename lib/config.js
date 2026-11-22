/**
 * dsh-flakefinder 配置解析：重复次数、并发、超时、审批策略与存储路径。
 *
 * @module dsh-flakefinder/config
 */
import { homedir } from 'node:os';
import path from 'node:path';
const MIN_RUNS = 3;
const MAX_RUNS = 50;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 4;
const MIN_STALE_DAYS = 1;
const MAX_STALE_DAYS = 365;
const MAX_SEED = 2147483647;
/** DSH_HOME 缺省时退回用户目录下的 .dsh。 */
function defaultDataDir() {
    const home = process.env.DSH_HOME?.trim();
    return path.join(home !== undefined && home !== '' ? home : path.join(homedir(), '.dsh'), '.dsh-flakefinder');
}
/** 解析并校验配置，非法值抛出中文错误。 */
export function resolveConfig(config, cwd = process.cwd()) {
    const cfg = config ?? {};
    let defaultRuns = 5;
    if (cfg.defaultRuns !== undefined) {
        defaultRuns = readRuns('defaultRuns', cfg.defaultRuns, 3, 20);
    }
    let maxRuns = 20;
    if (cfg.maxRuns !== undefined) {
        maxRuns = readRuns('maxRuns', cfg.maxRuns, MIN_RUNS, MAX_RUNS);
    }
    if (defaultRuns > maxRuns)
        defaultRuns = maxRuns;
    let defaultConcurrency = 1;
    if (cfg.defaultConcurrency !== undefined) {
        defaultConcurrency = readRuns('defaultConcurrency', cfg.defaultConcurrency, MIN_CONCURRENCY, MAX_CONCURRENCY);
    }
    const noCoverage = cfg.noCoverage !== false;
    let staleQuarantineDays = 14;
    if (cfg.staleQuarantineDays !== undefined) {
        staleQuarantineDays = readRuns('staleQuarantineDays', cfg.staleQuarantineDays, MIN_STALE_DAYS, MAX_STALE_DAYS);
    }
    let timeoutMs = 120000;
    if (cfg.timeoutMs !== undefined) {
        if (typeof cfg.timeoutMs !== 'number' || !Number.isFinite(cfg.timeoutMs) || cfg.timeoutMs <= 0) {
            throw new Error('timeoutMs 必须是大于 0 的数字（毫秒）。');
        }
        timeoutMs = Math.min(10 * 60 * 1000, Math.max(10000, Math.round(cfg.timeoutMs)));
    }
    let graceMs = 10000;
    if (cfg.graceMs !== undefined) {
        if (typeof cfg.graceMs !== 'number' || !Number.isFinite(cfg.graceMs) || cfg.graceMs <= 0) {
            throw new Error('graceMs 必须是大于 0 的数字（毫秒）。');
        }
        graceMs = Math.min(120000, Math.max(1000, Math.round(cfg.graceMs)));
    }
    const writeApproval = cfg.writeApproval !== false;
    const dataDir = typeof cfg.dataDir === 'string' && cfg.dataDir.trim() !== ''
        ? path.resolve(cwd, cfg.dataDir.trim())
        : defaultDataDir();
    const quarantineFile = typeof cfg.quarantineFile === 'string' && cfg.quarantineFile.trim() !== ''
        ? path.resolve(cwd, cfg.quarantineFile.trim())
        : path.join(cwd, '.flakefinder.json');
    const explicitConfigPython = typeof cfg.pythonPath === 'string' && cfg.pythonPath.trim() !== ''
        ? cfg.pythonPath.trim()
        : undefined;
    const explicitEnvPython = process.env.DSH_FLAKEFINDER_PYTHON?.trim() || undefined;
    const pythonPathExplicit = explicitConfigPython !== undefined || explicitEnvPython !== undefined;
    const pythonPath = explicitConfigPython ?? explicitEnvPython ?? (process.platform === 'win32' ? 'python' : 'python3');
    const relativeQuarantine = typeof cfg.quarantineFile === 'string' && cfg.quarantineFile.trim() ? cfg.quarantineFile.trim() : '.flakefinder.json';
    return {
        defaultRuns,
        maxRuns,
        defaultConcurrency,
        noCoverage,
        staleQuarantineDays,
        timeoutMs,
        graceMs,
        writeApproval,
        dataDir,
        quarantineFile,
        pythonPath,
        pythonPathExplicit,
        ...(path.isAbsolute(relativeQuarantine) ? {} : { quarantineFileRelative: relativeQuarantine }),
    };
}
function readRuns(label, value, lo, hi) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error(label + ' 必须是数字。');
    const rounded = Math.round(value);
    if (rounded < lo || rounded > hi)
        throw new Error(label + ' 必须在 ' + String(lo) + '-' + String(hi) + ' 之间。');
    return rounded;
}
/** 解析并钳制 flaky_detect 的 runs 参数。 */
export function resolveRuns(raw, cfg) {
    if (raw === undefined || raw === null)
        return cfg.defaultRuns;
    if (typeof raw !== 'number' || !Number.isFinite(raw))
        throw new Error('runs 必须是数字（3-' + String(cfg.maxRuns) + '）。');
    const runs = Math.round(raw);
    if (runs < 3 || runs > cfg.maxRuns)
        throw new Error('runs 必须在 3-' + String(cfg.maxRuns) + ' 之间。');
    return runs;
}
/** 解析并校验 flaky_detect 的并发数（1-4）。 */
export function resolveConcurrency(raw, cfg) {
    if (raw === undefined || raw === null)
        return cfg?.defaultConcurrency ?? 1;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        throw new Error('concurrency 必须是数字（' + String(MIN_CONCURRENCY) + '-' + String(MAX_CONCURRENCY) + '）。');
    }
    const value = Math.round(raw);
    if (value < MIN_CONCURRENCY || value > MAX_CONCURRENCY) {
        throw new Error('concurrency 必须在 ' + String(MIN_CONCURRENCY) + '-' + String(MAX_CONCURRENCY) + ' 之间。');
    }
    return value;
}
/** 解析 flaky_detect 的执行模式；默认 full。 */
export function readDetectMode(raw) {
    if (raw === undefined || raw === null)
        return 'full';
    if (raw === 'full' || raw === 'until-flaky' || raw === 'verify-fix')
        return raw;
    throw new Error('mode 只支持 full / until-flaky / verify-fix，收到：' + String(raw));
}
/** 校验测试目标：非空且不能以 - 开头，避免被测试框架解析成选项。 */
export function assertTarget(value) {
    const trimmed = value.trim();
    if (trimmed === '')
        throw new Error('target（测试文件/目录/glob）为必填，请提供非空字符串。');
    if (trimmed.startsWith('-'))
        throw new Error('target 不能以 - 开头：' + value);
    return trimmed;
}
/** 从参数里取字符串；不识别类型时返回 undefined。 */
export function optionalString(args, key) {
    const value = args[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
/** 从参数里取必填字符串；缺失时抛中文错误。 */
export function requiredString(args, key, label) {
    const value = optionalString(args, key);
    if (value === undefined)
        throw new Error(label + '（参数 ' + key + '）为必填，请提供非空字符串。');
    return value;
}
/** 从参数里取整数；缺失用默认值，非法抛中文错误。 */
export function optionalInteger(args, key, label, lo, hi, fallback) {
    const value = args[key];
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error(label + '（参数 ' + key + '）必须是数字。');
    const rounded = Math.round(value);
    if (rounded < lo || rounded > hi)
        throw new Error(label + '（参数 ' + key + '）必须在 ' + String(lo) + '-' + String(hi) + ' 之间。');
    return rounded;
}
/** 从参数里取布尔值；缺失用默认值，非法类型抛中文错误。 */
export function optionalBoolean(args, key, fallback = false) {
    const value = args[key];
    if (value === undefined || value === null)
        return fallback;
    if (typeof value === 'boolean')
        return value;
    throw new Error('参数 ' + key + ' 必须是布尔值。');
}
/** 从参数里取随机种子（0-2147483647 整数）；缺失返回 undefined，非法抛中文错误。 */
export function optionalSeed(args, key) {
    const value = args[key];
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error('随机种子（参数 ' + key + '）必须是整数。');
    }
    if (value < 0 || value > MAX_SEED) {
        throw new Error('随机种子（参数 ' + key + '）必须在 0-' + String(MAX_SEED) + ' 之间。');
    }
    return value;
}
const WIN_ABS_RE = /^[A-Za-z]:[\\/]/;
/**
 * 将测试文件路径规范化为 POSIX 相对路径（使用 `/`、去掉前导 `./`）；
 * 若提供 `cwd` 且路径位于 `cwd` 之内，转为相对 `cwd` 的路径。
 */
export function normalizeRelPath(filePath, cwd) {
    const trimmed = filePath.trim();
    if (trimmed === '')
        return '';
    const normFile = trimmed.replace(/\\/g, '/');
    if (typeof cwd === 'string' && cwd.trim() !== '') {
        const trimmedCwd = cwd.trim();
        const normCwd = trimmedCwd.replace(/\\/g, '/');
        if (WIN_ABS_RE.test(normFile) && WIN_ABS_RE.test(normCwd)) {
            const resolvedCwd = path.win32.resolve(trimmedCwd).replace(/\\/g, '/').replace(/\/+$/, '');
            const resolvedFile = path.win32.resolve(trimmed).replace(/\\/g, '/');
            if (resolvedFile.toLowerCase().startsWith(resolvedCwd.toLowerCase() + '/')) {
                return resolvedFile.slice(resolvedCwd.length + 1).replace(/^(?:\.\/)+/, '');
            }
            if (resolvedFile.toLowerCase() === resolvedCwd.toLowerCase()) {
                return '.';
            }
            return resolvedFile;
        }
        if (normFile.startsWith('/') && normCwd.startsWith('/')) {
            const resolvedCwd = path.posix.resolve(normCwd).replace(/\/+$/, '');
            const resolvedFile = path.posix.resolve(normFile);
            if (resolvedCwd === '') {
                return resolvedFile.slice(1).replace(/^(?:\.\/)+/, '');
            }
            if (resolvedFile.startsWith(resolvedCwd + '/')) {
                return resolvedFile.slice(resolvedCwd.length + 1).replace(/^(?:\.\/)+/, '');
            }
            if (resolvedFile === resolvedCwd) {
                return '.';
            }
            return resolvedFile;
        }
        if (path.isAbsolute(trimmed)) {
            const rel = path.relative(path.resolve(trimmedCwd), path.resolve(trimmed)).replace(/\\/g, '/');
            if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) {
                return rel.replace(/^(?:\.\/)+/, '');
            }
        }
    }
    return normFile.replace(/^(?:\.\/)+/, '');
}
