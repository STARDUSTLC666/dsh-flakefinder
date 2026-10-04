# dsh-flakefinder

[English](README.en.md)

![dsh-flakefinder 鲸鱼娘插件封面](https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/assets/cover-whale-girl.png)

重复运行测试，找出偶发失败用例并保留调查记录。

[![npm](https://img.shields.io/npm/v/dsh-flakefinder)](https://www.npmjs.com/package/dsh-flakefinder) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder)

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

可说：“把这组测试重复运行十次，找出偶发失败的用例并总结差异。”

## 依赖与配置

需要项目已有可执行的测试命令。隔离清单用于记录问题，具体门禁按项目配置。

详细配置、工具参数与排错见[使用说明](docs/USAGE.md)。从源码独立开发时，Node 要求以 [package.json](package.json) 为准。

## 文档

- [使用与排错](docs/USAGE.md)
- [更新记录](CHANGELOG.md)
- [验证范围与历史记录](docs/VALIDATION.md)
- [问题反馈与功能建议](https://github.com/STARDUSTLC666/dsh-flakefinder/issues)

## License

[MIT](LICENSE)
