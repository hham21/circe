# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Prior versions (0.4.0–0.5.4): see git history.

## [0.6.0] - 2026-04-11

### Added

- **Graduated cost control** on `Session`: `maxCost`, `costPolicy` (`warn`/`softStop`/`hardStop` threshold fractions), and `agentCostLimits` for per-agent USD caps. Orchestrators now check `session.shouldStop` between steps so workflows exit cleanly when the budget tightens instead of crashing mid-round.
- **`costPressure` signal** (0.0–1.0 fraction of budget consumed) emitted via new `cost:pressure` and `cost:warning` events. `round:done` events now carry `costByAgent` for per-agent attribution.
- **`map()` composition helper** — wraps a pure function as a `Runnable<TIn, TOut>` for inline transforms between pipeline steps.
- **3-tier `logLevel` observability** on `Session`: `"silent" | "info" | "debug" | "trace"`. Adds structured tool logging with timestamps, and full agent result payloads at `trace` level.
- **Narrative-readable CLI logger** with kind markers — more scannable output for long-running agent workflows.

### Changed

- CLI output formatter rewritten for clarity: dual-write paths unified via `emit()` helper, preview length bumped from 50 to 80 chars.
- `agent:done` events now emit from `runWithOptionalRetry` so leaf events are never swallowed by retry wrappers.

### Deprecated

- **`Session({ verbose: true })`** — use `Session({ logLevel: "debug" })` instead. The `verbose` boolean still works (maps to `logLevel: "debug"`) but will be removed in a future major release. The CLI `-v`/`--verbose` flag still works and will migrate alongside the boolean option.

### Fixed

- `agent:done` events now emit correctly from leaf agents inside `runWithOptionalRetry` (previously silent on retry paths).
- `tool_use_id` is now parsed from message content blocks instead of `parent_tool_use_id`, fixing tool correlation in nested agent calls.
- Examples 01–13 migrated from the deprecated `verbose` boolean to `logLevel`.
