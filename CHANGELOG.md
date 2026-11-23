# 更新记录

## 0.5.1 (2026-11-23)

- 将 `tools/pre-execute` 审批监听器纳入插件卸载清理（`disposers`），确保 `dispose` 与 `ctx.effect` 卸载释放，并补充单元测试。
- 在 `README.en.md` 补齐缺失的第 6 类根因模式 `intermittent`，在 `cordis.patch.yml` 补充 `graceMs` 注释，并修正 `docs/REFERENCE.{zh,en}.md` 语言切换链接与更新说明。
- Track the `tools/pre-execute` listener disposer in `disposers` for clean `dispose`/`ctx.effect` teardown (with unit tests); list the missing `intermittent` root-cause pattern in `README.en.md`, document `graceMs` in `cordis.patch.yml`, and align `docs/REFERENCE.{zh,en}.md` links and update policy wording.

## 0.5.0 (2026-11-22)

- 核心正确性修复：修复混合 `stable-fail` + `flaky`（`passRuns=0`）误判稳定失败及合成 `(crash)`/`(timeout)` 失败率；单轮超时不再中断整批检测并区分宿主取消信号；新增 `lossy` 输出截断检测；升级层级 TAP 13 解析器（叶子用例去重、去除顺序号防并发串位、提取 YAML 耗时与堆栈）与 JUnit XML 严格校验；支持 Monorepo 向上查找 `node_modules`、工作区 `.venv`/`venv` 自动探测与 Windows 路径规范化。
- 诊断与执行力升级：新增报错指纹聚类与脱敏精简堆栈、每用例单轮时间线（`✓/✗/⏱/S/-`）、通过/失败耗时对比、6 类根因模式画像与 95% 置信度提示；`flaky_detect` 新增 `testName` 过滤、`mode`（`full` / `until-flaky` / `verify-fix`）早停、`concurrency`（1–4）、`shuffle`/`seed` 随机顺序复现与 `noCoverage` 默认跳过覆盖率；抽离 `FrameworkAdapter` 注册表架构。
- 工作区隔离与闭环联动：检测历史按工作区独立存储（保留 `scope=all` 兼容旧记录）；修复 `.flakefinder.json` 隔离写入匹配缺陷并保留首次 `since`、新增可选 `updatedAt`/`issue`/`lastFailureRate` 与相对 POSIX 路径归一化；`flaky_detect` 自动标注 `[新增未隔离]`/`[已隔离]`/可消单候选，`flaky_report` 新增高频不稳定 Top N 榜单与超期未复查提醒；丰富审批弹窗内容，升级 `flaky_health` 为工作区感知自检。
- Core correctness & reliability fixes: ensure test-level `flakyCount > 0` always yields top-level `flaky` verdict; record per-run timeouts gracefully without aborting remaining runs (preserving host abort cancellation); detect `lossy` output truncation; upgrade to a hierarchical TAP 13 + YAML diagnostics parser with deterministic order-independent leaf IDs and strict JUnit XML validation; add upward monorepo `node_modules` and workspace `.venv`/`venv` discovery plus Windows path normalization.
- Diagnostics & execution controls: add secret-redacted error fingerprinting with compact representative stacks, per-test timelines, pass-vs-fail duration stats, 6 root-cause pattern heuristics, and 95% confidence upper bounds; extend `flaky_detect` with `testName`, `mode` (`full` / `until-flaky` / `verify-fix`), `concurrency` (1–4), `shuffle`/`seed`, and `noCoverage` (default `true`); extract the `FrameworkAdapter` registry.
- Workspace isolation & quarantine feedback loop: isolate history per workspace (with `scope=all` legacy compatibility); fix quarantine add/update matching while preserving original `since` and enforcing relative POSIX paths; cross-annotate `flaky_detect` with new/quarantined/clear-candidate items; add Top-N hotspots and stale-quarantine warnings in `flaky_report`; enrich approval prompts and make `flaky_health` workspace-aware.

## 0.4.23 (2026-11-20)

- 升级共享更新组件至 0.2.10，移除跨插件右下角浮动提醒，保留工作台及插件详情页更新控制。

- 保留混合 JUnit 用例的身份和原始顺序，修正 time 秒到毫秒；TAP 不重复纳入嵌套用例，TODO 按跳过处理。

## 0.4.22 (2026-11-20)

