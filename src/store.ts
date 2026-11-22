/**
 * 历史与隔离清单存储：按工作区隔离历史、兼容旧版全局历史与 v1 隔离清单、原子写入与文件锁。
 *
 * @module dsh-flakefinder/store
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import lockfile from 'proper-lockfile'

export interface HistoryFlakyTest {
  file: string
  name: string
  failureRate: number
  patterns?: string[]
  topError?: string
}

export interface HistoryEntry {
  timestamp: string
  target: string
  framework: string
  runs: number
  durationMs: number
  verdict: string
  stablePassCount: number
  stableFailCount: number
  flakyCount: number
  skippedCount: number
  flakyTests: HistoryFlakyTest[]
  workspace?: string
  testName?: string
  mode?: string
  concurrency?: number
  shuffle?: boolean
  failedSeeds?: number[]
  errorSummary?: Array<{ message: string; count: number }>
}

export interface QuarantineEntry {
  file: string
  name: string | null
  reason: string
  since: string
  updatedAt?: string
  lastVerifiedAt?: string
  lastFailureRate?: number
  issue?: string
}

export interface QuarantineDocument {
  version: 1
  quarantined: QuarantineEntry[]
}

export interface QuarantineAddOptions {
  issue?: string
  lastFailureRate?: number
  lastVerifiedAt?: string
}

export interface StoreOptions {
  workspace?: string
}

export type HistoryScope = 'workspace' | 'all'

export interface Store {
  appendHistory(entry: HistoryEntry): Promise<void>
  listHistory(target: string | undefined, limit: number, scope?: HistoryScope): Promise<HistoryEntry[]>
  loadQuarantine(): Promise<QuarantineDocument>
  addQuarantine(
    refs: ParsedRef[],
    reason: string,
    options?: QuarantineAddOptions,
  ): Promise<{ added: QuarantineEntry[]; updated: QuarantineEntry[]; file: string }>
  removeQuarantine(refs: ParsedRef[]): Promise<{ removed: QuarantineEntry[]; file: string }>
  quarantinePath: string
  historyPath?: string
  workspace?: string
}

export interface ParsedRef {
  file: string
  name: string | null
}

export interface AnnotatableTest {
  file: string
  name: string
  verdict: string
  failureRate?: number
}

export interface QuarantineAnnotation<T extends AnnotatableTest = AnnotatableTest> {
  newFlaky: T[]
  alreadyQuarantinedFlaky: T[]
  clearCandidates: QuarantineEntry[]
}

export interface TopFlakyTest {
  file: string
  name: string
  occurrences: number
  avgFailureRate: number
  maxFailureRate: number
  lastSeen: string
  quarantined: boolean
}

export interface StaleQuarantineEntry extends QuarantineEntry {
  ageDays: number
}

export interface StabilitySummary {
  topFlakyTests: TopFlakyTest[]
  staleQuarantined: StaleQuarantineEntry[]
}

export interface SummarizeStabilityOptions {
  staleDays?: number
  topN?: number
  now?: Date
}

const HISTORY_FILE = 'history.json'
const WORKSPACES_DIR = 'workspaces'
const HISTORY_LIMIT = 200
const DAY_MS = 24 * 60 * 60 * 1000

function normalizeWorkspacePath(workspace: string): string {
  return path.resolve(workspace)
}

function workspaceComparisonKey(normalizedWorkspace: string): string {
  return process.platform === 'win32' ? normalizedWorkspace.toLowerCase() : normalizedWorkspace
}

/** 计算工作区稳定哈希，用于按工作区分文件存储历史。 */
export function workspaceHash(workspace: string): string {
  const normalized = normalizeWorkspacePath(workspace)
  return createHash('sha256').update(workspaceComparisonKey(normalized)).digest('hex').slice(0, 16)
}

function isAbsoluteAnyPlatform(filePath: string): boolean {
  return path.isAbsolute(filePath) || /^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\')
}

