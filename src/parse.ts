/**
 * 测试报告解析：vitest / jest 的 JSON reporter 与 node:test 的 TAP 输出统一成
 * 一次运行的扁平用例列表。
 *
 * @module dsh-flakefinder/parse
 */

export type TestStatus = 'passed' | 'failed' | 'skipped'

export interface NormalizedTest {
  id: string
  file: string
  name: string
  status: TestStatus
  durationMs: number
}

export interface NormalizedRun {
  framework: string
  success: boolean
  total: number
  passed: number
  failed: number
  skipped: number
  tests: NormalizedTest[]
}

interface RawAssertion {
  fullName?: unknown
  title?: unknown
  status?: unknown
  duration?: unknown
}

interface RawSuite {
  name?: unknown
  status?: unknown
  assertionResults?: RawAssertion[]
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeStatus(value: unknown): TestStatus {
  if (value === 'passed') return 'passed'
  if (value === 'failed') return 'failed'
  if (value === 'pending' || value === 'skipped' || value === 'todo' || value === 'disabled') return 'skipped'
  return 'failed'
}

/** vitest 与 jest 的 JSON 结构高度接近，这里统一读取。 */
export function parseJsonReport(text: string, framework: string): NormalizedRun {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    throw new Error(framework + ' 报告不是合法 JSON。请确认项目安装的是支持 --reporter=json 的版本。')
  }
  const obj = (root ?? {}) as Record<string, unknown>
  const suites = Array.isArray(obj.testResults) ? obj.testResults as RawSuite[] : []
  const tests: NormalizedTest[] = []

  for (const suite of suites) {
    const file = typeof suite.name === 'string' && suite.name !== '' ? suite.name : '(unknown)'
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : []
    if (assertions.length > 0) {
      for (const item of assertions) {
        const fullName = typeof item.fullName === 'string' && item.fullName !== ''
          ? item.fullName
          : (typeof item.title === 'string' ? item.title : '(unnamed)')
        const status = normalizeStatus(item.status)
        tests.push({
          id: file + ' > ' + fullName,
          file,
          name: fullName,
          status,
          durationMs: Math.max(0, asNumber(item.duration) ?? 0),
        })
      }
    } else {
      const status = normalizeStatus(suite.status)
      tests.push({
        id: file + ' > (suite)',
        file,
        name: '(suite)',
        status,
        durationMs: 0,
      })
    }
  }

  return {
    framework,
    success: obj.success === true,
    total: reportedCount(obj.numTotalTests, tests.length),
    passed: reportedCount(obj.numPassedTests, tests.filter(test => test.status === 'passed').length),
    failed: reportedCount(obj.numFailedTests, tests.filter(test => test.status === 'failed').length),
    skipped: reportedCount(obj.numPendingTests, tests.filter(test => test.status === 'skipped').length),
    tests,
  }
}

function reportedCount(reported: unknown, fallback: number): number {
  if (typeof reported === 'number' && Number.isFinite(reported)) return Math.round(reported)
  return fallback
}

/** 解析 node:test 的 TAP 输出；子测试行忽略，只保留顶层用例。 */
export function parseTapReport(text: string): NormalizedRun {
  const tests: NormalizedTest[] = []
  const lines = text.split(/\r?\n/)
  let index = 0
  for (const line of lines) {
    const match = /^(not ok|ok)\s+(\d+)\s+-\s*(.+?)\s*$/.exec(line.trim())
    if (match === null) continue
    const failed = match[1] === 'not ok'
    index += 1
    const name = (match[3] ?? '(unnamed)').replace(/\s+#.*$/, '')
    tests.push({
      id: 'node:' + String(index) + ' > ' + name,
      file: '(node:test)',
      name,
      status: failed ? 'failed' : 'passed',
      durationMs: 0,
    })
  }
  const failed = tests.filter(item => item.status === 'failed').length
  return {
    framework: 'node',
    success: failed === 0 && tests.length > 0,
    total: tests.length,
    passed: tests.length - failed,
    failed,
    skipped: 0,
    tests,
  }
}
