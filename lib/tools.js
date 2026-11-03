/**
 * 五个面向模型的测试稳定性工具：
 * flaky_detect / flaky_history / flaky_quarantine / flaky_clear / flaky_report。
 *
 * @module dsh-flakefinder/tools
 */
import { buildPlan, readFramework } from './args.js';
import { aggregate, flakyTests } from './classify.js';
import { assertTarget, optionalInteger, optionalString, requiredString, resolveRuns, } from './config.js';
import { executePlan } from './runner.js';
import { createStore, formatRef, parseRef } from './store.js';
import { resolve } from 'node:path';
function compileParameters(spec) {
    const properties = {};
    const required = [];
    for (const [key, prop] of Object.entries(spec)) {
        if (prop?.required === true)
            required.push(key);
        const node = {};
        if (typeof prop?.type === 'string')
            node.type = prop.type;
        if (typeof prop?.description === 'string')
            node.description = prop.description;
        if (typeof prop?.items === 'string')
            node.items = { type: prop.items };
        properties[key] = node;
    }
    return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
}
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : {};
}
function parseRefList(args) {
    const raw = args.tests;
    if (!Array.isArray(raw) || raw.length === 0)
        throw new Error('tests 为必填数组，至少包含一个测试引用。');
    if (raw.length > 100)
        throw new Error('tests 一次最多 100 条，请分批处理。');
    return raw.map(item => {
        if (typeof item !== 'string')
            throw new Error('tests 数组里的每一项必须是字符串，格式：文件路径，或 "文件路径 > 用例名"。');
        return parseRef(item);
    });
}
function verdictLabel(verdict) {
    switch (verdict) {
        case 'stable-pass': return '稳定通过';
        case 'stable-fail': return '稳定失败';
        case 'flaky': return '不稳定（flaky）';
        case 'skipped': return '全部跳过';
        case 'empty': return '空结果';
        default: return verdict;
    }
}
function resultSummary(result, runs = [], subject) {
    const lines = [];
    if (subject !== undefined)
        lines.push('目标：' + subject.target + '（framework=' + subject.framework + '）');
    lines.push('判定：' + verdictLabel(result.verdict), '重复运行：' + String(result.runs.length) + ' 次；总耗时：' + String(Math.round(result.durationMs / 100) / 10) + ' 秒', '稳定通过：' + String(result.stablePassCount) + '；稳定失败：' + String(result.stableFailCount) + '；flaky：' + String(result.flakyCount) + '；跳过：' + String(result.skippedCount));
    if (result.flakyCount > 0) {
        lines.push('flaky 用例：');
        for (const test of result.tests.filter(item => item.verdict === 'flaky')) {
            lines.push('- ' + formatRef(test) + '（失败率 ' + String(test.failureRate) + '%）');
        }
    }
    // 部分运行崩溃时 aggregate 不抛错，但错误原文只在 run.error 里；不带到摘要里用户只能看到「flaky」而不知道进程挂了。
    const crashed = runs.filter(run => run.report === null);
    if (crashed.length > 0) {
        const first = crashed.find(run => run.error !== undefined)?.error ?? '未产出报告（stderr：' + (crashed[0].stderr.trim().split(/\r?\n/).slice(-3).join(' | ') || '无输出') + '）';
        lines.push('有 ' + String(crashed.length) + ' 次运行未产出报告：' + first);
    }
    lines.push('下一步：' + nextStepOf(result.verdict));
    return lines.join('\n');
}
/** 按判定给出下一步；文案复用 tools 里已有的工具名，避免另造词汇。 */
function nextStepOf(verdict) {
    switch (verdict) {
        case 'flaky': return '先用 flaky_quarantine 把这些用例写进隔离清单（写清原因），再单跑定位竞态；修复后用 flaky_detect 复查并 flaky_clear。';
        case 'stable-fail': return '先单独跑一次这个测试看失败原因；若每次运行都崩溃（提示未产出报告），检查框架 CLI、reporter 与 pytest 的 junitxml 依赖。';
        case 'stable-pass': return '多轮全部通过；若此前隔离过这些用例，可用 flaky_clear 移除。';
        case 'skipped': return '所有用例被跳过：检查测试文件里的 skip / 条件编译，或 target 是否只匹配到空壳文件。';
        case 'empty': return '没有解析到用例：确认 target 指向存在的测试文件或目录（可用 glob，如 test/**/*.test.mjs），必要时显式指定 framework。';
        default: return '可运行 flaky_history / flaky_report 查看历史趋势。';
    }
}
const testSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        file: { type: 'string' },
        name: { type: 'string' },
        passes: { type: 'integer' },
        failures: { type: 'integer' },
        failureRate: { type: 'number' },
        verdict: { type: 'string' },
    },
    additionalProperties: true,
};
const detectSchema = {
    type: 'object',
    properties: {
        target: { type: 'string' },
        framework: { type: 'string' },
        runs: { type: 'integer' },
        verdict: { type: 'string' },
        stablePassCount: { type: 'integer' },
        stableFailCount: { type: 'integer' },
        flakyCount: { type: 'integer' },
        skippedCount: { type: 'integer' },
        durationMs: { type: 'integer' },
        runResults: { type: 'array', items: { type: 'object', additionalProperties: true } },
        tests: { type: 'array', items: testSchema },
        flakyTests: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
    additionalProperties: true,
};
/** 构建五个工具定义。 */
export function buildFlakeTools(cfg, runner, store) {
    return buildWorkspaceTools(cfg, runner, store).map(tool => ({ ...tool, async execute(args, exec) {
            const context = exec;
            const signal = context?.signal;
            signal?.throwIfAborted();
            const cwd = context?.agent?.session?.header?.cwd || process.cwd();
            const scopedStore = context?.agent?.session?.header?.cwd && cfg.quarantineFileRelative ? createStore(cfg.dataDir, resolve(cwd, cfg.quarantineFileRelative)) : store;
            const scopedRunner = { run: (argv, options) => runner.run(argv, { ...options, cwd, signal }) };
            const selected = buildWorkspaceTools(cfg, scopedRunner, scopedStore, cwd, signal).find(row => row.name === tool.name);
            return selected.execute(args, exec);
        } }));
}
function buildWorkspaceTools(cfg, runner, store, cwd = process.cwd(), signal) {
    const detect = {
        name: 'flaky_detect',
        description: '重复运行测试多次并判定稳定性：stable-pass（全过）/ stable-fail（全挂）/ flaky（时好时坏）。支持 vitest / jest / pytest / node:test，自动探测本地框架。结果写入历史供 flaky_report 分析。',
        parameters: compileParameters({
            target: { type: 'string', required: true, description: '测试文件、目录或 glob（相对当前工作区）。不能以 - 开头。' },
            framework: { type: 'string', description: 'auto（默认，自动探测 vitest→jest→pytest→node:test）/ vitest / jest / pytest / node。' },
            runs: { type: 'integer', description: '重复次数，默认取配置 defaultRuns。' },
        }),
        output: {
            schema: detectSchema,
            render: (_args, value) => {
                const rec = asRecord(value);
                const summary = typeof rec.summary === 'string' ? rec.summary : '';
                return [{ type: 'text', text: summary === '' ? '检测完成。' : summary }];
            },
        },
        async execute(rawArgs) {
            const args = asRecord(rawArgs);
            const target = assertTarget(requiredString(args, 'target', '测试目标'));
            const requested = readFramework(args.framework);
            const runs = resolveRuns(args.runs, cfg);
            const plans = Array.from({ length: runs }, (_, index) => buildPlan(cwd, target, requested, index, cfg.pythonPath));
            const framework = plans[0]?.framework ?? 'node';
            const executed = [];
            for (let index = 0; index < plans.length; index += 1) {
                signal?.throwIfAborted();
                executed.push(await executePlan(runner, plans[index], index + 1, cfg.timeoutMs, cwd, signal));
            }
            const result = aggregate(executed.map(item => ({ index: item.index, report: item.report, durationMs: item.durationMs, error: item.error })));
            const flaky = flakyTests(result);
            const entry = {
                timestamp: new Date().toISOString(),
                target,
                framework,
                runs: result.runs.length,
                durationMs: result.durationMs,
                verdict: result.verdict,
                stablePassCount: result.stablePassCount,
                stableFailCount: result.stableFailCount,
                flakyCount: result.flakyCount,
                skippedCount: result.skippedCount,
                flakyTests: flaky,
            };
            signal?.throwIfAborted();
            await store.appendHistory(entry);
            return {
                target,
                framework,
                runs: result.runs.length,
                verdict: result.verdict,
                stablePassCount: result.stablePassCount,
                stableFailCount: result.stableFailCount,
                flakyCount: result.flakyCount,
                skippedCount: result.skippedCount,
                durationMs: result.durationMs,
                runResults: result.runs,
                tests: result.tests,
                flakyTests: flaky,
                summary: resultSummary(result, executed, { target, framework }),
            };
        },
        timeoutMs: runsTimeout(cfg),
    };
    const history = {
        name: 'flaky_history',
        description: '查询 flaky_detect 的历史记录，可按测试目标过滤，用于判断某个测试是长期稳定失败还是偶发问题。',
        parameters: compileParameters({
            target: { type: 'string', description: '按测试目标过滤（可选，子串匹配）。' },
            limit: { type: 'integer', description: '返回条数 1-100（默认 20）。' },
        }),
        output: {
            schema: {
                type: 'object',
                properties: { count: { type: 'integer' }, entries: { type: 'array', items: { type: 'object', additionalProperties: true } } },
                additionalProperties: true,
            },
            render: (_args, value) => {
                const rec = asRecord(value);
                const entries = Array.isArray(rec.entries) ? rec.entries : [];
                if (entries.length === 0) {
                    return [{ type: 'text', text: '历史记录 0 条：还没有跑过 flaky_detect（或过滤条件没有命中）。下一步：先对目标运行 flaky_detect，再用本工具看趋势。' }];
                }
                const lines = ['历史记录 ' + String(entries.length) + ' 条（新的在前）：'];
                for (const item of entries) {
                    const row = asRecord(item);
                    const flaky = Number(row.flakyCount ?? 0);
                    lines.push('- ' + row.timestamp + ' ' + row.target + '（' + row.framework + '，' + verdictLabel(String(row.verdict ?? '')) + '，' + String(row.runs ?? '?') + ' 次' + (flaky > 0 ? '，flaky ' + String(flaky) : '') + '）');
                }
                lines.push('下一步：需要判定标准/隔离清单汇总时用 flaky_report；修复后重新 flaky_detect 复查。');
                return [{ type: 'text', text: lines.join('\n') }];
            },
        },
        async execute(rawArgs) {
            const args = asRecord(rawArgs);
            const target = optionalString(args, 'target');
            const limit = optionalInteger(args, 'limit', '返回条数', 1, 100, 20);
            const entries = await store.listHistory(target, limit);
            return { count: entries.length, entries };
        },
        timeoutMs: 10000,
    };
    const quarantine = {
        name: 'flaky_quarantine',
        description: '把确认的 flaky 用例写入项目根 .flakefinder.json 隔离清单（不修改测试源码）。需要 flaky_detect 判定为 flaky 后再使用。',
        parameters: compileParameters({
            tests: { type: 'array', items: 'string', required: true, description: '1-100 条测试引用：文件路径，或 "文件路径 > 用例名"。' },
            reason: { type: 'string', required: true, description: '隔离原因（会写进清单，例如：定时器竞态，见 issue #12）。' },
        }),
        output: {
            schema: {
                type: 'object',
                properties: { file: { type: 'string' }, addedCount: { type: 'integer' }, added: { type: 'array', items: { type: 'object', additionalProperties: true } } },
                additionalProperties: true,
            },
            render: (_args, value) => {
                const rec = asRecord(value);
                const added = Number(rec.addedCount ?? 0);
                const head = added === 0
                    ? '隔离清单 ' + rec.file + ' 未新增条目：这些用例已在清单里（同文件同用例名视为同一条）。'
                    : '已写入隔离清单 ' + rec.file + '，新增 ' + String(added) + ' 条。';
                return [{ type: 'text', text: head + '\n下一步：修复后运行 flaky_detect 多轮全部通过，再用 flaky_clear 移除这些条目。' }];
            },
        },
        async execute(rawArgs) {
            const args = asRecord(rawArgs);
            const refs = parseRefList(args);
            const reason = requiredString(args, 'reason', '隔离原因');
            const outcome = await store.addQuarantine(refs, reason);
            return { file: outcome.file, addedCount: outcome.added.length, added: outcome.added };
        },
        timeoutMs: 10000,
    };
    const clear = {
        name: 'flaky_clear',
        description: '从隔离清单移除已经恢复稳定的用例。建议先 flaky_detect 验证多轮全部通过后再清除。',
        parameters: compileParameters({
            tests: { type: 'array', items: 'string', required: true, description: '1-100 条测试引用：文件路径，或 "文件路径 > 用例名"。' },
        }),
        output: {
            schema: {
                type: 'object',
                properties: { file: { type: 'string' }, removedCount: { type: 'integer' }, removed: { type: 'array', items: { type: 'object', additionalProperties: true } } },
                additionalProperties: true,
            },
            render: (_args, value) => {
                const rec = asRecord(value);
                const removed = Number(rec.removedCount ?? 0);
                const head = removed === 0
                    ? '隔离清单 ' + rec.file + ' 没有匹配条目可移除：请核对测试引用的文件路径与用例名（格式 "文件路径 > 用例名"），可用 flaky_report 查看清单里现有条目。'
                    : '已从隔离清单移除 ' + String(removed) + ' 条。';
                return [{ type: 'text', text: head + (removed === 0 ? '' : '\n下一步：建议再跑一次 flaky_detect，确认移除后仍稳定。') }];
            },
        },
        async execute(rawArgs) {
            const args = asRecord(rawArgs);
            const refs = parseRefList(args);
            const outcome = await store.removeQuarantine(refs);
            return { file: outcome.file, removedCount: outcome.removed.length, removed: outcome.removed };
        },
        timeoutMs: 10000,
    };
    const report = {
        name: 'flaky_report',
        description: '汇总隔离清单与检测历史，输出项目测试稳定性报告（只读，不运行测试）。',
        parameters: compileParameters({
            target: { type: 'string', description: '按测试目标过滤历史（可选）。' },
            historyLimit: { type: 'integer', description: '历史条数 1-100（默认 20）。' },
        }),
        output: {
            schema: {
                type: 'object',
                properties: {
                    quarantineFile: { type: 'string' },
                    quarantinedCount: { type: 'integer' },
                    quarantined: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    historyCount: { type: 'integer' },
                    history: { type: 'array', items: { type: 'object', additionalProperties: true } },
                },
                additionalProperties: true,
            },
            render: (_args, value) => {
                const rec = asRecord(value);
                const quarantined = Array.isArray(rec.quarantined) ? rec.quarantined : [];
                const history = Array.isArray(rec.history) ? rec.history : [];
                const lines = [
                    '测试稳定性报告',
                    '隔离清单：' + String(rec.quarantineFile ?? '') + '（' + String(rec.quarantinedCount ?? 0) + ' 条）',
                ];
                if (quarantined.length === 0)
                    lines.push('- 清单为空：还没有被隔离的用例。下一步：flaky_detect 判定为 flaky 后用 flaky_quarantine 写入。');
                for (const item of quarantined) {
                    const row = asRecord(item);
                    lines.push('- ' + formatRef({ file: String(row.file ?? ''), name: typeof row.name === 'string' ? row.name : null }) + '：' + String(row.reason ?? ''));
                }
                // 报告以前只渲染隔离清单，把 payload 里的检测历史整段丢掉；用户看不到「最近判定」。
                lines.push('', '检测历史：' + String(rec.historyCount ?? history.length) + ' 条');
                if (history.length === 0)
                    lines.push('- 还没有检测记录：先对一个目标运行 flaky_detect。');
                for (const item of history.slice(0, 10)) {
                    const row = asRecord(item);
                    const flaky = Number(row.flakyCount ?? 0);
                    lines.push('- ' + row.timestamp + ' ' + row.target + '（' + verdictLabel(String(row.verdict ?? '')) + '，' + String(row.runs ?? '?') + ' 次' + (flaky > 0 ? '，flaky ' + String(flaky) : '') + '）');
                }
                if (history.length > 10)
                    lines.push('…仅展示最近 10 条，其余用 flaky_history 查看');
                return [{ type: 'text', text: lines.join('\n') }];
            },
        },
        async execute(rawArgs) {
            const args = asRecord(rawArgs);
            const target = optionalString(args, 'target');
            const historyLimit = optionalInteger(args, 'historyLimit', '历史条数', 1, 100, 20);
            const doc = await store.loadQuarantine();
            const historyEntries = await store.listHistory(target, historyLimit);
            return {
                quarantineFile: store.quarantinePath,
                quarantinedCount: doc.quarantined.length,
                quarantined: doc.quarantined,
                historyCount: historyEntries.length,
                history: historyEntries,
            };
        },
        timeoutMs: 10000,
    };
    const flakyHealth = {
        name: 'flaky_health',
        description: 'dsh-flakefinder 自检：验证 Python 解释器与 pytest 是否可用（pytest 框架必需），并汇总默认配置。遇到问题时先运行本工具定位。',
        parameters: compileParameters({}),
        output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args, value) => {
                const rec = asRecord(value);
                const checks = Array.isArray(rec.checks) ? rec.checks : [];
                const lines = ['dsh-flakefinder 自检' + (rec.ok === true ? '：正常。' : '：发现问题。')];
                const failed = [];
                for (const item of checks) {
                    const c = asRecord(item);
                    lines.push('- ' + c.name + '：' + (c.ok === true ? '✅' : '❌ ' + String(c.detail ?? '')));
                    if (c.ok !== true)
                        failed.push(String(c.name));
                }
                if (failed.includes('pytest'))
                    lines.push('下一步：仅用 vitest / jest / node:test 时 pytest 缺失不影响；需要跑 Python 测试时先 pip install pytest，或把插件配置里的 pythonPath 指到正确的解释器。');
                else if (failed.length > 0)
                    lines.push('下一步：按上面 ❌ 项的说明修好解释器/依赖，再运行 flaky_health 复查。');
                return [{ type: 'text', text: lines.join('\n') }];
            },
        },
        async execute() {
            const checks = [];
            let ok = true;
            try {
                const result = await runner.run([cfg.pythonPath, '--version'], { timeoutMs: 15000 });
                const version = (result.stdout + result.stderr).split(/\r?\n/)[0]?.trim() ?? '';
                if (result.exitCode === 0)
                    checks.push({ name: 'python', ok: true, detail: version + '（' + cfg.pythonPath + '）' });
                else {
                    ok = false;
                    checks.push({ name: 'python', ok: false, detail: '退出码 ' + String(result.exitCode) });
                }
            }
            catch (error) {
                ok = false;
                checks.push({ name: 'python', ok: false, detail: error instanceof Error ? error.message : String(error) });
            }
            try {
                const result = await runner.run([cfg.pythonPath, '-m', 'pytest', '--version'], { timeoutMs: 20000 });
                const version = (result.stdout + result.stderr).split(/\r?\n/)[0]?.trim() ?? '';
                if (result.exitCode === 0)
                    checks.push({ name: 'pytest', ok: true, detail: version });
                else {
                    ok = false;
                    checks.push({ name: 'pytest', ok: false, detail: '未安装或不可用（pip install pytest）' });
                }
            }
            catch (error) {
                ok = false;
                checks.push({ name: 'pytest', ok: false, detail: error instanceof Error ? error.message : String(error) });
            }
            checks.push({ name: '默认配置', ok: true, detail: 'defaultRuns=' + cfg.defaultRuns + ', timeoutMs=' + cfg.timeoutMs });
            return { ok, plugin: 'dsh-flakefinder', checks };
        },
        timeoutMs: 40000,
    };
    return [detect, history, quarantine, clear, report, flakyHealth];
}
function runsTimeout(cfg) {
    return Math.min(10 * 60 * 1000, cfg.maxRuns * cfg.timeoutMs + 15000);
}