function posixClean(filePath: string): string {
  const slashed = filePath.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  if (slashed === '') return ''
  if (isAbsoluteAnyPlatform(slashed)) return slashed.replace(/\/+$/, '')
  const normalized = path.posix.normalize(slashed)
  return normalized.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '')
}

/**
 * 规范化隔离清单中的文件路径为 POSIX 相对路径；
 * 拒绝工作区外的绝对路径与越界相对路径，避免把本机路径污染进 .flakefinder.json。
 */
export function normalizeQuarantinePath(rawFile: string, workspace?: string): string {
  const trimmed = rawFile.trim()
  if (trimmed === '') {
    throw new Error('测试引用缺少文件路径。')
  }

  if (isAbsoluteAnyPlatform(trimmed)) {
    if (workspace === undefined) {
      throw new Error('隔离清单只接受相对工作区的测试路径，不能写入绝对路径：' + rawFile)
    }
    if (!path.isAbsolute(trimmed)) {
      throw new Error('测试文件路径位于当前工作区之外，不能写入隔离清单：' + rawFile)
    }
    const absWorkspace = normalizeWorkspacePath(workspace)
    const absFile = path.resolve(trimmed)
    const rel = path.relative(absWorkspace, absFile)
    if (
      rel === ''
      || rel === '.'
      || rel === '..'
      || rel.startsWith('..' + path.sep)
      || rel.startsWith('../')
      || isAbsoluteAnyPlatform(rel)
    ) {
      throw new Error('测试文件路径位于当前工作区之外，不能写入隔离清单：' + rawFile)
    }
    const cleanRel = posixClean(rel)
    if (cleanRel === '' || cleanRel === '.') {
      throw new Error('测试文件路径无效，不能指向工作区根目录：' + rawFile)
    }
    return cleanRel
  }

  const clean = posixClean(trimmed)
  if (clean === '' || clean === '.') {
    throw new Error('测试文件路径无效：' + rawFile)
  }
  if (clean === '..' || clean.startsWith('../')) {
    throw new Error('测试文件路径不能越出当前工作区：' + rawFile)
  }
  return clean
}

function normalizeForMatch(rawFile: string, workspace?: string): string {
  const trimmed = rawFile.trim()
  if (trimmed === '') return ''
  if (isAbsoluteAnyPlatform(trimmed) && workspace !== undefined) {
    try {
      return normalizeQuarantinePath(trimmed, workspace)
    } catch {
      return posixClean(trimmed)
    }
  }
  return posixClean(trimmed)
}

function exactRef(item: { file: string; name: string | null }, ref: ParsedRef, workspace?: string): boolean {
  return normalizeForMatch(item.file, workspace) === normalizeForMatch(ref.file, workspace)
    && item.name === ref.name
}

function matchesRef(item: { file: string; name: string | null }, ref: ParsedRef, workspace?: string): boolean {
  if (normalizeForMatch(item.file, workspace) !== normalizeForMatch(ref.file, workspace)) return false
  if (ref.name === null) return true
  return item.name === ref.name
}

function sameWorkspace(entryWorkspace: string | undefined, normalizedWorkspace: string): boolean {
  if (entryWorkspace === undefined || entryWorkspace.trim() === '') return false
  return workspaceComparisonKey(normalizeWorkspacePath(entryWorkspace)) === workspaceComparisonKey(normalizedWorkspace)
}

function historyDedupKey(entry: HistoryEntry): string {
  return [
    entry.timestamp,
    entry.workspace ?? '',
    entry.target,
    entry.framework,
    String(entry.runs),
    entry.verdict,
    String(entry.durationMs),
    String(entry.flakyCount),
  ].join('\0')
}

function compareTimestampDesc(a: HistoryEntry, b: HistoryEntry): number {
  const ta = Date.parse(a.timestamp)
  const tb = Date.parse(b.timestamp)
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta
  return b.timestamp.localeCompare(a.timestamp)
}

