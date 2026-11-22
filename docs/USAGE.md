# dsh-flakefinder 使用说明

## 完全权限下的确认

插件保留单独确认要求，并在审批弹窗中展示即将写入或移除的完整用例列表（以及隔离原因/关联 issue）。会话审批策略为 `never` 时不能弹框，会明确说明操作未执行；请切到可询问模式，或由用户明确设置 `writeApproval: false`。其它宿主拒绝仍生效，不自动放宽权限。

[返回简介](../README.md) · [更新记录](../CHANGELOG.md) · [验证记录](VALIDATION.md)

## 核心能力

- **工作区感知与隔离**：历史记录按工作区分别存储于 `dataDir/workspaces/<hash>.json`（兼容旧版 `history.json`）；相对 `quarantineFile` 默认落在当前工作区 `.flakefinder.json`，路径自动规范化为 POSIX 相对路径并拒绝越界绝对路径。
- **高效精准复跑**：支持按用例名过滤（`testName`）、早停模式（`until-flaky` / `verify-fix`）、受控并发（`concurrency` 1–4 路）、默认跳过覆盖率（`noCoverage`）以及随机顺序打乱与种子复现（`shuffle` / `seed`）。
- **根因诊断与置信度**：自动聚合去重错误聚类（归一化时间戳/UUID/端口等噪声并脱敏密钥堆栈），输出通过/失败时间线（`✓`/`✗`/`⏱`/`S`/`-`）、通过与失败耗时对比、6 类根因模式提示（`cold-start` / `state-leak` / `timeout-race` / `order-dependent` / `teardown-crash` / `intermittent`），以及全绿时的 95% 置信度残余偶发率上界。
- **隔离闭环与报告**：`flaky_detect` 自动对照 `.flakefinder.json` 标注 `[新增未隔离]`、`[已隔离]` 与可解除隔离候选；`flaky_report` 汇总历史高频不稳定 Top 5 榜单与超期未复查提醒。
- **安全与容错**：取消信号立即中止测试进程且不写脏历史；并发写入受文件锁保护；损坏的 JSON 文件报错并保留原文件；超 60 个用例时自动精简 `stable-pass` 条目保护上下文窗口。

## 工具

| 工具 | 作用 | 写操作 |
| :-- | :-- | :-- |
| `flaky_detect` | 多轮复跑测试并输出判定、时间线、错误聚类、根因模式与隔离对照 | 否（写历史） |
| `flaky_history` | 查询检测历史，支持按 `target` 过滤与 `scope`（`workspace` / `all`）切换 | 否 |
| `flaky_report` | 汇总隔离清单、高频不稳定 Top 5、超期隔离提醒与历史趋势 | 否 |
| `flaky_quarantine` | 把 flaky 用例写入 `.flakefinder.json`（支持 `issue`、`lastFailureRate` 与增量更新） | 是（审批门） |
| `flaky_clear` | 从隔离清单移除已恢复稳定的用例 | 是（审批门） |
| `flaky_health` | 工作区感知自检：Node 版本、自动探测框架、Python/pytest、清单与历史可读性、默认配置 | 否 |

### `flaky_detect` 参数

| 参数 | 类型 | 默认 | 说明 |
| :-- | :-- | :-- | :-- |
| `target` | `string`（必填） | — | 测试文件、目录或 glob（相对工作区，不能以 `-` 开头） |
| `framework` | `enum` | `auto` | `auto` / `vitest` / `jest` / `pytest` / `node`（也接受别名 `node:test`、`py`） |
| `runs` | `integer` | `defaultRuns` | 重复次数（`3`–`maxRuns`） |
| `testName` | `string` | — | 按用例名过滤（Vitest/Jest `-t`、pytest `-k`、`node:test` `--test-name-pattern`） |
| `mode` | `enum` | `full` | `full`（跑满次数）/ `until-flaky`（确认不稳定即早停）/ `verify-fix`（首次失败即早停） |
| `concurrency` | `integer` | `defaultConcurrency` | 并发 worker 数（`1`–`4`） |
| `shuffle` | `boolean` | `false` | 是否打乱执行顺序（Vitest/Jest 生效；未指定 `seed` 时每轮生成不同随机种子） |
| `seed` | `integer` | — | 随机种子（`0`–`2147483647`），配合 `shuffle` 复现特定顺序失败 |
| `noCoverage` | `boolean` | `noCoverage` 配置 | 是否关闭覆盖率采集加速复跑（Vitest/Jest 生效，默认 `true`） |

