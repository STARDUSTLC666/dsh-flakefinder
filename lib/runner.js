/**
 * 进程执行层：复用 dsh-docker 同款 subprocess 包装，并按计划读取 JSON 报告。
 *
 * @module dsh-flakefinder/runner
 */
import fs from 'node:fs/promises';
import { parseJsonReport, parseJunitReport, parseTapReport } from './parse.js';
const COLLECT_BYTES = 4 * 1024 * 1024;
/** 用 DSH subprocess 服务构造 ProcessRunner。 */
export function createSubprocessRunner(spawn, graceMs, defaultTimeoutMs) {
    return {
        async run(argv, options) {
            const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(new Error('flakefinder test run timed out')), timeoutMs);
            let handle;
            try {
                handle = spawn({
                    argv,
                    cwd: process.cwd(),
                    stdio: {
                        stdin: 'ignore',
                        stdout: { maxBytes: COLLECT_BYTES },
                        stderr: { maxBytes: COLLECT_BYTES },
                    },
                    graceMs,
                    signal: controller.signal,
                });
                const outcome = await handle.done;
                const stdout = handle.collected.stdout?.readFrom(0).text ?? '';
                const stderr = handle.collected.stderr?.readFrom(0).text ?? '';
                return { exitCode: outcome.exitCode, signal: outcome.signal, stdout, stderr };
            }
            finally {
                clearTimeout(timer);
            }
        },
    };
}
function stderrTail(stderr) {
    const tail = stderr.trim().split(/\r?\n/).slice(-5).join(' | ');
    return tail || '无错误输出';
}
/** 执行一个测试计划并读取报告；进程失败但报告存在时仍返回报告。 */
export async function executePlan(runner, plan, index, timeoutMs) {
    const started = Date.now();
    const result = await runner.run(plan.argv, { timeoutMs });
    const durationMs = Date.now() - started;
    if (plan.reportKind === 'tap') {
        return {
            index,
            report: parseTapReport(result.stdout),
            durationMs,
            exitCode: result.exitCode,
            stderr: result.stderr,
        };
    }
    let fileText = '';
    let fileError = '';
    try {
        fileText = await fs.readFile(plan.reportPath, 'utf8');
    }
    catch (error) {
        fileError = error instanceof Error ? error.message : String(error);
    }
    finally {
        await fs.rm(plan.reportPath, { force: true }).catch(() => { });
    }
    if (fileText.trim() === '') {
        return {
            index,
            report: null,
            durationMs,
            exitCode: result.exitCode,
            stderr: result.stderr,
            error: plan.framework + ' 没有写出报告文件（' + fileError + '）。进程退出码：' + String(result.exitCode ?? 'null') + '；stderr：' + stderrTail(result.stderr),
        };
    }
    try {
        return {
            index,
            report: plan.reportKind === 'junit' ? parseJunitReport(fileText) : parseJsonReport(fileText, plan.framework),
            durationMs,
            exitCode: result.exitCode,
            stderr: result.stderr,
        };
    }
    catch (error) {
        return {
            index,
            report: null,
            durationMs,
            exitCode: result.exitCode,
            stderr: result.stderr,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
