# dsh-flakefinder usage guide

## Confirmation in Full Access

The plugin keeps its confirmation requirement and displays the full list of tests to be quarantined or cleared (plus reason/issue for `flaky_quarantine`) inside the approval prompt. With approval policy `never`, it reports that confirmation is unavailable and performs no write. Switch to a mode that can ask, or explicitly set `writeApproval: false` yourself. Host denials still apply.

[Overview](../README.en.md) · [Changelog](../CHANGELOG.md) · [Validation](VALIDATION.md)

## Highlights

- **Workspace-aware & isolated**: Detection history is stored per workspace under `dataDir/workspaces/<hash>.json` (while remaining compatible with legacy `history.json`). Relative `quarantineFile` defaults to `.flakefinder.json` in the active session workspace, normalizing paths to workspace-relative POSIX paths and rejecting out-of-workspace absolute paths.
- **Fast targeted reruns**: Supports test-name filtering (`testName`), early-stop modes (`until-flaky` / `verify-fix`), bounded concurrency (`1`–`4` workers), coverage disabled by default (`noCoverage`), and order shuffling with reproducible seeds (`shuffle` / `seed`).
- **Root-cause diagnostics & confidence**: Deduplicates failures into error clusters (normalizing timestamps/UUIDs/ports and redacting secrets in stacks), renders per-run timelines (`✓`/`✗`/`⏱`/`S`/`-`), compares passing vs. failing durations, infers 6 flake patterns (`cold-start`, `state-leak`, `timeout-race`, `order-dependent`, `teardown-crash`, `intermittent`), and prints 95% confidence upper bounds on all-pass runs.
- **Quarantine loop & reporting**: `flaky_detect` cross-checks `.flakefinder.json` to tag `[新增未隔离]` / `[已隔离]` flaky tests and surface `clearCandidates`; `flaky_report` adds top flaky hotspots and stale quarantine reminders.
- **Safety & resilience**: Cancellation aborts active test processes without writing partial history; concurrent writes use `proper-lockfile`; corrupt JSON files fail loudly while preserving the original file; payloads with >60 tests automatically cap `stable-pass` entries to protect context size.

## Tools

| Tool | Purpose | Write |
| :-- | :-- | :-- |
| `flaky_detect` | Repeat tests N times with timeline, error clusters, root-cause patterns, and quarantine sync | history only |
| `flaky_history` | Query detection history, filter by `target`, switch `scope` (`workspace` / `all`) | no |
| `flaky_report` | Combine quarantine manifest, top flaky hotspots, stale quarantine alerts, and history | no |
| `flaky_quarantine` | Add or update flaky entries in `.flakefinder.json` (with optional `issue` / `lastFailureRate`) | yes (approval) |
| `flaky_clear` | Remove recovered cases from the quarantine manifest | yes (approval) |
| `flaky_health` | Workspace-aware health check: Node version, detected frameworks, Python/pytest, store readability, defaults | no |

### `flaky_detect` parameters

| Parameter | Type | Default | Description |
| :-- | :-- | :-- | :-- |
| `target` | `string` (required) | — | Test file, directory, or glob relative to workspace (cannot start with `-`) |
| `framework` | `enum` | `auto` | `auto` / `vitest` / `jest` / `pytest` / `node` (aliases `node:test`, `py` also accepted) |
| `runs` | `integer` | `defaultRuns` | Repeat count (`3`–`maxRuns`) |
| `testName` | `string` | — | Filter tests by name/pattern (Vitest/Jest `-t`, pytest `-k`, `node:test` `--test-name-pattern`) |
| `mode` | `enum` | `full` | `full` (run all) / `until-flaky` (stop once flake confirmed) / `verify-fix` (stop on first failure) |
| `concurrency` | `integer` | `defaultConcurrency` | Worker concurrency (`1`–`4`) |
| `shuffle` | `boolean` | `false` | Randomize test order (Vitest/Jest; generates a distinct seed per run if `seed` is omitted) |
| `seed` | `integer` | — | Explicit RNG seed (`0`–`2147483647`) for reproducible shuffled runs |
| `noCoverage` | `boolean` | `noCoverage` config | Disable coverage collection during reruns (Vitest/Jest, default `true`) |

### Supported frameworks