### 支持框架

- **vitest**：从工作区向上查找 `node_modules/vitest/vitest.mjs`（适配 monorepo hoisted 依赖），使用 JSON reporter；支持 `-t`、`--coverage.enabled=false`、`--sequence.shuffle --sequence.seed=...`。
- **jest**：从工作区向上查找 `node_modules/jest/bin/jest.js`，使用 `--json --outputFile`；单并发非打乱默认带 `--runInBand`；支持 `-t`、`--coverage=false`、`--randomize --seed=...`。
- **pytest**：按 `显式 pythonPath > DSH_FLAKEFINDER_PYTHON > VIRTUAL_ENV > 工作区 .venv/venv > 默认 python/python3` 解析解释器，运行 `python -m pytest -q --junitxml=...`（支持 `pytest.ini` / `tox.ini` / `pyproject.toml` / `setup.cfg` 探测、`-k` 过滤、CDATA 与 XML 实体解码及 `<system-err>` 回退）。
- **node:test**：运行 `node --test --test-reporter=tap`，支持 `--test-name-pattern=...`、层级 TAP 13（含 YAML 诊断块与堆栈提取）、`SKIP`/`TODO` 指令与 `Bail out!` 识别。
- `framework: auto` 按 `vitest → jest → pytest → node:test` 优先级自动探测。

## 安装

```bash
dsh plugin --profile web add dsh-flakefinder
```

或手动安装后在 profile 的 `cordis.patch.yml` 插入：

```yaml
- id: flakefinder
  name: 'dsh-flakefinder'
  config:
    defaultRuns: 5
    defaultConcurrency: 1
    noCoverage: true
    staleQuarantineDays: 14
    writeApproval: true
```

## 卸载

```bash
dsh plugin --profile web remove dsh-flakefinder
```

卸载后重启 Web 服务。如需彻底清理，可再手动删除自己 profile `cordis.patch.yml` 中覆盖的插件行。

## 使用示例

```text
用户：src/checkout.test.ts 里的定时器用例最近老飘红，帮我查一下
Agent：
  flaky_detect(target="src/checkout.test.ts", testName="定时器恢复", runs=10, concurrency=2, mode="until-flaky")
  → 判定：不稳定（flaky）；实际运行 4/10 次；时间线 ✓✓✗✓；模式：超时/竞态；错误聚类 [1次]：TimeoutError
  → flaky_quarantine(tests=["src/checkout.test.ts > 定时器恢复"], reason="定时器竞态", issue="#12", lastFailureRate=25)

用户：修完定时器和清理钩子了，帮我复测验证
Agent：
  flaky_detect(target="src/checkout.test.ts", testName="定时器恢复", runs=15, mode="verify-fix")
  → 判定：稳定通过；95% 置信下残余偶发率 ≤ 18.1%；命中可解除隔离候选
  → flaky_clear(tests=["src/checkout.test.ts > 定时器恢复"])
```

## 配置

| 字段 | 默认 | 说明 |
| :-- | :-- | :-- |
| `defaultRuns` | `5` | `flaky_detect` 默认重复次数（`3`–`20`） |
| `maxRuns` | `20` | 单次允许的最大重复次数（`3`–`50`） |
| `defaultConcurrency` | `1` | `flaky_detect` 默认并发 worker 数（`1`–`4`） |
| `noCoverage` | `true` | 默认关闭覆盖率采集以加速复跑（Vitest/Jest 生效） |
| `staleQuarantineDays` | `14` | `flaky_report` 超期未复查隔离项提醒阈值（`1`–`365` 天） |
| `timeoutMs` | `120000` | 单轮测试运行超时（毫秒，`10000`–`600000`） |
| `graceMs` | `10000` | 超时后宽限（毫秒，`1000`–`120000`） |
| `writeApproval` | `true` | 隔离清单写操作是否走审批门 |
| `dataDir` | `DSH_HOME/.dsh-flakefinder` | 历史存储根目录（按工作区分文件） |
| `quarantineFile` | `<cwd>/.flakefinder.json` | 隔离清单路径（相对路径按当前会话工作区解析） |
| `pythonPath` | 自动探测 `.venv` 或 `python`/`python3` | pytest 使用的 Python 解释器（显式配置或 `DSH_FLAKEFINDER_PYTHON` 优先） |

