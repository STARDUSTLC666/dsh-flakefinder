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
import { formatRef, parseRef } from './store.js';
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
        if (prop?.minItems !== undefined)
            node.minItems = prop.minItems;
        if (prop?.maxItems !== undefined)
            node.maxItems = prop.maxItems;
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
function resultSummary(result) {
    const lines = [
        '判定：' + verdictLabel(result.verdict),
        '重复运行：' + String(result.runs.length) + ' 次；总耗时：' + String(Math.round(result.durationMs / 100) / 10) + ' 秒',
        '稳定通过：' + String(result.stablePassCount) + '；稳定失败：' + String(result.stableFailCount) + '；flaky：' + String(result.flakyCount) + '；跳过：' + String(result.skippedCount),
    ];
    if (result.flakyCount > 0) {
        lines.push('flaky 用例：');
        for (const test of result.tests.filter(item => item.verdict === 'flaky')) {
            lines.push('- ' + formatRef(test) + '（失败率 ' + String(test.failureRate) + '%）');
        }
    }
    return lines.join('\n');
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
            const plans = Array.from({ length: runs }, (_, index) => buildPlan(process.cwd(), target, requested, index, cfg.pythonPath));
            const framework = plans[0]?.framework ?? 'node';
            const executed = [];
            for (let index = 0; index < plans.length; index += 1) {
                executed.push(await executePlan(runner, plans[index], index + 1, cfg.timeoutMs));
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
                summary: resultSummary(result),
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
                const lines = ['历史记录 ' + String(entries.length) + ' 条：'];
                for (const item of entries) {
                    const row = asRecord(item);
                    lines.push('- ' + row.target + '（' + row.framework + '，' + verdictLabel(String(row.verdict ?? '')) + '，' + String(row.runs ?? '?') + ' 次，' + row.timestamp + '）');
                }
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
            tests: { type: 'array', items: 'string', minItems: 1, maxItems: 100, required: true, description: '测试引用数组：文件路径，或 "文件路径 > 用例名"。' },
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
                return [{ type: 'text', text: '已写入隔离清单 ' + rec.file + '，新增 ' + String(rec.addedCount ?? 0) + ' 条。' }];
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
            tests: { type: 'array', items: 'string', minItems: 1, maxItems: 100, required: true, description: '测试引用数组：文件路径，或 "文件路径 > 用例名"。' },
        }),
        output: {
            schema: {
                type: 'object',
                properties: { file: { type: 'string' }, removedCount: { type: 'integer' }, removed: { type: 'array', items: { type: 'object', additionalProperties: true } } },
                additionalProperties: true,
            },
            render: (_args, value) => {
                const rec = asRecord(value);
                return [{ type: 'text', text: '已从隔离清单移除 ' + String(rec.removedCount ?? 0) + ' 条。' }];
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
                const lines = [
                    '测试稳定性报告',
                    '隔离清单：' + String(rec.quarantineFile ?? '') + '（' + String(rec.quarantinedCount ?? 0) + ' 条）',
                ];
                for (const item of quarantined) {
                    const row = asRecord(item);
                    lines.push('- ' + formatRef({ file: String(row.file ?? ''), name: typeof row.name === 'string' ? row.name : null }) + '：' + String(row.reason ?? ''));
                }
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
    if (cfg.writeApproval) {
        quarantine.gate = approvalGate('flaky_quarantine', '把测试用例写入 .flakefinder.json 隔离清单');
        clear.gate = approvalGate('flaky_clear', '从 .flakefinder.json 隔离清单移除测试用例');
    }
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
                for (const item of checks) {
                    const c = asRecord(item);
                    lines.push('- ' + c.name + '：' + (c.ok === true ? '✅' : '❌ ' + String(c.detail ?? '')));
                }
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
/** 写操作审批门：复用 dsh-docker 的中文拒绝语义。 */
function approvalGate(toolName, action) {
    return async (exec, next) => {
        const record = (typeof exec === 'object' && exec !== null ? exec : {});
        const approval = record.approval;
        if (approval === undefined) {
            return { kind: 'deny', reason: toolName + ' 需要确认，但当前环境没有审批通道（如 headless）。如确定安全，可在配置中设置 writeApproval: false。' };
        }
        const outcome = await approval.request({
            agent: record.agent,
            toolName: record.toolName,
            callId: record.callId,
            reason: action,
            signal: record.signal,
        });
        if (outcome === 'allowed-once')
            return next();
        if (outcome === 'cancelled')
            return { kind: 'deny', reason: action + ' 被取消，未执行。' };
        if (outcome === 'unavailable')
            return { kind: 'deny', reason: action + ' 不可用（没有可用的审批界面），未执行。' };
        return { kind: 'deny', reason: action + ' 未获批准：要么你拒绝了，要么当前会话处于 Full Access。若确需直接写入，可设置 writeApproval: false（自行承担风险）。' };
    };
}
