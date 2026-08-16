import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig, resolveRuns, assertTarget, requiredString, optionalString } from '../lib/config.js'

test('默认配置落在 DSH_HOME 下', () => {
  const cfg = resolveConfig(null, 'C:\\work')
  assert.equal(cfg.defaultRuns, 5)
  assert.equal(cfg.maxRuns, 20)
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