- 修复测试进程在报告写出后崩溃或被终止却仍判定稳定通过的问题；TAP / JSON / JUnit 都校验进程结果，保留已产生的断言与历史格式，并在摘要中呈现运行异常。
- Honor abnormal process exits after TAP/JSON/JUnit reporting, preserving assertion details and history formats while preventing false stable-pass verdicts and surfacing runner failures.
- 同步共享更新组件 0.2.9，修复取消窗口和失败响应清理，并确保运行中旧协调器在空闲后接管修复。

## 0.4.21 (2026-11-20)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.7`：对话页「有新版本」提醒浮卡支持无交互 15 秒自动收起（悬停、聚焦、查看记录或确认弹窗时自动暂停，安装成功提示 6 秒收起，安装中/失败/需要重启仍保持常驻不隐藏）。
- Upgrade `@stardustlc/dsh-updates` to `0.2.7`: auto-dismiss idle update reminder cards after 15s and silent complete cards after 6s while pausing on hover/focus/notes/dialogs and keeping active, failed, or restart-required cards pinned.

## 0.4.20 (2026-11-20)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.6`：端到端验收修复浮卡与日历按钮重叠、详情页/工作台挂载时瞬时让位及 `package-moved` / 包管理器报错诊断文案，继续保持过期检查自动刷新与 `bundle-in-use` 指导。
- Upgrade `@stardustlc/dsh-updates` to `0.2.6`: E2E-verified fixes for floating Calendar FAB clearance, immediate reminder yield on native detail/workbench mount, and clearer `package-moved` / package-manager error messages, alongside auto-refresh and `bundle-in-use` guidance.

## 0.4.19 (2026-11-18)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.5`：独立安装插件详情页底栏去重（保留组合包组件委派与对话页热更新卡片），补齐 `bundle-in-use` 组合包占用提示说明，并在检查结果过期或远端版本变更时自动刷新元数据，彻底消除 `check-first` 卡顿。
- Upgrade `@stardustlc/dsh-updates` to `0.2.5`: deduplicate standalone native plugin detail footers while keeping Suite delegation and in-chat reminder cards, surface clear `bundle-in-use` guidance, and automatically refresh expired update checks without `check-first` stalls.

## 0.4.18 (2026-11-18)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.4`：对话页新增一键热更新提醒卡片，自动检查周期缩短至 6 小时，手动热更新后可顺手开启包含兼容功能小版本的空闲自动更新。
- Upgrade `@stardustlc/dsh-updates` to `0.2.4`: add an actionable in-chat hot-update reminder card, 6-hour background update checks, compatible minor+patch idle auto-updates, and a post-update opt-in prompt.

## 0.4.17 (2026-11-18)

- 同步 `@stardustlc/dsh-updates` 0.2.3：侧边栏工作台平时默认隐藏底部更新栏（零高度占用），仅在检测到兼容新版本或执行更新时浮现单行精简提示条；完整更新设置与检查入口统一保留在 DSH「插件」详情页底部。
- Sync `@stardustlc/dsh-updates` 0.2.3: keep the sidebar workbench update footer hidden by default when up-to-date, surfacing a single-line compact strip only for actionable updates or active jobs while retaining full controls in native Plugin Details.

## 0.4.16 (2026-11-18)

- 优化中英文偶发测试排查流程：围绕「锁定可疑用例 → 连跑抓失败率与差异 → 定位或审批隔离 → 修复后同口径复测消单」补齐四步闭环与可复制提示词。
- Refine bilingual flaky-test workflows into a clear 4-step loop (target -> repeat & diff -> fix or quarantine -> re-verify & clear) with copy-ready prompts.

## 0.4.15 (2026-11-18)

- 更新区底部新增克制、无打扰的 GitHub 点赞与问题反馈快捷链接，并完善中英文检索关键词。
- Add subtle, non-intrusive GitHub Star and issue feedback links in the update footer, and expand search keywords.

## 0.4.14 (2026-11-18)

- 同步 `@stardustlc/dsh-updates` 0.2.1：恢复 Suite 整包统一更新（移除独立拆包迁移），保留整包与独立插件的原地热更新与失败自动回滚。
- Sync `@stardustlc/dsh-updates` 0.2.1: restore unified Suite bundle updates (removing standalone conversion) while retaining in-place hot reload and automatic rollback.

## 0.4.13 (2026-11-18)

- 深度适配 DSH 0.2.2：补齐 manifestVersion 1 与双语元数据；改用 Cordis 4 `ctx.effect` 清理资源，补齐测试运行器中断信号重抛、兼容 `effectivePolicy` 审批策略并为只读工具声明并发安全。
- Deeply adapt to DSH 0.2.2: add manifestVersion 1 and bilingual locale metadata; migrate cleanup to Cordis 4 `ctx.effect`, rethrow abort signals after runner completion, honor `effectivePolicy`, and mark read-only tools concurrency-safe.