function mergeHistorySources(sources: HistoryEntry[][]): HistoryEntry[] {
  const seenPrevFiles = new Set<string>()
  const merged: HistoryEntry[] = []
  for (const list of sources) {
    const fileKeys: string[] = []
    for (const entry of list) {
      const key = historyDedupKey(entry)
      if (seenPrevFiles.has(key)) continue
      merged.push(entry)
      fileKeys.push(key)
    }
    for (const key of fileKeys) seenPrevFiles.add(key)
  }
  merged.sort(compareTimestampDesc)
  return merged
}

function isValidQuarantineEntry(entry: unknown): entry is QuarantineEntry {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  if (typeof e.file !== 'string' || !e.file) return false
  if (e.name !== null && typeof e.name !== 'string') return false
  if (typeof e.reason !== 'string') return false
  if (typeof e.since !== 'string') return false
  if (e.updatedAt !== undefined && typeof e.updatedAt !== 'string') return false
  if (e.lastVerifiedAt !== undefined && typeof e.lastVerifiedAt !== 'string') return false
  if (e.lastFailureRate !== undefined && (typeof e.lastFailureRate !== 'number' || !Number.isFinite(e.lastFailureRate))) return false
  if (e.issue !== undefined && typeof e.issue !== 'string') return false
  return true
}

