# dsh-flakefinder 使用说明

## 完全权限下的确认

插件保留单独确认要求。会话审批策略为 `never` 时不能弹框，会明确说明操作未执行；请切到可询问模式，或由用户明确设置 `writeApproval: false`。其它宿主拒绝仍生效，不自动放宽权限。

[返回简介](../README.md) · [更新记录](../CHANGELOG.md) · [验证记录](VALIDATION.md)

## 本次改进

相对 quarantineFile 默认在当前工作区的 .flakefinder.json。取消会停止当前测试进程；同一数据目录的并发写入不会丢失历史或隔离条目。损坏文件会报错并保留，先备份后检查。

## 工具

| 工具 | 作用 | 写操作 |
| :-- | :-- | :-- |
| `flaky_detect` | 重复运行测试 N 次，判定 stable-pass / stable-fail / flaky | 否（写历史） |
| `flaky_history` | 查询检测历史，按目标过滤 | 否 |
| `flaky_report` | 汇总隔离清单 + 历史，输出稳定性报告 | 否 |
| `flaky_quarantine` | 把 flaky 用例写入 `.flakefinder.json` 隔离清单 | 是（审批门） |
| `flaky_clear` | 从隔离清单移除已恢复的用例 | 是（审批门） |

支持框架：

- vitest：读取 `node_modules/vitest/vitest.mjs`，使用 JSON reporter
- jest：读取 `node_modules/jest/bin/jest.js`，使用 `--json --outputFile`
- pytest：`python -m pytest --junitxml`，解析 JUnit XML（支持 setup.cfg / pyproject / pytest.ini / tox.ini 探测与 XML 实体解码）
- node:test：`node --test --test-reporter=tap`，解析 TAP（含 SKIP 指令归类）
- `framework: auto` 按 vitest → jest → pytest → node:test 自动探测

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
    writeApproval: true
```

## 卸载

```bash
dsh plugin --profile web remove dsh-flakefinder
```

卸载后重启 Web 服务。如需彻底清理，可再手动删除自己 profile `cordis.patch.yml` 中覆盖的插件行。

## 使用示例

```text
用户：src/checkout.test.ts 最近老失败，帮我判断一下
Agent：
  flaky_detect(target="src/checkout.test.ts", runs=5)
  → 判定：flaky；3/5 通过，失败集中在 useFakeTimers 用例
  → flaky_quarantine(tests=["src/checkout.test.ts > 定时器恢复"], reason="定时器竞态")
```

## 配置

| 字段 | 默认 | 说明 |
| :-- | :-- | :-- |
| `defaultRuns` | `5` | `flaky_detect` 默认重复次数（3-20） |
| `maxRuns` | `20` | 单次允许的最大重复次数（3-50） |
| `timeoutMs` | `120000` | 单轮测试运行超时 |
| `graceMs` | `10000` | 超时后宽限 |
| `writeApproval` | `true` | 隔离清单写操作是否走审批门 |
| `dataDir` | `DSH_HOME/.dsh-flakefinder` | 历史存储目录 |
| `quarantineFile` | `<cwd>/.flakefinder.json` | 隔离清单路径 |
| `pythonPath` | `DSH_FLAKEFINDER_PYTHON` 或 `python`/`python3` | pytest 使用的 Python 解释器 |

## 隔离清单格式

```json
{
  "version": 1,
  "quarantined": [
    {
      "file": "src/checkout.test.ts",
      "name": "使用假定时器后恢复真实定时器",
      "reason": "定时器竞态，见 issue #12",
      "since": "2026-08-16T00:00:00.000Z"
    }
  ]
}
```

隔离清单只记录，不修改测试源码；agent 跑测试前应先查阅 `flaky_report`。

## 工程

- Node >= 22.13，TypeScript，仅依赖文件锁库
- 测试进程走 DSH 官方 subprocess 服务，argv 数组、无 shell
- 全量单测 40+：解析、判定、存储、审批门、pytest 计划、subprocess 超时、注册与 manifest
- `pnpm test`：构建 + `node --test`

## 发布门禁

1. `pnpm test` 全绿
2. `pnpm typecheck`
3. 危险模式扫描（eval / child_process / 密钥零容忍）
4. 真实 profile 冒烟：全新临时 profile 安装插件 → 真 boot → stderr 零报错
5. manifest 自检（bundle patch / exports / files 白名单）

## 故障排查

先运行 `flaky_health`：它检查 Python 解释器与 pytest 是否可用，并汇总默认配置。

| 现象 | 常见原因 | 处理 |
| :-- | :-- | :-- |
| 判定「没有解析到用例」 | target 没匹配到文件，或目标文件里只有被跳过的用例 | 确认 target 指向真实测试文件/目录（支持 glob），必要时显式指定 `framework` |
| 提示「有 N 次运行未产出报告」 | 框架 CLI 缺失、reporter 参数不被接受、pytest 缺少 junitxml 约束 | 先手动跑一次对应命令看报错；确认临时目录可写 |
| `framework=vitest` 报找不到 `node_modules/vitest` | 没安装，或不在项目根目录调用 | 在装了框架的项目里调用，或显式指定 `framework` |
| pytest 相关失败 | 解释器或 pytest 缺失 | `pip install pytest`，或用配置里的 `pythonPath` 指向正确解释器 |
| 隔离/清除返回 0 条 | 引用格式或路径与清单不一致 | 用 `"文件路径 > 用例名"` 格式；先 `flaky_report` 看清单现有条目 |

`flaky_detect` 的摘要会给出下一步：flaky 先隔离，稳定失败先单跑定位，稳定通过可以清除隔离。

## License

MIT
