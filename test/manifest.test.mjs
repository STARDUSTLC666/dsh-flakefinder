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

test('cordis.patch.yml 插入 flakefinder 行', () => {
  const text = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(text, /name: 'dsh-flakefinder'/)
  assert.match(text, /writeApproval/)
})

test('lib 已构建且导出五个工具入口', () => {
  assert.ok(fs.existsSync(path.join(root, 'lib/index.js')))
  assert.ok(fs.existsSync(path.join(root, 'lib/tools.js')))
})
