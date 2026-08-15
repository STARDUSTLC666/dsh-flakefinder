# dsh-flakefinder

> 让 agent 分清「代码坏了」还是「测试在抽风」。

DeepSeek Harness 测试稳定性插件：重复运行测试并识别 flaky 用例，历史留档、隔离清单、写操作审批门。零运行时依赖。

![license](https://img.shields.io/npm/l/dsh-flakefinder) ![stars](https://img.shields.io/github/stars/STARDUSTLC666/dsh-flakefinder?style=social)

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

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
- node:test：`node --test --test-reporter=tap`，解析 TAP
- `framework: auto` 按 vitest → jest → node:test 自动探测

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

- Node >= 22.13，TypeScript，零运行时依赖
- 测试进程走 DSH 官方 subprocess 服务，argv 数组、无 shell
- 全量单测 30+：解析、判定、存储、审批门、注册与 manifest
- `pnpm test`：构建 + `node --test`

## 发布门禁

1. `pnpm test` 全绿
2. `pnpm typecheck`
3. 危险模式扫描（eval / child_process / 密钥零容忍）
4. 真实 profile 冒烟：全新临时 profile 安装插件 → 真 boot → stderr 零报错
5. manifest 自检（bundle patch / exports / files 白名单）

## License

MIT
