# dsh-flakefinder usage guide

## Confirmation in Full Access

The plugin keeps its confirmation requirement. With approval policy `never`, it reports that confirmation is unavailable and performs no write. Switch to a mode that can ask, or explicitly set `writeApproval: false` yourself. Host denials still apply.

[Overview](../README.en.md) · [Changelog](../CHANGELOG.md) · [Validation](VALIDATION.md)

## Current improvements

Relative quarantineFile defaults to .flakefinder.json in the current workspace. Cancellation stops the current process. Concurrent writers preserve history and quarantine entries; damaged files are preserved with explicit errors for inspection.

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

## Troubleshooting

Run `flaky_health` first: it checks the Python interpreter and pytest availability and summarizes the defaults.

| Symptom | Usual cause | What to do |
| :-- | :-- | :-- |
| Verdict says no tests were parsed | `target` matched nothing, or only skipped tests | Point `target` at real test files/directories (globs work), or pass `framework` explicitly |
| "N runs produced no report" | Framework CLI missing, unsupported reporter flag, pytest lacking junitxml | Run the same command once by hand to see the real error; make sure the temp directory is writable |
| `framework=vitest` cannot find `node_modules/vitest` | Not installed, or invoked outside the project | Call it from the project that installed the framework, or set `framework` |
| pytest-related failure | Interpreter or pytest missing | `pip install pytest`, or point `pythonPath` at the right interpreter |
| Quarantine/clear removed 0 entries | Reference format or path does not match the list | Use `"file path > test name"`; check existing entries with `flaky_report` |

The `flaky_detect` summary always ends with the next step: quarantine flaky tests, reproduce stable failures, or clear recovered ones.

## Development

```bash
pnpm test
pnpm typecheck
```

MIT
