**简体中文** · [English](README.en.md)

# FlakeFinder

**把偶发失败变成有记录、能继续排查的线索。**

[![npm](https://img.shields.io/npm/v/dsh-flakefinder)](https://www.npmjs.com/package/dsh-flakefinder) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-total-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder)

**[安装使用](#安装) · [使用流程](#开始使用) · [完整说明](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.zh.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-zh-light.svg" alt="把偶发失败变成有记录、能继续排查的线索。 · 流程示意" width="100%">
</picture>

## 功能

- 支持 Vitest、Jest、pytest 与 node:test 调查。
- 保留每轮结果与失败历史。
- 依据差异继续定位，并管理隔离清单。

## 安装

在 DSH 桌面版「插件」面板安装 `dsh-flakefinder`。已配置命令行时也可使用：

```bash
dsh plugin --profile desktop add dsh-flakefinder
```

网页版把 `desktop` 改为 `web`；安装后重启对应的 DSH。宿主要求以包声明 `>=0.2.1-rc.3` 为准。

## 开始使用

1. 在目标测试仓库创建 DSH 会话，先确认依赖与测试命令能正常运行。
2. 给出要重复的命令、次数和范围，先让助手说明执行计划及可能产生的文件。
3. 确认后运行，查看每轮状态、失败日志和工作区隔离清单。
4. 根据可重复的差异缩小问题，修复后用同一命令复测；没有复现时保留未复现结论。

可以这样说：

> 先说明重复运行这条测试命令的计划和影响，确认后运行并保留每轮结果。

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
