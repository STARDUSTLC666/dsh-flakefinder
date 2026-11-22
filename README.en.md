[简体中文](README.md) · **English**

# FlakeFinder

**Turn intermittent test failures into traceable evidence.**

Flaky test investigation plugin for DeepSeek Harness (`>=0.2.2-rc.3`): runs Vitest, Jest, pytest, and `node:test` repeatedly, tracks failure rates across runs, and manages approval-gated workspace quarantine lists.

[![npm](https://img.shields.io/npm/v/dsh-flakefinder)](https://www.npmjs.com/package/dsh-flakefinder) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-flakefinder-total-downloads.svg)](https://www.npmjs.com/package/dsh-flakefinder)

**[Install](#install) · [Workflow](#start-using-it) · [Full guide](https://github.com/STARDUSTLC666/dsh-flakefinder/blob/master/docs/REFERENCE.en.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-en-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-en-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-en-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/dsh-flakefinder/master/docs/assets/intro/workflow-en-light.svg" alt="Turn intermittent test failures into traceable evidence. · workflow illustration" width="100%">
</picture>

## Features

- Investigate Vitest, Jest, pytest, and `node:test` runs with monorepo upward framework resolution and automatic workspace `.venv` detection.
- Support targeted filtering (`testName`), early-stop modes (`until-flaky` / `verify-fix`), bounded concurrency (1–4 workers), and shuffled order with reproducible seeds (`shuffle` / `seed`).
- Cluster deduplicated errors with redacted stacks, render per-run timelines, infer root-cause patterns (cold-start, state-leak, timeout-race, order-dependent, teardown-crash), and report 95% confidence bounds.
- Keep workspace-isolated detection history, cross-check `.flakefinder.json` quarantine lists, surface top flaky hotspots and stale quarantine reminders, and list exact affected tests in approval prompts.

## Install

Open **Plugins** in the DSH desktop app and install `dsh-flakefinder`. If the CLI is available:

```bash
dsh plugin --profile desktop add dsh-flakefinder
```

For the web profile, replace `desktop` with `web`. Restart that DSH profile after installation. The package’s DSH requirement is `>=0.2.2-rc.3`.

## Start using it

When a test passes locally but fails intermittently in CI, turn guesswork into repeatable evidence in four steps:

1. **Point at the suspect test**: Open a session in the repo and name the flaky test file or suite (supports Vitest, Jest, pytest, and `node:test`).
2. **Repeat & capture failure rate**: Ask the assistant to repeat the target test 10–20 times, recording pass/fail ratios and preserving failure stack traces.
3. **Isolate root cause or quarantine**: Compare passing vs. failing runs to spot timing races or shared state; if needed, approve adding the test to `.flakefinder.json` while working on a fix.
4. **Verify the fix with the same loop**: Re-run the exact repeat count after patching and clear the test from the quarantine list once confirmed stable.

Ready-to-copy prompts:

- **Reproduce an intermittent failure**: `test/checkout.spec.ts fails sporadically in CI — repeat just that file 15 times, report the failure rate, and summarize what differs on failed runs.`
- **Check existing flaky inventory**: `Show the recorded flaky test history and current quarantine list for this repo.`
- **Verify fix & unquarantine**: `Re-run that test 20 times after my timer cleanup fix, and remove it from quarantine once all runs pass.`

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
