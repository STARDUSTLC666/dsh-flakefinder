/**
 * 测试框架探测与 argv 构建（向后兼容门面，具体实现已拆入 adapters.ts）。
 *
 * @module dsh-flakefinder/args
 */
export { buildPlan, detectEnvironment, detectFramework, findLocalModuleEntry, findPytestConfig, getAdapter, listAdapters, readFramework, registerAdapter, resolvePythonPath, resolvePythonPathInfo, } from './adapters.js';
