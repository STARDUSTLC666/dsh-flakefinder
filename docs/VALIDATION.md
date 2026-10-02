# dsh-flakefinder 验证记录

本页整理原 README 的历史验证说明，保留当时的版本、日期与范围。自动测试、启动检查、浏览器操作和真实服务验收分别记录，不能相互替代。更详细的版本验收文件仍保留在仓库中。

## 原中文记录

验证宿主：官方源码构建的 Harness `0.2.0-rc.1`（commit `407e65c8`）+ Node `24.16.0`（2026-09-28）。44 项插件测试在隔离环境全部通过；同一个宿主里 18 个插件共同加载，注册 6 个工具，工具 schema 与健康检查契约通过。本轮未启用真实端口与外部服务。

2026-09-13 修复：保留宿主 `subprocess.spawn` 的服务对象，避免方法独立传递后因 `this` 丢失而报错。该路径已在隔离宿主进程服务中实测通过。`flaky_detect` 已通过真实宿主进程服务连续运行三轮 Node 测试，正确返回 `stable-pass`。

## Original English record

Validation host: Harness `0.2.0-rc.1` built from official sources (commit `407e65c8`) with Node `24.16.0` on 2026-09-28. All 44 plugin tests pass in an isolated environment; all 18 plugins mount together in one host registering 6 tools, with tool schemas and health-check contracts passing. No live ports or external services were exercised in this round.

2026-09-13 fix: retain the service receiver when calling `subprocess.spawn`, preventing failures caused by passing the method as an unbound callback. Verified against a real isolated host subprocess service. `flaky_detect` runs three real Node test processes through the host subprocess service and returns `stable-pass`.
