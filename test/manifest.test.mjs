import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

test('npm 名称与 bundle manifest', () => {
  assert.equal(pkg.name, 'dsh-flakefinder')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.exports['./cordis.patch.yml'], './cordis.patch.yml')
})

test('files 白名单包含 lib 与 patch', () => {
  assert.ok(pkg.files.includes('lib'))
  assert.ok(pkg.files.includes('cordis.patch.yml'))
})

test('cordis.patch.yml 插入 flakefinder 行并记录新配置注释', () => {
  const text = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(text, /name: 'dsh-flakefinder'/)
  assert.match(text, /writeApproval/)
  assert.match(text, /defaultConcurrency/)
  assert.match(text, /noCoverage/)
  assert.match(text, /staleQuarantineDays/)
})

test('lib 已构建且导出六个工具入口与 adapters', async () => {
  assert.ok(fs.existsSync(path.join(root, 'lib/index.js')))
  assert.ok(fs.existsSync(path.join(root, 'lib/tools.js')))
  assert.ok(fs.existsSync(path.join(root, 'lib/adapters.js')))
  assert.equal(pkg.dsh.manifestVersion, 1)
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  assert.ok(fs.existsSync(path.join(root, 'locale/zh.json')))
  assert.ok(fs.existsSync(path.join(root, 'locale/en.json')))
  const { apply } = await import('../lib/index.js')
  const active = new Set()
  const effects = []
  apply({
    subprocess: { spawn() { throw new Error('unused') } },
    tools: { register(def) { active.add(def.name); return () => active.delete(def.name) } },
    effect(fn) { effects.push(fn()) },
  }, {})
  assert.equal(active.size, 6)
  for (const dispose of effects) dispose?.()
  assert.equal(active.size, 0)
})
