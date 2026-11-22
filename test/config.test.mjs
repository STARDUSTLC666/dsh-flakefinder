import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveConfig,
  resolveRuns,
  resolveConcurrency,
  readDetectMode,
  assertTarget,
  requiredString,
  optionalString,
  optionalBoolean,
  optionalSeed,
  normalizeRelPath,
} from '../lib/config.js'

test('默认配置落在 DSH_HOME 下', () => {
  const cfg = resolveConfig(null, 'C:\\work')
  assert.equal(cfg.defaultRuns, 5)
  assert.equal(cfg.maxRuns, 20)
  assert.equal(cfg.defaultConcurrency, 1)
  assert.equal(cfg.noCoverage, true)
  assert.equal(cfg.staleQuarantineDays, 14)
  assert.equal(cfg.writeApproval, true)
  assert.equal(cfg.quarantineFile.replace(/\\/g, '/'), 'C:/work/.flakefinder.json')
  assert.match(cfg.dataDir.replace(/\\/g, '/'), /dsh-flakefinder$/)
})

test('非法 timeoutMs 抛中文错误', () => {
  assert.throws(() => resolveConfig({ timeoutMs: -1 }, process.cwd()), /timeoutMs/)
})

test('defaultRuns 超过 maxRuns 时收窄', () => {
  const cfg = resolveConfig({ defaultRuns: 20, maxRuns: 5 }, process.cwd())
  assert.equal(cfg.defaultRuns, 5)
})

test('resolveRuns 钳制与报错', () => {
  const cfg = resolveConfig({ maxRuns: 10 }, process.cwd())
  assert.equal(resolveRuns(undefined, cfg), 5)
  assert.equal(resolveRuns(8, cfg), 8)
  assert.throws(() => resolveRuns(2, cfg), /runs/)
  assert.throws(() => resolveRuns(11, cfg), /runs/)
  assert.throws(() => resolveRuns('5', cfg), /runs/)
})

test('target 拒绝空与选项开头', () => {
  assert.equal(assertTarget(' test/a.test.mjs '), 'test/a.test.mjs')
  assert.throws(() => assertTarget('  '), /target/)
  assert.throws(() => assertTarget('--config x'), /不能以 - 开头/)
})

test('字符串参数助手', () => {
  assert.equal(optionalString({ a: ' x ' }, 'a'), 'x')
  assert.equal(optionalString({}, 'a'), undefined)
  assert.equal(requiredString({ a: 'y' }, 'a', '字段'), 'y')
  assert.throws(() => requiredString({}, 'a', '字段'), /字段/)
})

test('新增配置项 defaultConcurrency / noCoverage / staleQuarantineDays / pythonPathExplicit', () => {
  const prev = process.env.DSH_FLAKEFINDER_PYTHON
  delete process.env.DSH_FLAKEFINDER_PYTHON
  try {
    const def = resolveConfig({}, process.cwd())
    assert.equal(def.defaultConcurrency, 1)
    assert.equal(def.noCoverage, true)
    assert.equal(def.staleQuarantineDays, 14)
    assert.equal(def.pythonPathExplicit, false)

    const custom = resolveConfig({
      defaultConcurrency: 3,
      noCoverage: false,
      staleQuarantineDays: 30,
      pythonPath: '/opt/py312',
    }, process.cwd())
    assert.equal(custom.defaultConcurrency, 3)
    assert.equal(custom.noCoverage, false)
    assert.equal(custom.staleQuarantineDays, 30)
    assert.equal(custom.pythonPath, '/opt/py312')
    assert.equal(custom.pythonPathExplicit, true)

    process.env.DSH_FLAKEFINDER_PYTHON = '/env/python'
    const fromEnv = resolveConfig({}, process.cwd())
    assert.equal(fromEnv.pythonPath, '/env/python')
    assert.equal(fromEnv.pythonPathExplicit, true)

    assert.throws(() => resolveConfig({ defaultConcurrency: 0 }, process.cwd()), /defaultConcurrency/)
    assert.throws(() => resolveConfig({ defaultConcurrency: 5 }, process.cwd()), /defaultConcurrency/)
    assert.throws(() => resolveConfig({ staleQuarantineDays: 0 }, process.cwd()), /staleQuarantineDays/)
    assert.throws(() => resolveConfig({ staleQuarantineDays: 366 }, process.cwd()), /staleQuarantineDays/)
  } finally {
    if (prev === undefined) delete process.env.DSH_FLAKEFINDER_PYTHON
    else process.env.DSH_FLAKEFINDER_PYTHON = prev
  }
})

test('resolveConcurrency / readDetectMode / optionalBoolean / optionalSeed', () => {
  const cfg = resolveConfig({ defaultConcurrency: 2 }, process.cwd())
  assert.equal(resolveConcurrency(undefined, cfg), 2)
  assert.equal(resolveConcurrency(4, cfg), 4)
  assert.throws(() => resolveConcurrency(0, cfg), /concurrency/)
  assert.throws(() => resolveConcurrency(5, cfg), /concurrency/)
  assert.throws(() => resolveConcurrency('2', cfg), /concurrency/)

  assert.equal(readDetectMode(undefined), 'full')
  assert.equal(readDetectMode('full'), 'full')
  assert.equal(readDetectMode('until-flaky'), 'until-flaky')
  assert.equal(readDetectMode('verify-fix'), 'verify-fix')
  assert.throws(() => readDetectMode('fast'), /mode/)

  assert.equal(optionalBoolean({}, 'shuffle', false), false)
  assert.equal(optionalBoolean({ shuffle: true }, 'shuffle', false), true)
  assert.equal(optionalBoolean({ noCoverage: false }, 'noCoverage', true), false)
  assert.throws(() => optionalBoolean({ shuffle: 'yes' }, 'shuffle', false), /shuffle/)

  assert.equal(optionalSeed({}, 'seed'), undefined)
  assert.equal(optionalSeed({ seed: 0 }, 'seed'), 0)
  assert.equal(optionalSeed({ seed: 42 }, 'seed'), 42)
  assert.equal(optionalSeed({ seed: 2147483647 }, 'seed'), 2147483647)
  assert.throws(() => optionalSeed({ seed: -1 }, 'seed'), /seed/)
  assert.throws(() => optionalSeed({ seed: 1.5 }, 'seed'), /seed/)
  assert.throws(() => optionalSeed({ seed: 2147483648 }, 'seed'), /seed/)
  assert.throws(() => optionalSeed({ seed: '42' }, 'seed'), /seed/)
})

test('normalizeRelPath 规范化相对与绝对路径为 POSIX 格式', () => {
  assert.equal(normalizeRelPath('.\\src\\a.test.ts'), 'src/a.test.ts')
  assert.equal(normalizeRelPath('././test/sub/b.test.mjs'), 'test/sub/b.test.mjs')
  assert.equal(normalizeRelPath('C:\\repo\\src\\a.test.ts', 'C:\\repo'), 'src/a.test.ts')
  assert.equal(normalizeRelPath('c:/Repo/src/a.test.ts', 'C:\\repo'), 'src/a.test.ts')
  assert.equal(normalizeRelPath('C:\\other\\src\\a.test.ts', 'C:\\repo'), 'C:/other/src/a.test.ts')
  assert.equal(normalizeRelPath('/repo/src/a.test.ts', '/repo'), 'src/a.test.ts')
  assert.equal(normalizeRelPath('/other/a.test.ts', '/repo'), '/other/a.test.ts')
  assert.equal(normalizeRelPath('C:/repo/src/a.test.ts'), 'C:/repo/src/a.test.ts')
})
