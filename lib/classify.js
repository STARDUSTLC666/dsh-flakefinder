/**
 * 多轮结果聚合、flaky 判定与根因诊断：纯函数，零运行时依赖，便于单测边界。
 *
 * @module dsh-flakefinder/classify
 */
import { createHash } from 'node:crypto';
const ANSI_ESCAPE = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const VERDICT_RANK = {
    'flaky': 0,
    'stable-fail': 1,
    'skipped': 2,
    'stable-pass': 3,
};
const INTERNAL_FRAME = /(?:node:internal\/|node:async_hooks|node:timers|node:net|node:events|internal\/modules\/|node_modules[\\/](?:vitest|@vitest|jest|@jest|jest-circus|jest-runner|tinypool|pirates|expect)[\\/]|site-packages[\\/](?:_pytest|pluggy|pytest)[\\/])/i;
function round1(value) {
    return Math.round(value * 10) / 10;
}
function stripAnsi(text) {
    return text.replace(ANSI_ESCAPE, '');
}
/** 脱敏常见密钥/令牌，避免写入诊断报告或堆栈采样。 */
export function redactSecrets(text) {
    let out = text;
    out = out.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 <REDACTED>');
    out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '<REDACTED_JWT>');
    out = out.replace(/\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{12,}/g, '<REDACTED_KEY>');
    out = out.replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, '<REDACTED_KEY>');
    out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, '<REDACTED_KEY>');
    out = out.replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, '<REDACTED_KEY>');
    out = out.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s/]+)(@)/gi, '$1<REDACTED>$3');
    out = out.replace(/\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret)(["']?\s*[:=]\s*)(["']?)([^\s"',;)}\]]+)\3/gi, '$1$2$3<REDACTED>$3');
    out = out.replace(/\b(token)(["']?\s*[:=]\s*)(["']?)([A-Za-z0-9._~+/=-]{16,})\3/gi, '$1$2$3<REDACTED>$3');
    return out;
}
/** 归一化错误文本中的动态噪声（时间戳、UUID、地址、端口、临时路径、数字差异），用于聚类指纹。 */
export function normalizeErrorForFingerprint(text) {
    let out = stripAnsi(redactSecrets(text));
    // ISO 时间戳与日期时间
    out = out.replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, '<ISO_TIME>');
    out = out.replace(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g, '<DATE>');
    out = out.replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g, '<TIME>');
    // UUID
    out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>');
    // 临时目录路径（Windows & POSIX）
    out = out.replace(/[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/:\s"'`]+[\\/]AppData[\\/]Local[\\/]Temp[\\/][^\s"'`)\]]+/gi, '<TMP_PATH>');
    out = out.replace(/[A-Za-z]:[\\/]Windows[\\/]Temp[\\/][^\s"'`)\]]+/gi, '<TMP_PATH>');
    out = out.replace(/(?:\/private)?\/(?:tmp|var\/tmp|var\/folders)\/[^\s"'`)\]]+/g, '<TMP_PATH>');
    // 随机端口
    out = out.replace(/\b(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})\b/gi, '$1:<PORT>');
    out = out.replace(/\bport\s+\d{2,5}\b/gi, 'port <PORT>');
    out = out.replace(/(?<!\.[a-z]{1,4}):\d{4,5}\b/gi, ':<PORT>');
    // 十六进制地址与长哈希
    out = out.replace(/\b0x[0-9a-f]+\b/gi, '<HEX>');
    out = out.replace(/\b[0-9a-f]{16,}\b/gi, '<HEX>');
    // 耗时与数字差异
    out = out.replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|us|ns|µs)\b/gi, '<DURATION>');
    out = out.replace(/\b\d+(?:\.\d+)?\b/g, '<NUM>');
    return out.replace(/\s+/g, ' ').trim().toLowerCase();
}
/** 计算结构化错误指纹，用于把同一根因的多次失败归为一簇。 */
export function errorFingerprint(error) {
    const rawMessage = error.message.trim() || firstNonEmptyLine(error.stack ?? '') || '(unknown error)';
    const firstLine = firstNonEmptyLine(rawMessage);
    const typeKey = (error.type ?? '').trim().toLowerCase();
    const normalized = normalizeErrorForFingerprint(firstLine).slice(0, 300);
    return createHash('sha256').update(typeKey + '|' + normalized).digest('hex').slice(0, 12);
}
function firstNonEmptyLine(text) {
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed !== '')
            return trimmed;
    }
    return '';
}
function cleanMessage(raw, maxChars = 400) {
    const cleaned = stripAnsi(redactSecrets(raw)).replace(/\r\n/g, '\n').trim();
    if (cleaned.length <= maxChars)
        return cleaned;
    return cleaned.slice(0, Math.max(1, maxChars - 1)) + '…';
}
function isStackFrameLine(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith('at ') || /^\s*File\s+"/.test(line) || /^[\w$.<>-]+@/.test(trimmed))
        return true;
    // Node 24 node:test TAP YAML 堆栈帧省略前导 "at "，例如：
    // TestContext.<anonymous> (file:///.../a.test.mjs:5:40)
    // Test.runInAsyncScope (node:async_hooks:227:14)
    return /\([^()]+:\d+(?::\d+)?\)$/.test(trimmed) || /^(?:file:\/\/|node:|[A-Za-z]:[\\/]|\/)[^\s]+:\d+(?::\d+)?$/.test(trimmed);
}
/** 压缩代表堆栈：脱敏、保留头部与关键业务帧，限制行数（默认 12 行）与字符数（默认 1200）。 */
export function compactStack(stack, maxLines = 12, maxChars = 1200) {
    const sanitized = stripAnsi(redactSecrets(stack)).replace(/\r\n/g, '\n');
    const rawLines = sanitized.split('\n');
    let start = 0;
    while (start < rawLines.length && rawLines[start].trim() === '')
        start += 1;
    let end = rawLines.length;
    while (end > start && rawLines[end - 1].trim() === '')
        end -= 1;
    const lines = rawLines.slice(start, end);
    if (lines.length === 0)
        return '';
    let selected;
    if (lines.length <= maxLines) {
        selected = lines;
    }
    else {
        const firstFrameIdx = lines.findIndex(isStackFrameLine);
        const headEnd = firstFrameIdx === -1 ? Math.min(3, lines.length) : Math.min(Math.max(1, firstFrameIdx), 3);
        const chosen = new Set();
        for (let i = 0; i < headEnd; i += 1)
            chosen.add(i);
        const budget = Math.max(1, maxLines - 1);
        const topFrameIdx = firstFrameIdx >= headEnd ? firstFrameIdx : -1;
        if (topFrameIdx !== -1 && chosen.size < budget)
            chosen.add(topFrameIdx);
        const userFrameIndices = [];
        const otherIndices = [];
        for (let i = headEnd; i < lines.length; i += 1) {
            if (chosen.has(i))
                continue;
            const line = lines[i];
            if (isStackFrameLine(line) && !INTERNAL_FRAME.test(line)) {
                userFrameIndices.push(i);
            }
            else {
                otherIndices.push(i);
            }
        }
        for (const idx of userFrameIndices) {
            if (chosen.size >= budget)
                break;
            chosen.add(idx);
        }
        for (const idx of otherIndices) {
            if (chosen.size >= budget)
                break;
            chosen.add(idx);
        }
        const sortedIdx = [...chosen].sort((a, b) => a - b);
        const omitted = lines.length - sortedIdx.length;
        selected = sortedIdx.map(i => lines[i]);
        if (omitted > 0) {
            selected.push('    ... (' + String(omitted) + ' lines omitted)');
        }
    }
    const out = [];
    let used = 0;
    for (let i = 0; i < selected.length && out.length < maxLines; i += 1) {
        const line = selected[i];
        const sep = out.length === 0 ? 0 : 1;
        if (used + sep + line.length <= maxChars) {
            out.push(line);
            used += sep + line.length;
        }
        else {
            const remain = maxChars - used - sep;
            if (remain > 1) {
                out.push(line.slice(0, remain - 1) + '…');
            }
            else if (out.length === 0) {
                out.push(line.slice(0, Math.max(1, maxChars - 1)) + '…');
            }
            break;
        }
    }
    return out.join('\n');
}
function percentile95(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
    return round1(sorted[idx]);
}
function averageOrNull(values) {
    if (values.length === 0)
        return null;
    const sum = values.reduce((acc, v) => acc + v, 0);
    return round1(sum / values.length);
}
function addErrorToClusters(clusters, error, runIndex) {
    const fp = errorFingerprint(error);
    const message = cleanMessage(error.message || firstNonEmptyLine(error.stack ?? '') || '(unknown error)');
    const stack = error.stack !== undefined && error.stack.trim() !== '' ? compactStack(error.stack) : undefined;
    const existing = clusters.get(fp);
    if (existing !== undefined) {
        existing.count += 1;
        if (!existing.runIndices.includes(runIndex))
            existing.runIndices.push(runIndex);
        if (existing.type === undefined && error.type !== undefined && error.type.trim() !== '') {
            existing.type = error.type.trim();
        }
        if (existing.sampleStack === undefined && stack !== undefined && stack !== '') {
            existing.sampleStack = stack;
        }
        return;
    }
    const created = {
        fingerprint: fp,
        count: 1,
        message,
        runIndices: [runIndex],
    };
    if (error.type !== undefined && error.type.trim() !== '')
        created.type = error.type.trim();
    if (stack !== undefined && stack !== '')
        created.sampleStack = stack;
    clusters.set(fp, created);
}
function finalizeClusters(clusters) {
    return [...clusters.values()]
        .map(c => ({
        fingerprint: c.fingerprint,
        count: c.count,
        ...(c.type !== undefined ? { type: c.type } : {}),
        message: c.message,
        ...(c.sampleStack !== undefined ? { sampleStack: c.sampleStack } : {}),
        runIndices: [...c.runIndices].sort((a, b) => a - b),
    }))
        .sort((a, b) => b.count - a.count || (a.runIndices[0] ?? 0) - (b.runIndices[0] ?? 0));
}
function isFailSymbol(symbol) {
    return symbol === 'F' || symbol === 'T';
}
function detectPatterns(input) {
    if (input.verdict !== 'flaky') {
        return input.teardownCrash ? ['teardown-crash'] : [];
    }
    const patterns = [];
    // 1. cold-start: 仅第 1 轮失败，后续全部通过，且总轮次 >= 3
    if (input.timeline.length >= 3
        && isFailSymbol(input.timeline[0])
        && input.timeline.slice(1).every(symbol => symbol === 'P')) {
        patterns.push('cold-start');
    }
    // 2. state-leak: 先通过 (>= 1 轮)，一旦失败后剩余轮次持续失败 (>= 2 轮连续尾部失败)
    const effective = input.timeline.filter(symbol => symbol === 'P' || symbol === 'F' || symbol === 'T');
    const firstFail = effective.findIndex(isFailSymbol);
    if (firstFail >= 1
        && effective.length - firstFail >= 2
        && effective.slice(firstFail).every(isFailSymbol)) {
        patterns.push('state-leak');
    }
    // 3. timeout-race: 超时标志 / 失败耗时显著拉长 (>=1.8x 且差值 >=100ms) / 错误信息含超时关键词
    const durationRatioRace = input.passDurationAvgMs !== null
        && input.failDurationAvgMs !== null
        && input.failDurationAvgMs - input.passDurationAvgMs >= 100
        && input.failDurationAvgMs >= input.passDurationAvgMs * 1.8;
    const timeoutErrorMatch = input.errorClusters.some(cluster => /timeout|timed out|exceeded/i.test(cluster.message)
        || (cluster.type !== undefined && /timeout/i.test(cluster.type)));
    if (input.failedRunTimedOut || input.timeline.includes('T') || durationRatioRace || timeoutErrorMatch) {
        patterns.push('timeout-race');
    }
    // 4. order-dependent: 存在互不相交的通过种子与失败种子
    if (input.failedSeeds.size > 0
        && input.passedSeeds.size > 0
        && [...input.failedSeeds].every(seed => !input.passedSeeds.has(seed))) {
        patterns.push('order-dependent');
    }
    // 5. teardown-crash: 断言通过但进程异常退出
    if (input.teardownCrash) {
        patterns.push('teardown-crash');
    }
    // 6. intermittent: 无更窄特征时的默认兜底
    if (patterns.length === 0) {
        patterns.push('intermittent');
    }
    return patterns;
}
/** 根因模式的简明中文说明。 */
export function patternLabel(pattern) {
    switch (pattern) {
        case 'cold-start': return '冷启动偶发（仅首轮失败，后续均通过，可能存在预热/缓存初始化竞争）';
        case 'state-leak': return '状态泄漏（先通过后持续失败，可能存在未清理的全局状态、文件或端口）';
        case 'timeout-race': return '超时/竞态（出现超时或失败耗时显著拉长）';
        case 'order-dependent': return '顺序依赖（不同随机种子下稳定区分通过与失败）';
        case 'teardown-crash': return '清理阶段崩溃（用例断言已通过，但测试进程在退出阶段异常中止）';
        case 'intermittent': return '间歇性偶发（无单一固定规律，建议结合错误聚合与并发环境排查）';
    }
}
/**
 * 连续全通过 runs 轮后，在指定置信度下的最大潜在偶发失败率上界（百分比，保留 1 位小数）。
 * 公式：1 - (1 - confidence)^(1 / runs)
 */
export function confidenceUpperBound(runs, confidence = 0.95) {
    if (!Number.isFinite(runs) || runs <= 0)
        return 100;
    if (!Number.isFinite(confidence) || confidence <= 0)
        return 0;
    if (confidence >= 1)
        return 100;
    return Math.round((1 - Math.pow(1 - confidence, 1 / runs)) * 1000) / 10;
}
/**
 * 在指定置信度下，要将潜在偶发失败率压到 maxFlakeRate 以下所需的最少全通过轮数。
 * maxFlakeRate 同时支持百分比（如 5 表示 5%、10 表示 10%）与比例（如 0.05、0.1）。
 */
export function runsNeededForThreshold(maxFlakeRate, confidence = 0.95) {
    if (!Number.isFinite(maxFlakeRate) || maxFlakeRate <= 0) {
        throw new Error('maxFlakeRate 必须大于 0。');
    }
    if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
        throw new Error('confidence 必须在 (0, 1) 之间。');
    }
    if (maxFlakeRate >= 100)
        return 1;
    const p = maxFlakeRate < 1 ? maxFlakeRate : maxFlakeRate / 100;
    if (p >= 1)
        return 1;
    return Math.max(1, Math.ceil(Math.log(1 - confidence) / Math.log(1 - p)));
}
function truncateSingleLine(text, maxChars) {
    const line = firstNonEmptyLine(text);
    if (line.length <= maxChars)
        return line;
    return line.slice(0, Math.max(1, maxChars - 1)) + '…';
}
export function aggregate(runs) {
    const orderedRuns = [...runs].sort((a, b) => a.index - b.index);
    const records = orderedRuns.map(run => {
        const success = run.report?.success === true
            && run.timedOut !== true
            && run.truncated !== true
            && run.error === undefined;
        const rec = {
            runIndex: run.index,
            success,
            passed: run.report?.passed ?? 0,
            failed: run.report?.failed ?? 0,
            skipped: run.report?.skipped ?? 0,
            durationMs: run.durationMs,
        };
        if (run.timedOut !== undefined)
            rec.timedOut = run.timedOut;
        if (run.truncated !== undefined)
            rec.truncated = run.truncated;
        if (run.seed !== undefined)
            rec.seed = run.seed;
        if (run.error !== undefined)
            rec.error = redactSecrets(run.error);
        return rec;
    });
    const active = orderedRuns.filter(run => run.report !== null);
    if (active.length === 0) {
        const detail = orderedRuns.find(run => run.error !== undefined);
        throw new Error('没有一次运行产出可解析的测试报告。' + (detail?.error !== undefined ? ' 首个错误：' + redactSecrets(detail.error) : ''));
    }
    const byId = new Map();
    for (let pos = 0; pos < orderedRuns.length; pos += 1) {
        const run = orderedRuns[pos];
        if (run.report === null)
            continue;
        const runTests = run.report.tests ?? [];
        for (const test of runTests) {
            let entry = byId.get(test.id);
            if (entry === undefined) {
                entry = {
                    file: test.file,
                    name: test.name,
                    passes: 0,
                    failures: 0,
                    skips: 0,
                    passDurations: [],
                    failDurations: [],
                    allDurations: [],
                    statusByRunPos: new Map(),
                    errorClusters: new Map(),
                    failedRunTimedOut: false,
                    passedSeeds: new Set(),
                    failedSeeds: new Set(),
                };
                byId.set(test.id, entry);
            }
            const dur = Math.max(0, Number.isFinite(test.durationMs) ? test.durationMs : 0);
            entry.allDurations.push(dur);
            const prevSym = entry.statusByRunPos.get(pos);
            if (test.status === 'passed') {
                entry.passes += 1;
                entry.passDurations.push(dur);
                if (prevSym !== 'F')
                    entry.statusByRunPos.set(pos, 'P');
                if (run.seed !== undefined)
                    entry.passedSeeds.add(run.seed);
            }
            else if (test.status === 'failed') {
                entry.failures += 1;
                entry.failDurations.push(dur);
                entry.statusByRunPos.set(pos, 'F');
                if (run.timedOut === true)
                    entry.failedRunTimedOut = true;
                if (run.seed !== undefined)
                    entry.failedSeeds.add(run.seed);
                if (test.error !== undefined) {
                    addErrorToClusters(entry.errorClusters, test.error, run.index);
                }
            }
            else {
                entry.skips += 1;
                if (prevSym === undefined)
                    entry.statusByRunPos.set(pos, 'S');
            }
        }
    }
    const tests = [];
    let stablePassCount = 0;
    let stableFailCount = 0;
    let flakyCount = 0;
    let skippedCount = 0;
    for (const [id, entry] of byId) {
        const seen = entry.passes + entry.failures;
        let verdict;
        if (seen === 0) {
            verdict = 'skipped';
            skippedCount += 1;
        }
        else if (entry.failures === 0) {
            verdict = 'stable-pass';
            stablePassCount += 1;
        }
        else if (entry.passes === 0) {
            verdict = 'stable-fail';
            stableFailCount += 1;
        }
        else {
            verdict = 'flaky';
            flakyCount += 1;
        }
        const timeline = orderedRuns.map((run, pos) => {
            const sym = entry.statusByRunPos.get(pos);
            if (sym !== undefined)
                return sym;
            if (run.report === null && run.timedOut === true)
                return 'T';
            return '-';
        });
        const executedDurations = [...entry.passDurations, ...entry.failDurations];
        const durPool = executedDurations.length > 0 ? executedDurations : entry.allDurations;
        const passDurationAvgMs = averageOrNull(entry.passDurations);
        const failDurationAvgMs = averageOrNull(entry.failDurations);
        const maxDurationMs = durPool.length === 0 ? 0 : round1(Math.max(...durPool));
        const p95DurationMs = percentile95(durPool);
        const errorClusters = finalizeClusters(entry.errorClusters);
        const patterns = detectPatterns({
            verdict,
            timeline,
            passDurationAvgMs,
            failDurationAvgMs,
            errorClusters,
            failedRunTimedOut: entry.failedRunTimedOut,
            passedSeeds: entry.passedSeeds,
            failedSeeds: entry.failedSeeds,
        });
        const failedSeedsArr = [...entry.failedSeeds];
        const record = {
            id,
            file: entry.file,
            name: entry.name,
            passes: entry.passes,
            failures: entry.failures,
            skips: entry.skips,
            failureRate: seen === 0 ? 0 : Math.round((entry.failures / seen) * 1000) / 10,
            verdict,
            timeline,
            passDurationAvgMs,
            failDurationAvgMs,
            maxDurationMs,
            p95DurationMs,
            errorClusters,
            patterns,
        };
        if (failedSeedsArr.length > 0)
            record.failedSeeds = failedSeedsArr;
        tests.push(record);
    }
    // 检查运行级异常（缺失报告、超时、输出截断或断言全过后的进程异常退出），生成合成 (timeout)/(crash) 记录。
    const abnormalPositions = [];
    let timedOutCount = 0;
    let teardownCrashCount = 0;
    for (let pos = 0; pos < orderedRuns.length; pos += 1) {
        const run = orderedRuns[pos];
        const rec = records[pos];
        const isMissingReport = run.report === null;
        const isTeardownOrExecAnomaly = run.report !== null && (run.timedOut === true
            || run.truncated === true
            || run.error !== undefined
            || (run.report.passed > 0 && run.report.failed === 0 && !rec.success));
        if (isMissingReport || isTeardownOrExecAnomaly) {
            abnormalPositions.push(pos);
            if (run.timedOut === true)
                timedOutCount += 1;
            if (run.report !== null
                && run.report.passed > 0
                && run.report.failed === 0
                && !rec.success
                && run.truncated !== true
                && run.timedOut !== true) {
                teardownCrashCount += 1;
            }
        }
    }
    if (abnormalPositions.length > 0) {
        const abnormalSet = new Set(abnormalPositions);
        const crashRuns = abnormalPositions.length;
        const completedRuns = records.length - crashRuns;
        const allTimedOut = timedOutCount === crashRuns && timedOutCount > 0;
        const synId = allTimedOut ? '(timeout)' : '(crash)';
        const synName = allTimedOut
            ? '运行超时（单轮未在超时前完成）'
            : '运行异常（进程失败或未产出报告）';
        const synVerdict = completedRuns > 0 ? 'flaky' : 'stable-fail';
        const synTimeline = orderedRuns.map((run, pos) => {
            if (!abnormalSet.has(pos))
                return 'P';
            return run.timedOut === true ? 'T' : 'F';
        });
        const synPassDurations = [];
        const synFailDurations = [];
        const synPassedSeeds = new Set();
        const synFailedSeeds = new Set();
        const synClusters = new Map();
        for (let pos = 0; pos < orderedRuns.length; pos += 1) {
            const run = orderedRuns[pos];
            const dur = Math.max(0, Number.isFinite(run.durationMs) ? run.durationMs : 0);
            if (abnormalSet.has(pos)) {
                synFailDurations.push(dur);
                if (run.seed !== undefined)
                    synFailedSeeds.add(run.seed);
                if (run.error !== undefined && run.error.trim() !== '') {
                    addErrorToClusters(synClusters, {
                        type: run.timedOut === true ? 'TimeoutError' : 'ProcessError',
                        message: run.error,
                    }, run.index);
                }
            }
            else {
                synPassDurations.push(dur);
                if (run.seed !== undefined)
                    synPassedSeeds.add(run.seed);
            }
        }
        const synPassAvg = averageOrNull(synPassDurations);
        const synFailAvg = averageOrNull(synFailDurations);
        const synAllDurations = [...synPassDurations, ...synFailDurations];
        const synErrorClusters = finalizeClusters(synClusters);
        const synPatterns = detectPatterns({
            verdict: synVerdict,
            timeline: synTimeline,
            passDurationAvgMs: synPassAvg,
            failDurationAvgMs: synFailAvg,
            errorClusters: synErrorClusters,
            failedRunTimedOut: timedOutCount > 0,
            passedSeeds: synPassedSeeds,
            failedSeeds: synFailedSeeds,
            teardownCrash: teardownCrashCount > 0,
        });
        const synFailedSeedsArr = [...synFailedSeeds];
        const synRecord = {
            id: synId,
            file: synId,
            name: synName,
            passes: completedRuns,
            failures: crashRuns,
            skips: 0,
            failureRate: Math.round((crashRuns / records.length) * 1000) / 10,
            verdict: synVerdict,
            timeline: synTimeline,
            passDurationAvgMs: synPassAvg,
            failDurationAvgMs: synFailAvg,
            maxDurationMs: synAllDurations.length === 0 ? 0 : round1(Math.max(...synAllDurations)),
            p95DurationMs: percentile95(synAllDurations),
            errorClusters: synErrorClusters,
            patterns: synPatterns,
        };
        if (synFailedSeedsArr.length > 0)
            synRecord.failedSeeds = synFailedSeedsArr;
        tests.push(synRecord);
        if (synVerdict === 'flaky')
            flakyCount += 1;
        else
            stableFailCount += 1;
    }
    let verdict;
    const passRuns = records.filter(run => run.success).length;
    const executionFailed = abnormalPositions.length > 0;
    if (tests.length === 0 && !executionFailed) {
        verdict = 'empty';
    }
    else if (tests.every(test => test.verdict === 'skipped') && !executionFailed) {
        verdict = 'skipped';
    }
    else if (flakyCount > 0) {
        verdict = 'flaky';
    }
    else if (passRuns === records.length && stableFailCount === 0) {
        verdict = 'stable-pass';
    }
    else if (passRuns === 0) {
        verdict = 'stable-fail';
    }
    else {
        verdict = 'flaky';
    }
    tests.sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict]
        || b.failureRate - a.failureRate
        || a.id.localeCompare(b.id));
    const result = {
        runs: records,
        verdict,
        stablePassCount,
        stableFailCount,
        flakyCount,
        skippedCount,
        tests,
        durationMs: records.reduce((sum, item) => sum + item.durationMs, 0),
    };
    if (verdict === 'stable-pass') {
        result.confidence95MaxFlakeRate = confidenceUpperBound(records.length, 0.95);
    }
    return result;
}
/** 结果里需要写入历史的 flaky 用例（保持精简，不携带大堆栈）。 */
export function flakyTests(result) {
    return result.tests
        .filter(test => test.verdict === 'flaky')
        .map(test => {
        const item = {
            file: test.file,
            name: test.name,
            failureRate: test.failureRate,
        };
        if (test.patterns.length > 0)
            item.patterns = test.patterns;
        const top = test.errorClusters[0];
        if (top !== undefined) {
            const prefix = top.type ? top.type + ': ' : '';
            item.topError = truncateSingleLine(prefix + top.message, 200);
        }
        return item;
    });
}
