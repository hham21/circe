# TODOS

## ~~Session metrics aggregation (v0.5.1)~~ → bundled into v0.6.0 Phase 1
Resolved: `session.metrics` delegates to EventBus.getCostSummary() + costPressure. Session reads EventBus via AsyncLocalStorage (store.ts). No need for Agent push pattern.

## Pipeline.resumeOnRerun (post v0.6.0)
Auto-resume from previous execution when softStop caused early termination. Pipeline detects prior progress from EventBus history (last completed step:done event) and resumes from that point. Depends on: v0.6.0 costPolicy + shouldStop infrastructure. Context: During v0.6 eng review, identified that softStop + resume is a common use case but manual resume(history, input) is awkward. resumeOnRerun flag would make Pipeline.run() automatically detect and resume from prior execution within the same EventBus context.