- **vitest**: Walks up from workspace to locate hoisted `node_modules/vitest/vitest.mjs`; JSON reporter; supports `-t`, `--coverage.enabled=false`, `--sequence.shuffle --sequence.seed=...`.
- **jest**: Walks up to locate `node_modules/jest/bin/jest.js`; `--json --outputFile`; uses `--runInBand` when serial and unshuffled; supports `-t`, `--coverage=false`, `--randomize --seed=...`.
- **pytest**: Resolves Python in priority order `explicit pythonPath > DSH_FLAKEFINDER_PYTHON > VIRTUAL_ENV > workspace .venv/venv > platform default`, runs `python -m pytest -q --junitxml=...` with `-k`, CDATA/XML entity decoding, and `<system-err>` fallback.
- **node:test**: Runs `node --test --test-reporter=tap` with `--test-name-pattern=...`, hierarchical TAP 13 + YAML diagnostic block parsing, `SKIP`/`TODO` handling, and `Bail out!` detection.
- `framework: auto` detects in order: `vitest → jest → pytest → node:test`.

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
User: The timer test in src/checkout.test.ts keeps flaking in CI, can you investigate?
Agent:
  flaky_detect(target="src/checkout.test.ts", testName="timer restore", runs=10, concurrency=2, mode="until-flaky")
  -> verdict: flaky (ran 4/10; timeline ✓✓✗✓; pattern: timeout-race; clustered TimeoutError)
  -> flaky_quarantine(tests=["src/checkout.test.ts > timer restore"], reason="timer race", issue="#12", lastFailureRate=25)

User: Fixed the timer cleanup — please verify it stays green.
Agent:
  flaky_detect(target="src/checkout.test.ts", testName="timer restore", runs=15, mode="verify-fix")
  -> verdict: stable-pass (95% confidence residual flake rate <= 18.1%; clear candidate detected)
  -> flaky_clear(tests=["src/checkout.test.ts > timer restore"])
```

## Config

See `cordis.patch.yml`. Key options:

| Field | Default | Description |
| :-- | :-- | :-- |
| `defaultRuns` | `5` | Default rerun count for `flaky_detect` (`3`–`20`) |
| `maxRuns` | `20` | Maximum allowed rerun count (`3`–`50`) |
| `defaultConcurrency` | `1` | Default worker concurrency (`1`–`4`) |
| `noCoverage` | `true` | Disable coverage collection during Vitest/Jest reruns |
| `staleQuarantineDays` | `14` | Days before a quarantine entry is flagged as stale in `flaky_report` (`1`–`365`) |
| `timeoutMs` | `120000` | Per-run timeout in milliseconds (`10000`–`600000`) |
| `graceMs` | `10000` | Grace period after timeout (`1000`–`120000`) |
| `writeApproval` | `true` | Gate `flaky_quarantine` and `flaky_clear` behind host approval |
| `dataDir` | `DSH_HOME/.dsh-flakefinder` | Root directory for workspace-isolated history |
| `quarantineFile` | `<cwd>/.flakefinder.json` | Quarantine manifest path (relative paths resolve against the session workspace) |
| `pythonPath` | auto `.venv` or `python`/`python3` | Python interpreter for pytest runs (`DSH_FLAKEFINDER_PYTHON` supported) |

## Requirements & runtime

- Requires **Node `>= 22.19`** (`^22.19.0 || >=24.0.0`) and **DSH `>= 0.2.2-rc.3`**.
- Runtime dependencies: `proper-lockfile` and `@stardustlc/dsh-updates`.
- Test subprocesses always execute via DSH's `subprocess` service using `argv` arrays (no shell).

## Troubleshooting

Run `flaky_health` first: it inspects the active workspace's Node version, auto-detected test framework paths, Python/pytest (missing pytest is treated as informational/optional in JS-only workspaces and only fails health when pytest config is present or `pythonPath` is explicitly configured), `.flakefinder.json` and history readability, and default config.

| Symptom | Usual cause | What to do |
| :-- | :-- | :-- |
| Verdict says no tests were parsed | `target` or `testName` matched nothing, or only skipped tests | Point `target` at real test files/directories (globs work), verify `testName`, or pass `framework` explicitly |
| Run anomaly / timeout / truncated output | Missing CLI, per-run timeout exceeded, TAP output > 4MB, or post-assertion teardown crash | Inspect error clusters and stderr tail; raise `timeoutMs` or narrow scope with `testName` |
| `framework=vitest` cannot find `node_modules/vitest` | Not installed, or invoked outside the project/monorepo | Run inside the repository that installed Vitest, or set `framework` |
| Python workspace `flaky_health` fails on pytest | Virtualenv or pytest missing | Run `pip install pytest`, or point `pythonPath` at the right interpreter |
| Quarantine/clear matched 0 entries | Reference format or path does not match the manifest | Use `"relative/path > test name"`; inspect current entries with `flaky_report` |

The `flaky_detect` summary always ends with the next step: quarantine new flaky tests, reproduce stable failures, or clear recovered quarantine entries.

## Development

```bash
pnpm test
pnpm typecheck
```

MIT
