**简体中文** · [English](README.en.md)

# FlakeFinder

> **把“本地能过、CI 偶发飘红”的测试，变成可量化、可追踪、可根治的证据。**

DeepSeek Harness（`>=0.2.2-rc.3`）偶发测试诊断插件：支持 Vitest、Jest、pytest 与 `node:test` 多轮复跑、根因模式画像与受宿主审批保护的隔离清单管理。

[![npm](https://img.shields.io/npm/v/dsh-flakefinder)](https://www.npmjs.com/package/dsh-flakefinder) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-total-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder)

**[核心能力](#核心能力) · [安装](#安装) · [快速上手](#开始使用) · [完整说明](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.zh.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-light.svg" alt="把偶发失败变成有记录、能继续排查的线索。 · 流程示意" width="100%">
</picture>

## 核心能力

| 模块 | 核心特性 |
| :--- | :--- |
| **多框架自动适配** | 原生支持 Vitest、Jest、pytest 与 `node:test`，自动向上解析 Monorepo 框架并探测工作区 `.venv` |
| **弹性复跑控制** | 支持用例名过滤（`testName`）、早停模式（`until-flaky` / `verify-fix`）、1–4 路并发与可复现随机乱序（`shuffle`/`seed`） |
| **根因诊断画像** | 自动聚类报错并脱敏堆栈，输出通过/失败时间线、6 类根因模式（冷启动/状态泄漏/超时竞态/顺序依赖/清理崩溃等）与 95% 置信度 |
| **工作区隔离与清单** | 按工作区独立留存历史，交叉对照 `.flakefinder.json` 隔离清单，输出高频 Top 榜与超期未复查提醒，写入经宿主审批弹窗确认 |

## 安装

在 DSH 桌面版「插件」面板安装 `dsh-flakefinder`，或使用命令行：

```bash
dsh plugin --profile desktop add dsh-flakefinder
```

网页版将 `desktop` 改为 `web`，安装后重启 DSH。宿主要求：`>=0.2.2-rc.3`。

## 开始使用

1. **锁定怀疑对象**：在项目会话中指定偶发失败的测试文件或用例名。
2. **多轮复跑抓现场**：让助手连续跑 10–20 轮，自动统计失败率并留存报错聚类与时序差异。
3. **定位根因或临时隔离**：依据根因画像修复竞态/状态污染；需临时止血时经审批写入 `.flakefinder.json` 跟踪。
4. **同口径复测消单**：修完后按相同轮次复跑验证全绿，并移出隔离清单。

### 常用对话示例

- **复现偶发红单**：`test/checkout.spec.ts 在 CI 偶尔超时失败，帮我单独连续跑 15 轮统计失败率，并对比失败轮的报错差异。`
- **稳定性摸底**：`查看当前仓库的历史偶发失败记录和隔离清单，汇总最不稳定的前三个用例。`
- **修完回归消单**：`我已修复异步定时器未清理问题，用同样参数连跑 20 轮确认稳定通过，通过后移出隔离清单。`

## 开始前要知道

- 复跑会真实执行项目测试命令；多轮未复现并不绝对证明偶发缺陷不存在。
- 详细配置、工具与排错见 [完整说明](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.zh.md)。

## 插件更新

在原生插件详情页底部检查更新。默认自动检查，**默认不自动安装**；Suite 管理的组件随整包更新。

## 文档与反馈

- [完整使用、配置与边界](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.zh.md) · [更新记录](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/CHANGELOG.md) · [验证历史](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/VALIDATION.md)
- 欢迎 Star、提交 [Issues](https://github.com/STARDUSTLC666/dsh-flakefinder/issues) 与 [PR](https://github.com/STARDUSTLC666/dsh-flakefinder/pulls)（反馈请附版本与复现步骤，并移除凭据）。

## License

[MIT](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/LICENSE)

<a id="依赖与配置"></a>