## 0.4.12 (2026-11-17)

- 在原生插件详情页单独检查和安装兼容版本。自动安装默认关闭，可为该插件开启空闲时的稳定补丁更新。
- Check and install compatible versions separately from the native plugin details. Automatic installation is off by default. Enable it for this plugin to apply stable patches while idle.

## 0.4.11 (2026-11-14)

- 适配 DSH 0.2.2-rc.3：最低 Harness 版本声明提升至 0.2.2-rc.3，运行时代码未变。
- Support DSH 0.2.2-rc.3: raise the minimum Harness declaration to 0.2.2-rc.3; runtime code is unchanged.

## 0.4.10 (2026-11-04)

- 同步共享界面：嵌入设置时继承宿主底色，输入框跟随主题，空状态保持可读宽度；新版 DSH 可显示插件设置图标。
- Align embedded surfaces, themed inputs, readable empty states and optional native settings icons.


## 0.4.9 (2026-11-03)

- flaky_report 渲染检测历史；flaky_detect 补目标、首个错误与按 verdict 的下一步。
- flaky_report renders detection history; flaky_detect adds target, first error and verdict-specific next steps.

## 0.4.8 (2026-10-30)

- 重整中英文首页：用途、三步流程图、安装入口与操作示例；详细配置与边界集中到完整说明。
- 保留下载统计、独立更新选择、问题反馈和贡献入口；原封面与运行功能保留。
- Refresh bilingual landing pages, workflow artwork, quick starts and reference navigation.


## 0.4.7 (2026-10-30)

- 原生插件列表与详情新增专门生成的鲸鱼娘图标：大头像、独立功能符号、透明留白，适合 30 / 36 px 显示；原封面保留。
- Add purpose-made whale-girl artwork with a distinct function emblem, transparent padding and small-size readability; preserve the original cover.


[返回简介](README.md) · [使用说明](docs/USAGE.md) · [验证记录](docs/VALIDATION.md)

## 0.4.6 (2026-10-29)

- 补齐中英文使用流程：准备、入口、具体操作与结果核对；新增累计 npm 下载徽章并保留月统计。
- Add practical getting-started workflows and lifetime npm download badges alongside monthly counts.

## 0.4.5 (2026-10-29)

- 同步仓库与 npm 的简明介绍、中英文 README 和反馈入口；本次为文档与包元数据更新。
- Sync npm descriptions and both README guides with the repository, including issue and pull-request links.

## 0.4.4 (2026-10-28)

- 隔离清单写操作正确处理 never/未知审批策略，不再误报用户点击拒绝；保留宿主拒绝与原有可询问模式，不自动放宽审批。

## 0.4.3 (2026-10-27)

- 修复分批更新时的新旧更新控件混用：保留原页面、草稿与安装保护，空闲后接管旧控制器，兼容旧入口。

## 0.4.2 (2026-10-27)

- 更新控件移至原有工作台或原生插件详情页底部；更新记录与选项原地展开，移除独立更新菜单与页面。
- 保留原页面操作与草稿，自动安装默认关闭；安装前确认，遇到未保存修改或运行任务时暂停。

## 0.4.1 (2026-10-27)

- Keep this component's own update entry visible when installed transitively through Suite. Confirm whole-Suite update scope before opening its controls.
- Keep automatic installation off by default and preserve independent installation behavior.

## 0.4.0 (2026-10-26)

- Add this plugin’s own update controls and independent preferences. Automatic installation stays off until explicitly enabled.
- Confirm manual installs, preserve local sources and disabled state, pause for tasks or unsaved changes, and use native DSH recovery without forced restarts.
- Require the public DSH 0.2.1-rc.3 update APIs; Suite components remain managed through Suite.

## 0.3.5 (2026-10-05)

- 测试进程和隔离清单使用当前会话工作区，取消后不再执行后续轮次或保存成功记录；跨实例锁定历史与隔离清单，损坏文件保持原样。

## 0.3.4 (2026-09-28)

- 更新官方 Harness 0.2.0-rc.1 的兼容声明和共同加载验证；运行时代码未变。验证范围见[验证记录](docs/VALIDATION.md)。

## 更早的改动

完整历史可查阅 [GitHub 提交记录](https://github.com/STARDUSTLC666/dsh-flakefinder/commits/master)。
