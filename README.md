**简体中文** · [English](README.en.md)

# FlakeFinder

**把偶发失败变成有记录、能继续排查的线索。**

DeepSeek Harness（`>=0.2.2-rc.3`）偶发测试排查插件：面向 Vitest、Jest、pytest 与 `node:test` 提供多轮复跑、失败率统计、历史追踪及受宿主审批保护的工作区隔离清单管理。

[![npm](https://img.shields.io/npm/v/dsh-flakefinder)](https://www.npmjs.com/package/dsh-flakefinder) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-total-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder)

**[安装使用](#安装) · [使用流程](#开始使用) · [完整说明](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.zh.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-light.svg" alt="把偶发失败变成有记录、能继续排查的线索。 · 流程示意" width="100%">
</picture>

## 功能

- 支持 Vitest、Jest、pytest 与 `node:test` 复跑调查（支持 monorepo 向上查找框架与工作区 `.venv` 自动探测）。
- 支持用例名过滤（`testName`）、早停模式（`until-flaky` / `verify-fix`）、受控并发（1–4 路）与随机顺序打乱（`shuffle` / `seed`）。
- 自动聚合错误聚类、提取脱敏堆栈、输出通过/失败时间线与根因模式（冷启动、状态泄漏、超时竞态、顺序依赖、清理阶段崩溃）及 95% 置信度提示。
- 按工作区隔离检测历史，交叉对照 `.flakefinder.json` 隔离清单，输出高频不稳定 Top 榜单与超期未复查提醒，并在审批弹窗中展示完整待隔离/移除条目。

## 安装

在 DSH 桌面版「插件」面板安装 `dsh-flakefinder`。已配置命令行时也可使用：

```bash
dsh plugin --profile desktop add dsh-flakefinder
```

网页版把 `desktop` 改为 `web`；安装后重启对应的 DSH。宿主要求以包声明 `>=0.2.2-rc.3` 为准。

## 开始使用

遇到「本地跑通、CI 偶发飘红」的测试时，按四步抓出现场证据：

1. **锁定怀疑对象**：在项目仓库打开会话，告诉助手是哪个测试文件或测试名称偶发失败（支持 Vitest、Jest、pytest 与 `node:test`）。
2. **多轮复跑抓现场**：让助手对目标用例连续跑 10–20 轮，自动统计失败率并留存失败轮次的完整堆栈与差异日志。
3. **定位竞态 / 临时隔离**：根据成功轮与失败轮的时序或状态污染差异定位根因；若短期需要止血，可在你审批后写入 `.flakefinder.json` 隔离清单集中跟踪。
4. **修复后同口径复测**：改完代码再用相同轮次复跑验证全绿，并清理已修复的隔离记录。

常用场景怎么对助手说（可直接复制）：

- **复现偶发红单**：`test/checkout.spec.ts 在 CI 偶尔超时失败，帮我单独连续跑 15 轮统计失败率，并对比失败轮的报错差异。`
- **全仓稳定性摸底**：`查看当前仓库的历史偶发失败记录和隔离清单，汇总最不稳定的前三个用例。`
- **修完回归消单**：`我已经修了异步定时器未清理的问题，再用同样参数连跑 20 轮确认稳定通过，通过后把它移出隔离清单。`

## 开始前要知道

重复测试会实际执行项目命令。未复现不等于不存在偶发问题。

配置、完整工具与排错见[详细使用说明](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.zh.md)。

## 插件更新

在工作台或原生插件详情页底部检查更新。默认自动检查，**默认不自动安装**；是否安装、何时重启由你决定。Suite 管理的组件随整包更新。[查看更新规则](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.zh.md)。

## 文档

- [详细使用、配置与边界](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.zh.md)
- [更新记录](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/CHANGELOG.md)
- [验证范围与历史](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/VALIDATION.md)

## 反馈与贡献

如果插件帮到了你，欢迎 Star，让更多人发现它。问题和建议请提交 [Issues](https://github.com/STARDUSTLC666/dsh-flakefinder/issues)，也欢迎代码与文档 [PR](https://github.com/STARDUSTLC666/dsh-flakefinder/pulls)。反馈时附上版本与复现步骤，并移除凭据。

## License

[MIT](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/LICENSE)

<a id="依赖与配置"></a>
