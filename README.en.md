[简体中文](README.md) · **English**

# FlakeFinder

**Turn intermittent test failures into traceable evidence.**

[![npm](https://img.shields.io/npm/v/dsh-flakefinder)](https://www.npmjs.com/package/dsh-flakefinder) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-total-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder)

**[Install](#install) · [Workflow](#start-using-it) · [Full guide](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.en.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-en-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-en-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-en-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-en-light.svg" alt="Turn intermittent test failures into traceable evidence. · workflow illustration" width="100%">
</picture>

## Features

- Investigate Vitest, Jest, pytest and node:test runs.
- Keep each run’s outcome and failure history.
- Narrow the cause using differences and maintain quarantine lists.

## Install

Open **Plugins** in the DSH desktop app and install `dsh-flakefinder`. If the CLI is available:

```bash
dsh plugin --profile desktop add dsh-flakefinder
```

For the web profile, replace `desktop` with `web`. Restart that DSH profile after installation. The package’s DSH requirement is `>=0.2.1-rc.3`.

## Start using it

1. Start in the target test repository and confirm dependencies and the test command work.
2. Provide the command, repeat count and scope; review the execution plan and expected file changes first.
3. Run after confirmation and inspect per-run results, failure logs and the workspace isolation inventory.
4. Use reproducible differences to narrow the cause; rerun the same command after fixing it, and retain an unreproduced result when appropriate.

Example request：

> Explain the plan and effects of repeating this test command, then run it after confirmation and retain every result.

## Before you start

Repeated tests execute real project commands. Failure to reproduce is not proof that a flaky issue is absent.

Configuration, detailed tools and troubleshooting: [full reference](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.en.md).

## Plugin updates

Check updates at the bottom of the workbench or native plugin details. Automatic checks are on by default; **automatic installation is off**. You choose whether to install and when to restart. Suite-managed components update with their bundle. [Update behavior](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.en.md).

## Documentation

- [Full usage, configuration and limits](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.en.md)
- [Release notes](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/CHANGELOG.md)
- [Validation scope and history](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/VALIDATION.md)

## Feedback and contributions

If the plugin helps, a Star makes it easier for others to discover. Report problems or suggest improvements in [Issues](https://github.com/STARDUSTLC666/dsh-flakefinder/issues); code and documentation [PRs](https://github.com/STARDUSTLC666/dsh-flakefinder/pulls) are welcome. Include versions and reproduction steps, and remove credentials from reports.

## License

[MIT](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/LICENSE)

<a id="what-it-does"></a>
<a id="requirements-and-configuration"></a>