## 隔离清单格式

```json
{
  "version": 1,
  "quarantined": [
    {
      "file": "src/checkout.test.ts",
      "name": "使用假定时器后恢复真实定时器",
      "reason": "定时器竞态，见 issue #12",
      "since": "2026-08-16T00:00:00.000Z",
      "updatedAt": "2026-08-20T00:00:00.000Z",
      "lastFailureRate": 25,
      "issue": "#12"
    }
  ]
}
```

隔离清单只记录，不修改测试源码；agent 跑测试前应先查阅 `flaky_report`。重复对同一条目执行 `flaky_quarantine` 会保留原始 `since` 并更新 `reason`、`updatedAt` 及可选元数据。

## 工程

- Node `^22.19.0 || >=24.0.0`（即 `Node >= 22.19`），TypeScript，运行时依赖 `proper-lockfile` 与 `@stardustlc/dsh-updates`
- 测试进程走 DSH 官方 subprocess 服务，argv 数组、无 shell
- 完整自动化测试覆盖：适配器与配置、JSON/JUnit/TAP 13 诊断解析、错误聚类与根因模式、工作区存储隔离、批次并发与早停、工具集成与真实 `node --test` 端到端测试、审批门与 manifest
- `pnpm test`：构建（`tsc` + `build-updates.mjs`）+ `node --test "test/*.test.mjs"`

## 发布门禁

1. `pnpm test` 全绿
2. `pnpm typecheck` 零报错
3. 危险模式扫描（eval / child_process / 密钥零容忍）
4. 真实 profile 冒烟：全新临时 profile 安装插件 → 真 boot → stderr 零报错
5. manifest 自检（bundle patch / exports / files 白名单）

## 故障排查

先运行 `flaky_health`：它按当前工作区检查 Node 版本、自动探测到的框架路径、Python/pytest（纯 JS/TS 工作区中 pytest 缺失仅标记为可选提示，不会误报自检失败；存在 pytest 配置或显式配置 `pythonPath` 时缺失才会报 ❌）、`.flakefinder.json` 与历史文件可读性，并汇总默认配置。

| 现象 | 常见原因 | 处理 |
| :-- | :-- | :-- |
| 判定「没有解析到用例」 | `target` 或 `testName` 没匹配到用例，或文件里只有被跳过的用例 | 确认 `target` 指向真实测试文件/目录，检查 `testName` 模式，必要时显式指定 `framework` |
| 提示「运行异常汇总」或超时 | 框架 CLI 缺失、单轮超时、TAP 输出超过 4MB 被截断、或断言后清理阶段崩溃 | 查看摘要里的错误聚类与 stderr 尾部；按需调大 `timeoutMs` 或用 `testName` 缩小范围 |
| `framework=vitest` 报找不到 `node_modules/vitest` | 未安装依赖，或工作区路径不在项目/monorepo 内 | 在安装了框架的仓库内调用，或显式指定 `framework` |
| Python 工作区 `flaky_health` 报 pytest 失败 | 虚拟环境未创建或未安装 pytest | 运行 `pip install pytest`，或在配置中设置 `pythonPath` 指向对应解释器 |
| 隔离/清除返回 0 条 | 引用格式或路径与清单不一致 | 用 `"相对路径 > 用例名"` 格式；先 `flaky_report` 看清单现有条目 |

`flaky_detect` 的摘要会给出下一步：flaky 先隔离并结合模式/错误聚类定位，稳定失败先单跑定位，稳定通过且命中已隔离项时可直接 `flaky_clear`。

## License

MIT
