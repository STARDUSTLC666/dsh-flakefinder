# dsh-flakefinder

[中文](README.md)

![dsh-flakefinder whale girl plugin cover](https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/assets/cover-whale-girl.png)

Repeat test runs and retain individual results to investigate intermittent failures. Keeps workspace-scoped investigation and quarantine records, with configurable confirmation and clear permission messages for writes.

[![npm](https://img.shields.io/npm/v/dsh-flakefinder)](https://www.npmjs.com/package/dsh-flakefinder) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder)

Feedback and contributions are welcome: report [issues](https://github.com/STARDUSTLC666/dsh-flakefinder/issues) or submit [pull requests](https://github.com/STARDUSTLC666/dsh-flakefinder/pulls).

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

## Plugin updates

Requires DSH 0.2.1-rc.3 or newer. Update controls sit at the bottom of the existing workbench, or native plugin details for plugins without a workbench. Checks, release notes and preferences expand in place, with no separate update page or settings menu. Automatic checks are on by default; **automatic installation is off by default**. Only explicit opt-in permits compatible stable patches while idle with no unsaved changes. Preferences are independent, with per-plugin disable, deferral and ignore controls. No forced DSH restart or upgrade, and local-source installations stay unchanged. Suite components explain and operate on the whole Suite in the same footer.

Older releases need one manual update in native plugin management to acquire these controls. Publishing to npm does not replace an existing user installation.

## License

[MIT](LICENSE)
