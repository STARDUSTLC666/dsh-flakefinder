import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  buildPlan,
  detectEnvironment,
  detectFramework,
  listAdapters,
  readFramework,
  resolvePythonPath,
  resolvePythonPathInfo,
} from '../lib/adapters.js'
import { resolveConfig } from '../lib/config.js'

async function mkFile(filePath, content = '') {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

test('readFramework 支持标准名称与别名 node:test / py', () => {
  assert.equal(readFramework(undefined), 'auto')
  assert.equal(readFramework('vitest'), 'vitest')
  assert.equal(readFramework('jest'), 'jest')
  assert.equal(readFramework('pytest'), 'pytest')
  assert.equal(readFramework('node'), 'node')
  assert.equal(readFramework('node:test'), 'node')
  assert.equal(readFramework('py'), 'pytest')
  assert.throws(() => readFramework('mocha'), /framework/)
})

test('适配器注册表按优先级排序', () => {
  assert.deepEqual(listAdapters().map(a => a.id), ['vitest', 'jest', 'pytest', 'node'])
})

test('monorepo 子目录向上查找 hoisted node_modules 中的 vitest 与 jest', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-mono-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const pkgDir = path.join(root, 'packages', 'web')
  await fs.mkdir(pkgDir, { recursive: true })
  const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs')
  const jestEntry = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js')
  await mkFile(vitestEntry, '// stub')
  await mkFile(jestEntry, '// stub')

  assert.equal(detectFramework(pkgDir, 'auto'), 'vitest')
  const vPlan = buildPlan(pkgDir, 'src\\utils\\a.test.ts', 'vitest', 1)
  assert.equal(vPlan.framework, 'vitest')
  assert.equal(vPlan.argv[1], vitestEntry)
  assert.ok(vPlan.argv.includes('src/utils/a.test.ts'), 'Windows 反斜杠应转为 POSIX /')
  assert.ok(vPlan.argv.includes('--coverage.enabled=false'))

  const jPlan = buildPlan(pkgDir, 'src\\utils\\a.test.ts', 'jest', 1)
  assert.equal(jPlan.framework, 'jest')
  assert.equal(jPlan.argv[1], jestEntry)
  assert.ok(jPlan.argv.includes('src/utils/a.test.ts'))
  assert.ok(jPlan.argv.includes('--runInBand'))
  assert.ok(jPlan.argv.includes('--coverage=false'))
})

test('workspace .venv / venv 自动探测遵循显式配置 > VIRTUAL_ENV > .venv > venv > 默认优先级', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-venv-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const subDir = path.join(root, 'services', 'api')
  await fs.mkdir(subDir, { recursive: true })

  const venvSubPath = process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']
  const dotVenvPy = path.join(root, '.venv', ...venvSubPath)
  const plainVenvPy = path.join(root, 'venv', ...venvSubPath)
  const activeVenvRoot = path.join(root, 'active-venv')
  const activeVenvPy = path.join(activeVenvRoot, ...venvSubPath)

  // 1. 仅有 venv 时向上探测到 venv
  await mkFile(plainVenvPy)
  const r1 = resolvePythonPathInfo(subDir, { pythonPath: 'python3', pythonPathExplicit: false }, { env: {} })
  assert.equal(r1.pythonPath, plainVenvPy)
  assert.equal(r1.source, 'workspace-venv')

  // 2. 同时存在 .venv 与 venv 时优先 .venv
  await mkFile(dotVenvPy)
  const r2 = resolvePythonPathInfo(subDir, { pythonPath: 'python3', pythonPathExplicit: false }, { env: {} })
  assert.equal(r2.pythonPath, dotVenvPy)
  assert.equal(r2.source, 'workspace-venv')

  // 3. 存在 VIRTUAL_ENV 时优先于 workspace .venv
  await mkFile(activeVenvPy)
  const r3 = resolvePythonPathInfo(subDir, { pythonPath: 'python3', pythonPathExplicit: false }, { env: { VIRTUAL_ENV: activeVenvRoot } })
  assert.equal(r3.pythonPath, activeVenvPy)
  assert.equal(r3.source, 'virtual-env')

  // 4. 用户显式配置 pythonPath 时优先于 VIRTUAL_ENV 与 .venv
  const r4 = resolvePythonPathInfo(subDir, { pythonPath: '/custom/python', pythonPathExplicit: true }, { env: { VIRTUAL_ENV: activeVenvRoot } })
  assert.equal(r4.pythonPath, '/custom/python')
  assert.equal(r4.source, 'explicit')

  // 5. buildPlan 在 pythonPathExplicit=false 时自动采用工作区 .venv
  const prevVenv = process.env.VIRTUAL_ENV
  const prevPy = process.env.DSH_FLAKEFINDER_PYTHON
  delete process.env.VIRTUAL_ENV
  delete process.env.DSH_FLAKEFINDER_PYTHON
  try {
    const plan = buildPlan(subDir, 'tests/test_api.py', 'pytest', 1, 'python3', { pythonPathExplicit: false })
    assert.equal(plan.argv[0], dotVenvPy)

    // 6. buildPlan 省略 pythonPath 与 options 时，应优先尊重 DSH_FLAKEFINDER_PYTHON
    process.env.DSH_FLAKEFINDER_PYTHON = '/env/custom-python'
    const envPlan = buildPlan(subDir, 'tests/test_api.py', 'pytest', 1)
    assert.equal(envPlan.argv[0], '/env/custom-python')
  } finally {
    if (prevVenv === undefined) delete process.env.VIRTUAL_ENV
    else process.env.VIRTUAL_ENV = prevVenv
    if (prevPy === undefined) delete process.env.DSH_FLAKEFINDER_PYTHON
    else process.env.DSH_FLAKEFINDER_PYTHON = prevPy
  }
})

