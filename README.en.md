# dsh-flakefinder

> Teach agents the difference between broken code and a flaky test.

A DeepSeek Harness plugin for test stability: run tests repeatedly, classify flaky cases, keep history, maintain a quarantine manifest, and gate writes with approvals. Zero runtime dependencies.

![license](https://img.shields.io/npm/l/dsh-flakefinder) ![stars](https://img.shields.io/github/stars/STARDUSTLC666/dsh-flakefinder?style=social)

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

## Tools

| Tool | Purpose | Write |
| :-- | :-- | :-- |
| `flaky_detect` | Repeat tests N times and classify stable-pass / stable-fail / flaky | history only |
| `flaky_history` | Query detection history, filter by target | no |
| `flaky_report` | Combine quarantine manifest and history into a report | no |
| `flaky_quarantine` | Write flaky cases to `.flakefinder.json` | yes (approval) |
| `flaky_clear` | Remove recovered cases from the manifest | yes (approval) |

Frameworks: vitest / jest / pytest (setup.cfg / pyproject / pytest.ini / tox.ini) / node:test, auto-detected in that order. JUnit XML entities and TAP SKIP directives are parsed.

## Compatibility

Validation host: Harness `0.2.0-rc.1` built from official sources (commit `407e65c8`) with Node `24.16.0` on 2026-09-28. All 44 plugin tests pass in an isolated environment; all 18 plugins mount together in one host registering 6 tools, with tool schemas and health-check contracts passing. No live ports or external services were exercised in this round.

2026-09-13 fix: retain the service receiver when calling `subprocess.spawn`, preventing failures caused by passing the method as an unbound callback. Verified with official `0.1.5-rc.1` and `0.1.5-rc.2` on Node `24.16.0`. `flaky_detect` runs three real Node test processes through the host subprocess service and returns `stable-pass`.

## Install

```bash
dsh plugin --profile web add dsh-flakefinder
```

## Uninstall

```bash
dsh plugin --profile web remove dsh-flakefinder
```

Then restart the web service. To clean up fully, also remove the plugin entry from your profile `cordis.patch.yml` if you overrode it.


## Example

```text
User: src/checkout.test.ts keeps failing recently, is it real?
Agent:
  flaky_detect(target="src/checkout.test.ts", runs=5)
  -> verdict: flaky (3/5 passed; failures cluster on fake timers)
  -> flaky_quarantine(tests=["src/checkout.test.ts > timer restore"], reason="timer race")
```

## Config

See `cordis.patch.yml`; defaults: `defaultRuns=5`, `maxRuns=20`, `timeoutMs=120000`, `writeApproval=true`, `pythonPath=python` (`python3` on Linux/macOS; used for pytest runs).

## Development

```bash
pnpm test
pnpm typecheck
```

MIT
