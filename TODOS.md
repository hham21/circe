# TODOS

## Session metrics aggregation (v0.5.1)
Add `get metrics()` to Session that aggregates cost/tokens across all Agent calls within the session scope. Challenge: Session doesn't know which orchestrator ran inside `session.run()` (fn is a closure). Options: (a) Agent pushes metrics to session via AsyncLocalStorage on each run() completion, (b) user reads orchestrator.lastMetrics directly (current workaround). Duration is already included in v0.5.0 via `get duration()`.