test('resolvePythonPath 无虚拟环境时按平台回退', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-novenv-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  assert.equal(resolvePythonPath(dir, undefined, { env: {}, platform: 'win32' }), 'python')
  assert.equal(resolvePythonPath(dir, undefined, { env: {}, platform: 'linux' }), 'python3')
})

test('buildPlan 支持 testName、noCoverage、shuffle+seed 与 Jest --runInBand 策略', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-opts-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  await mkFile(path.join(dir, 'node_modules', 'vitest', 'vitest.mjs'))
  await mkFile(path.join(dir, 'node_modules', 'jest', 'bin', 'jest.js'))

  // Vitest: testName + noCoverage=false + shuffle + explicit seed
  const vp = buildPlan(dir, 'a.test.ts', 'vitest', 1, undefined, {
    testName: 'handles retry',
    noCoverage: false,
    shuffle: true,
    seed: 12345,
  })
  assert.equal(vp.seed, 12345)
  assert.ok(!vp.argv.includes('--coverage.enabled=false'))
  assert.ok(vp.argv.includes('--sequence.shuffle'))
  assert.ok(vp.argv.includes('--sequence.seed=12345'))
  assert.deepEqual(vp.argv.slice(-2), ['-t', 'handles retry'])

  // Vitest: shuffle=true without seed generates valid random seed
  const vpRand = buildPlan(dir, 'a.test.ts', 'vitest', 2, undefined, { shuffle: true })
  assert.equal(typeof vpRand.seed, 'number')
  assert.ok(vpRand.seed >= 1 && vpRand.seed <= 2147483647)
  assert.ok(vpRand.argv.includes('--sequence.seed=' + String(vpRand.seed)))

  // Jest: shuffle skips --runInBand and adds --randomize --seed=<n>
  const jpShuffle = buildPlan(dir, 'a.test.ts', 'jest', 1, undefined, {
    testName: 'auth flow',
    shuffle: true,
    seed: 99,
  })
  assert.equal(jpShuffle.seed, 99)
  assert.ok(!jpShuffle.argv.includes('--runInBand'))
  assert.ok(jpShuffle.argv.includes('--randomize'))
  assert.ok(jpShuffle.argv.includes('--seed=99'))
  assert.ok(jpShuffle.argv.includes('--coverage=false'))
  const tIdx = jpShuffle.argv.indexOf('-t')
  assert.equal(jpShuffle.argv[tIdx + 1], 'auth flow')

  // Jest: concurrency > 1 skips --runInBand
  const jpConc = buildPlan(dir, 'a.test.ts', 'jest', 1, undefined, { concurrency: 2 })
  assert.ok(!jpConc.argv.includes('--runInBand'))

  // pytest: -k filter
  const pp = buildPlan(dir, 'tests/test_a.py', 'pytest', 1, 'python3', { testName: 'test_retry' })
  assert.deepEqual(pp.argv.slice(-2), ['-k', 'test_retry'])

  // node:test: --test-name-pattern
  const np = buildPlan(dir, 'test/a.test.mjs', 'node', 1, undefined, { testName: 'works' })
  assert.ok(np.argv.includes('--test-name-pattern=works'))

  // Reject unsafe testName
  assert.throws(() => buildPlan(dir, 'test/a.test.mjs', 'node', 1, undefined, { testName: '   ' }), /testName/)
  assert.throws(() => buildPlan(dir, 'test/a.test.mjs', 'node', 1, undefined, { testName: '--eval' }), /不能以 - 开头/)
})

test('detectEnvironment 汇总可用框架与 Python 来源', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flake-env-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const jestEntry = path.join(dir, 'node_modules', 'jest', 'bin', 'jest.js')
  const pytestIni = path.join(dir, 'pytest.ini')
  await mkFile(jestEntry)
  await mkFile(pytestIni, '[pytest]\n')

  const cfg = resolveConfig({ pythonPath: '/usr/bin/python3' }, dir)
  const env = detectEnvironment(dir, cfg)
  assert.equal(env.defaultFramework, 'jest')
  assert.equal(env.vitest.available, false)
  assert.equal(env.jest.available, true)
  assert.equal(env.jest.entryPath, jestEntry)
  assert.equal(env.pytest.configFound, true)
  assert.equal(env.pytest.configPath, pytestIni)
  assert.equal(env.pytest.pythonPath, '/usr/bin/python3')
  assert.equal(env.pytest.pythonSource, 'explicit')
  assert.equal(env.nodeVersion, process.version)
})