export function createStore(dataDir: string, quarantineFile: string, options?: StoreOptions): Store {
  const normalizedWorkspace = options?.workspace !== undefined && options.workspace.trim() !== ''
    ? normalizeWorkspacePath(options.workspace)
    : undefined
  const legacyHistoryPath = path.join(dataDir, HISTORY_FILE)
  const workspacesDir = path.join(dataDir, WORKSPACES_DIR)
  const historyPath = normalizedWorkspace !== undefined
    ? path.join(workspacesDir, workspaceHash(normalizedWorkspace) + '.json')
    : legacyHistoryPath

  async function readJson(file: string): Promise<unknown> {
    try {
      const info = await fs.lstat(file)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024) throw new Error('文件不是普通 JSON 文件或超过 8 MiB')
      return JSON.parse(await fs.readFile(file, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw new Error('记录无法读取，原文件已保留：' + file + '。' + (error instanceof Error ? error.message : String(error)))
    }
  }

  async function locked<T>(file: string, update: () => Promise<T>): Promise<T> {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const unlock = await lockfile.lock(file, { realpath: false, retries: { retries: 30, minTimeout: 25, maxTimeout: 100 } })
    try { return await update() } finally { await unlock() }
  }

  async function atomicWrite(file: string, value: unknown): Promise<void> {
    const bytes = JSON.stringify(value, null, 2) + '\n'
    if (Buffer.byteLength(bytes) > 8 * 1024 * 1024) throw new Error('记录超过 8 MiB，本次没有保存。')
    const temp = file + '.tmp-' + randomUUID()
    try { await fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o600 }); await fs.rename(temp, file) }
    finally { await fs.unlink(temp).catch(() => {}) }
  }

  async function readHistoryFile(file: string): Promise<HistoryEntry[]> {
    const parsed = await readJson(file)
    if (parsed === undefined) return []
    if (
      !Array.isArray(parsed)
      || parsed.some(entry => !entry || typeof entry.target !== 'string' || typeof entry.timestamp !== 'string' || !Array.isArray(entry.flakyTests))
    ) {
      throw new Error('历史记录格式无效，原文件已保留：' + file)
    }
    return parsed as HistoryEntry[]
  }

  async function readAllWorkspaceFiles(): Promise<HistoryEntry[][]> {
    let entries
    try {
      entries = await fs.readdir(workspacesDir, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const jsonFiles = entries
      .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
      .map(dirent => path.join(workspacesDir, dirent.name))
      .sort()
    const results: HistoryEntry[][] = []
    for (const file of jsonFiles) {
      results.push(await readHistoryFile(file))
    }
    return results
  }

  async function appendHistory(entry: HistoryEntry): Promise<void> {
    await fs.mkdir(path.dirname(historyPath), { recursive: true })
    return locked(historyPath, async () => {
      const list = await readHistoryFile(historyPath)
      const record: HistoryEntry = normalizedWorkspace !== undefined
        ? { ...entry, workspace: normalizedWorkspace }
        : entry
      list.unshift(record)
      const trimmed = list.slice(0, HISTORY_LIMIT)
      await atomicWrite(historyPath, trimmed)
    })
  }

  async function listHistory(
    target: string | undefined,
    limit: number,
    scope: HistoryScope = 'workspace',
  ): Promise<HistoryEntry[]> {
    let list: HistoryEntry[]
    if (scope === 'all') {
      const wsSources = await readAllWorkspaceFiles()
      const legacy = await readHistoryFile(legacyHistoryPath)
      list = mergeHistorySources([...wsSources, legacy])
    } else if (normalizedWorkspace !== undefined) {
      const wsEntries = await readHistoryFile(historyPath)
      const legacy = await readHistoryFile(legacyHistoryPath)
      const matchingLegacy = legacy.filter(entry => sameWorkspace(entry.workspace, normalizedWorkspace))
      list = matchingLegacy.length > 0
        ? mergeHistorySources([wsEntries, matchingLegacy])
        : wsEntries
    } else {
      list = await readHistoryFile(historyPath)
    }

    const filtered = target === undefined
      ? list
      : (() => {
          const normTarget = target.replace(/\\/g, '/')
          return list.filter(entry =>
            entry.target === target
            || entry.target.includes(target)
            || entry.target.replace(/\\/g, '/').includes(normTarget),
          )
        })()
    return filtered.slice(0, limit)
  }

  async function readQuarantine(): Promise<QuarantineDocument> {
    const parsed = await readJson(quarantineFile)
    if (parsed === undefined) return { version: 1, quarantined: [] }
    const obj = parsed as QuarantineDocument
    if (!obj || obj.version !== 1 || !Array.isArray(obj.quarantined) || obj.quarantined.some(entry => !isValidQuarantineEntry(entry))) {
      throw new Error('隔离清单格式无效，原文件已保留：' + quarantineFile)
    }
    return obj
  }

  async function writeQuarantine(doc: QuarantineDocument): Promise<void> {
    await fs.mkdir(path.dirname(quarantineFile), { recursive: true })
    await atomicWrite(quarantineFile, doc)
  }

  async function addQuarantine(
    refs: ParsedRef[],
    reason: string,
    addOptions?: QuarantineAddOptions,
  ): Promise<{ added: QuarantineEntry[]; updated: QuarantineEntry[]; file: string }> {
    const normalizedRefs: ParsedRef[] = refs.map(ref => ({
      file: normalizeQuarantinePath(ref.file, normalizedWorkspace),
      name: ref.name,
    }))

    return locked(quarantineFile, async () => {
      const doc = await readQuarantine()
      const now = new Date().toISOString()
      const added: QuarantineEntry[] = []
      const updated: QuarantineEntry[] = []
      const addedSet = new Set<QuarantineEntry>()
      const updatedSet = new Set<QuarantineEntry>()

      for (const ref of normalizedRefs) {
        const existing = doc.quarantined.find(item => exactRef(item, ref, normalizedWorkspace))
        if (existing !== undefined) {
          existing.file = ref.file
          existing.reason = reason
          if (!addedSet.has(existing)) {
            existing.updatedAt = now
            if (!updatedSet.has(existing)) {
              updated.push(existing)
              updatedSet.add(existing)
            }
          }
          if (addOptions?.issue !== undefined) existing.issue = addOptions.issue
          if (addOptions?.lastFailureRate !== undefined) existing.lastFailureRate = addOptions.lastFailureRate
          if (addOptions?.lastVerifiedAt !== undefined) existing.lastVerifiedAt = addOptions.lastVerifiedAt
          continue
        }

        const entry: QuarantineEntry = {
          file: ref.file,
          name: ref.name,
          reason,
          since: now,
        }
        if (addOptions?.issue !== undefined) entry.issue = addOptions.issue
        if (addOptions?.lastFailureRate !== undefined) entry.lastFailureRate = addOptions.lastFailureRate
        if (addOptions?.lastVerifiedAt !== undefined) entry.lastVerifiedAt = addOptions.lastVerifiedAt
        doc.quarantined.push(entry)
        added.push(entry)
        addedSet.add(entry)
      }

      doc.quarantined.sort((a, b) => a.file.localeCompare(b.file) || (a.name ?? '').localeCompare(b.name ?? ''))
      await writeQuarantine(doc)
      return { added, updated, file: quarantineFile }
    })
  }

  async function removeQuarantine(refs: ParsedRef[]): Promise<{ removed: QuarantineEntry[]; file: string }> {
    const normalizedRefs: ParsedRef[] = refs.map(ref => ({
      file: normalizeForMatch(ref.file, normalizedWorkspace),
      name: ref.name,
    }))

    return locked(quarantineFile, async () => {
      const doc = await readQuarantine()
      const removed: QuarantineEntry[] = []
      doc.quarantined = doc.quarantined.filter(item => {
        const hit = normalizedRefs.some(ref => matchesRef(item, ref, normalizedWorkspace))
        if (hit) removed.push(item)
        return !hit
      })
      await writeQuarantine(doc)
      return { removed, file: quarantineFile }
    })
  }

  const store: Store = {
    appendHistory,
    listHistory,
    loadQuarantine: readQuarantine,
    addQuarantine,
    removeQuarantine,
    quarantinePath: quarantineFile,
    historyPath,
  }
  if (normalizedWorkspace !== undefined) store.workspace = normalizedWorkspace
  return store
}

function matchesQuarantineEntry(test: { file: string; name: string }, entry: QuarantineEntry): boolean {
  if (posixClean(test.file) !== posixClean(entry.file)) return false
  return entry.name === null || entry.name === test.name
}

/**
 * 将本次检测结果中的用例与隔离清单交叉对照：
 * - newFlaky: 本次新发现（尚未隔离）的 flaky 用例
 * - alreadyQuarantinedFlaky: 已在隔离清单中且本次仍为 flaky 的用例
 * - clearCandidates: 隔离清单中在本次运行全部稳定通过（stable-pass）的候选清理条目
 */
export function annotateTestsWithQuarantine<T extends AnnotatableTest>(
  tests: readonly T[],
  quarantineDoc: QuarantineDocument,
): QuarantineAnnotation<T> {
  const newFlaky: T[] = []
  const alreadyQuarantinedFlaky: T[] = []
  const quarantined = quarantineDoc.quarantined

  for (const test of tests) {
    if (test.verdict !== 'flaky') continue
    if (quarantined.some(entry => matchesQuarantineEntry(test, entry))) {
      alreadyQuarantinedFlaky.push(test)
    } else {
      newFlaky.push(test)
    }
  }

  const hasRunLevelAnomaly = tests.some(
    test => (test.file === '(crash)' || test.file === '(timeout)') && test.verdict !== 'stable-pass',
  )
  const clearCandidates: QuarantineEntry[] = []
  if (!hasRunLevelAnomaly) {
    for (const entry of quarantined) {
      const matched = tests.filter(test => matchesQuarantineEntry(test, entry))
      if (matched.length > 0 && matched.every(test => test.verdict === 'stable-pass')) {
        clearCandidates.push(entry)
      }
    }
  }

  return { newFlaky, alreadyQuarantinedFlaky, clearCandidates }
}

/**
 * 汇总历史与隔离清单的稳定性概览：高频 flaky 榜单 + 超期未复查的陈旧隔离条目。
 */
export function summarizeStability(
  history: readonly HistoryEntry[],
  quarantineDoc: QuarantineDocument,
  options?: SummarizeStabilityOptions,
): StabilitySummary {
  const staleDays = options?.staleDays ?? 14
  const topN = Math.max(0, options?.topN ?? 5)
  const nowMs = (options?.now ?? new Date()).getTime()
  const quarantined = quarantineDoc.quarantined

  interface FlakyAgg {
    file: string
    name: string
    occurrences: number
    rateSum: number
    maxFailureRate: number
    lastSeen: string
  }

  const aggMap = new Map<string, FlakyAgg>()
  for (const entry of history) {
    for (const test of entry.flakyTests) {
      const file = posixClean(test.file) || test.file
      const key = file + '\0' + test.name
      const existing = aggMap.get(key)
      if (existing === undefined) {
        aggMap.set(key, {
          file,
          name: test.name,
          occurrences: 1,
          rateSum: test.failureRate,
          maxFailureRate: test.failureRate,
          lastSeen: entry.timestamp,
        })
      } else {
        existing.occurrences += 1
        existing.rateSum += test.failureRate
        if (test.failureRate > existing.maxFailureRate) existing.maxFailureRate = test.failureRate
        const prevMs = Date.parse(existing.lastSeen)
        const currMs = Date.parse(entry.timestamp)
        if ((Number.isFinite(currMs) && (!Number.isFinite(prevMs) || currMs > prevMs)) || (!Number.isFinite(currMs) && entry.timestamp > existing.lastSeen)) {
          existing.lastSeen = entry.timestamp
        }
      }
    }
  }

  const topFlakyTests: TopFlakyTest[] = [...aggMap.values()]
    .map(item => ({
      file: item.file,
      name: item.name,
      occurrences: item.occurrences,
      avgFailureRate: Math.round((item.rateSum / item.occurrences) * 10) / 10,
      maxFailureRate: Math.round(item.maxFailureRate * 10) / 10,
      lastSeen: item.lastSeen,
      quarantined: quarantined.some(q => matchesQuarantineEntry({ file: item.file, name: item.name }, q)),
    }))
    .sort((a, b) =>
      b.occurrences - a.occurrences
      || b.avgFailureRate - a.avgFailureRate
      || b.maxFailureRate - a.maxFailureRate
      || a.file.localeCompare(b.file)
      || a.name.localeCompare(b.name),
    )
    .slice(0, topN)

  const staleQuarantined: StaleQuarantineEntry[] = []
  for (const entry of quarantined) {
    const refIso = entry.lastVerifiedAt ?? entry.updatedAt ?? entry.since
    const refMs = Date.parse(refIso)
    if (!Number.isFinite(refMs)) continue
    const exactDays = (nowMs - refMs) / DAY_MS
    if (exactDays > staleDays) {
      staleQuarantined.push({
        ...entry,
        ageDays: Math.floor(exactDays),
      })
    }
  }
  staleQuarantined.sort((a, b) =>
    b.ageDays - a.ageDays
    || a.file.localeCompare(b.file)
    || (a.name ?? '').localeCompare(b.name ?? ''),
  )

  return { topFlakyTests, staleQuarantined }
}

/** 解析 "file.test.mjs" 或 "file.test.mjs > 用例名" 形式的引用。 */
export function parseRef(raw: string): ParsedRef {
  const trimmed = raw.trim()
  if (trimmed === '') throw new Error('测试引用不能为空。格式：文件路径，或 "文件路径 > 用例名"。')
  const index = trimmed.indexOf(' > ')
  if (index === -1) {
    const file = isAbsoluteAnyPlatform(trimmed) ? trimmed : (posixClean(trimmed) || trimmed)
    return { file, name: null }
  }
  const rawFile = trimmed.slice(0, index).trim()
  const name = trimmed.slice(index + 3).trim()
  if (rawFile === '') throw new Error('测试引用缺少文件路径：' + raw)
  const file = isAbsoluteAnyPlatform(rawFile) ? rawFile : (posixClean(rawFile) || rawFile)
  return { file, name: name === '' ? null : name }
}

/** 隔离清单条目的可读格式。 */
export function formatRef(entry: { file: string; name: string | null }): string {
  return entry.name === null ? entry.file : entry.file + ' > ' + entry.name
}
