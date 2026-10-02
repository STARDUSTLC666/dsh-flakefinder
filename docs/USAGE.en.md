# dsh-flakefinder usage guide

[Overview](../README.en.md) · [Changelog](../CHANGELOG.md) · [Validation](VALIDATION.md)

## Tools

| Tool | Purpose | Write |
| :-- | :-- | :-- |
| `flaky_detect` | Repeat tests N times and classify stable-pass / stable-fail / flaky | history only |
| `flaky_history` | Query detection history, filter by target | no |
| `flaky_report` | Combine quarantine manifest and history into a report | no |
| `flaky_quarantine` | Write flaky cases to `.flakefinder.json` | yes (approval) |
| `flaky_clear` | Remove recovered cases from the manifest | yes (approval) |

Frameworks: vitest / jest / pytest (setup.cfg / pyproject / pytest.ini / tox.ini) / node:test, auto-detected in that order. JUnit XML entities and TAP SKIP directives are parsed.

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
