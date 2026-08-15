/**
 * 测试框架探测与 argv 构建：直接调用本地 node_modules 里的 CLI 入口，
 * 全程 argv 数组、无 shell，避免 npx 下载与命令注入。
 *
 * @module dsh-flakefinder/args
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { assertTarget } from './config.js'

export type Framework = 'auto' | 'vitest' | 'jest' | 'node'
export type ReportKind = 'json' | 'tap'

export interface TestPlan {
  framework: Exclude<Framework, 'auto'>
  reportKind: ReportKind
  reportPath: string
  argv: string[]
  label: string
}

/** 解析 framework 参数；非法值抛中文错误。 */
export function readFramework(raw: unknown): Framework {
  if (raw === undefined || raw === null) return 'auto'
  if (raw === 'auto' || raw === 'vitest' || raw === 'jest' || raw === 'node') return raw
  throw new Error('framework 只支持 auto / vitest / jest / node，收到：' + String(raw))
}

function localEntry(cwd: string, ...parts: string[]): string | null {
  const full = path.join(cwd, ...parts)
  return fs.existsSync(full) ? full : null
}

/** 在 cwd 里探测本地框架 CLI 入口；显式指定时缺失会给出中文指引。 */
export function detectFramework(cwd: string, requested: Framework): Exclude<Framework, 'auto'> {
  const vitest = localEntry(cwd, 'node_modules', 'vitest', 'vitest.mjs')
  const jest = localEntry(cwd, 'node_modules', 'jest', 'bin', 'jest.js')
  if (requested !== 'auto') {
    if (requested === 'vitest' && vitest === null) {
      throw new Error('framework=vitest，但在 ' + cwd + ' 下找不到 node_modules/vitest/vitest.mjs。请先安装 vitest（例如 pnpm add -D vitest）。')
    }
    if (requested === 'jest' && jest === null) {
      throw new Error('framework=jest，但在 ' + cwd + ' 下找不到 node_modules/jest/bin/jest.js。请先安装 jest。')
    }
    return requested
  }
  if (vitest !== null) return 'vitest'
  if (jest !== null) return 'jest'
  return 'node'
}

/** 构建一次测试运行的执行计划。runIndex 仅用于给临时报告文件命名。 */
export function buildPlan(cwd: string, target: string, requested: Framework, runIndex: number): TestPlan {
  const safeTarget = assertTarget(target)
  const framework = detectFramework(cwd, requested)
  const token = crypto.randomBytes(6).toString('hex')

  if (framework === 'vitest') {
    const entry = localEntry(cwd, 'node_modules', 'vitest', 'vitest.mjs')
    if (entry === null) throw new Error('未找到本地 vitest 入口：node_modules/vitest/vitest.mjs')
    const reportPath = path.join(os.tmpdir(), 'dsh-flakefinder-vitest-' + process.pid + '-' + String(runIndex) + '-' + token + '.json')
    return {
      framework,
      reportKind: 'json',
      reportPath,
      argv: [process.execPath, entry, 'run', safeTarget, '--reporter=json', '--outputFile', reportPath],
      label: 'vitest run ' + safeTarget,
    }
  }

  if (framework === 'jest') {
    const entry = localEntry(cwd, 'node_modules', 'jest', 'bin', 'jest.js')
    if (entry === null) throw new Error('未找到本地 jest 入口：node_modules/jest/bin/jest.js')
    const reportPath = path.join(os.tmpdir(), 'dsh-flakefinder-jest-' + process.pid + '-' + String(runIndex) + '-' + token + '.json')
    return {
      framework,
      reportKind: 'json',
      reportPath,
      argv: [process.execPath, entry, '--runInBand', '--json', '--outputFile', reportPath, safeTarget],
      label: 'jest run ' + safeTarget,
    }
  }

  return {
    framework: 'node',
    reportKind: 'tap',
    reportPath: '',
    argv: [process.execPath, '--test', '--test-reporter=tap', safeTarget],
    label: 'node --test ' + safeTarget,
  }
}
