# dsh-flakefinder

[English](README.en.md)

![dsh-flakefinder 鲸鱼娘插件封面](https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/assets/cover-whale-girl.png)

重复运行测试并保留每次结果，定位偶发失败用例。支持工作区内的调查记录、隔离列表与清除操作；写操作按配置确认，并明确提示当前权限限制。

[![npm](https://img.shields.io/npm/v/dsh-flakefinder)](https://www.npmjs.com/package/dsh-flakefinder) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-total-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder)

[下载统计说明](https://github.com/STARDUSTLC666/dsh-suite/blob/npm-downloads/README.md)

欢迎使用，遇到问题或有改进建议，请提交 [issues](https://github.com/STARDUSTLC666/dsh-flakefinder/issues) 和 [PR](https://github.com/STARDUSTLC666/dsh-flakefinder/pulls)。

## 功能

- 支持 Vitest、Jest、pytest 和 node:test。
- 记录重复运行结果与失败历史。
- 生成和维护用例隔离清单。

## 安装

桌面版可在「插件」面板按包名 `dsh-flakefinder` 安装。已配置 dsh 命令时也可使用：

```bash
dsh plugin --profile desktop add dsh-flakefinder
```

网页版把命令中的 `desktop` 改为 `web`。安装后重启 DSH。

## 开始使用

1. 在目标测试仓库创建 DSH 会话，先确认依赖与测试命令能正常运行。
2. 给出要重复的命令、次数和范围，先让助手说明执行计划及可能产生的文件。
3. 确认后运行，查看每轮状态、失败日志和工作区隔离清单。
4. 根据可重复的差异缩小问题，修复后用同一命令复测；没有复现时保留未复现结论。

## 依赖与配置

需要项目已有可执行的测试命令。隔离清单用于记录问题，具体门禁按项目配置。

详细配置、工具参数与排错见[使用说明](docs/USAGE.md)。从源码独立开发时，Node 要求以 [package.json](package.json) 为准。

## 文档

- [使用与排错](docs/USAGE.md)
- [更新记录](CHANGELOG.md)
- [验证范围与历史记录](docs/VALIDATION.md)
- [问题反馈与功能建议](https://github.com/STARDUSTLC666/dsh-flakefinder/issues)

## 插件更新

需要 DSH 0.2.1-rc.3 或更新版本。更新控件直接位于原有工作台内容末尾；没有工作台的插件，位于原生插件详情页底部。检查、更新记录和偏好在原地展开，不增加独立更新页面或设置菜单。自动检查默认开启；**自动安装默认关闭**，明确授权后才会在空闲且没有未保存修改时安装兼容的稳定补丁。开关按插件独立保存，可关闭、推迟或忽略提醒；不会强制重启 DSH、升级 DSH 本体或替换本地源码安装。Suite 组件在当前页面底部明确说明并操作 Suite 整包更新。

旧版用户先在官方插件管理中手动更新一次，之后才会获得此入口。发布到 npm 不会直接替换用户已经安装的版本。

## License

[MIT](LICENSE)
