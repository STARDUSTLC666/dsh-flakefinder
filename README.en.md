# dsh-flakefinder

[中文](README.md)

![dsh-flakefinder whale girl plugin cover](https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/assets/cover-whale-girl.png)

Repeat test runs to identify intermittent failures and keep investigation history.

[![npm](https://img.shields.io/npm/v/dsh-flakefinder)](https://www.npmjs.com/package/dsh-flakefinder) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder)

## What it does

- Support Vitest, Jest, pytest and node:test.
- Track repeated run results and failure history.
- Generate and maintain a quarantine list.

## Install

In DSH Desktop, install `dsh-flakefinder` from the Plugins panel. If the bundled dsh command is available:

```bash
dsh plugin --profile desktop add dsh-flakefinder
```

For the web version, replace `desktop` with `web`. Restart DSH after installation.

## Start using it

Ask: “Run this test group ten times, identify intermittent failures and summarize the differences.”

## Requirements and configuration

Requires a working test command in your project. Quarantine records and gates follow project configuration.

Detailed configuration, tool arguments and troubleshooting are in the [usage guide](docs/USAGE.en.md). For standalone development, follow the Node requirement in [package.json](package.json).

## Documentation

- [Usage and troubleshooting](docs/USAGE.en.md)
- [Changelog](CHANGELOG.md)
- [Validation scope and history](docs/VALIDATION.md)
- [Report a problem or suggest a feature](https://github.com/STARDUSTLC666/dsh-flakefinder/issues)

## License

[MIT](LICENSE)
