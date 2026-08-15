/**
 * 多轮结果聚合与 flaky 判定：纯函数，便于单测边界。
 *
 * @module dsh-flakefinder/classify
 */

import type { NormalizedRun, NormalizedTest } from './parse.js'

export type RunVerdict = 'stable-pass' | 'stable-fail' | 'flaky' | 'empty' | 'skipped'
export type TestVerdict = 'stable-pass' | 'stable-fail' | 'flaky' | 'skipped'

export interface RunRecord {
  runIndex: number
  success: boolean
  passed: number
  failed: number
  skipped: number
  durationMs: number
}

export interface TestRecord {
  id: string
  file: string
  name: string
  passes: number
  failures: number
  skips: number
  failureRate: number
  verdict: TestVerdict
}

export interface DetectionResult {
  runs: RunRecord[]
  verdict: RunVerdict
  stablePassCount: number
  stableFailCount: number
  flakyCount: number
  skippedCount: number
  tests: TestRecord[]
  durationMs: number
}

export function aggregate(runs: Array<{ index: number; report: NormalizedRun | null; durationMs: number; error?: string }>): DetectionResult {
  const records: RunRecord[] = runs.map(run => ({
    runIndex: run.index,
    success: run.report?.success === true,
    passed: run.report?.passed ?? 0,
    failed: run.report?.failed ?? 0,
    skipped: run.report?.skipped ?? 0,
    durationMs: run.durationMs,
  }))

  const active = runs.filter(run => run.report !== null)
  if (active.length === 0) {
    const detail = runs.find(run => run.error !== undefined)
    throw new Error('没有一次运行产出可解析的测试报告。' + (detail?.error !== undefined ? ' 首个错误：' + detail.error : ''))
  }

  const byId = new Map<string, { file: string; name: string; passes: number; failures: number; skips: number }>()
  for (const run of active) {
    const tests = run.report?.tests ?? []
    for (const test of tests) {
      let entry = byId.get(test.id)
      if (entry === undefined) {
        entry = { file: test.file, name: test.name, passes: 0, failures: 0, skips: 0 }
        byId.set(test.id, entry)
      }
      if (test.status === 'passed') entry.passes += 1
      else if (test.status === 'failed') entry.failures += 1
      else entry.skips += 1
    }
  }

  const tests: TestRecord[] = []
  let stablePassCount = 0
  let stableFailCount = 0
  let flakyCount = 0
  let skippedCount = 0
  for (const [id, entry] of byId) {
    const seen = entry.passes + entry.failures
    let verdict: TestVerdict
    if (seen === 0) {
      verdict = 'skipped'
      skippedCount += 1
    } else if (entry.failures === 0) {
      verdict = 'stable-pass'
      stablePassCount += 1
    } else if (entry.passes === 0) {
      verdict = 'stable-fail'
      stableFailCount += 1
    } else {
      verdict = 'flaky'
      flakyCount += 1
    }
    tests.push({
      id,
      file: entry.file,
      name: entry.name,
      passes: entry.passes,
      failures: entry.failures,
      skips: entry.skips,
      failureRate: seen === 0 ? 0 : Math.round((entry.failures / seen) * 1000) / 10,
      verdict,
    })
  }

  let verdict: RunVerdict
  const passRuns = records.filter(run => run.success).length
  if (tests.every(test => test.verdict === 'skipped')) {
    verdict = 'skipped'
  } else if (passRuns === records.length) {
    verdict = 'stable-pass'
  } else if (passRuns === 0) {
    verdict = 'stable-fail'
  } else {
    verdict = 'flaky'
  }

  tests.sort((a, b) => a.id.localeCompare(b.id))
  return {
    runs: records,
    verdict,
    stablePassCount,
    stableFailCount,
    flakyCount,
    skippedCount,
    tests,
    durationMs: records.reduce((sum, item) => sum + item.durationMs, 0),
  }
}

/** 结果里需要写入历史的 flaky 用例。 */
export function flakyTests(result: DetectionResult): Array<{ file: string; name: string; failureRate: number }> {
  return result.tests
    .filter(test => test.verdict === 'flaky')
    .map(test => ({ file: test.file, name: test.name, failureRate: test.failureRate }))
}
