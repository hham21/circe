# TODOS

## Type-safe Runnable generics

**What:** Change `Runnable` from `run(input: unknown): Promise<unknown>` to `Runnable<TIn, TOut>` with `run(input: TIn): Promise<TOut>`. Enable compile-time type checking for Pipeline agent chains (A's output type matches B's input type).

**Why:** Currently Pipeline passes `unknown` between agents. A type mismatch between agent output and next agent's expected input only surfaces at runtime. With generics, TypeScript catches it at compile time.

**Pros:** Compile-time safety for agent composition. Better IDE autocomplete. Self-documenting agent interfaces.

**Cons:** Significant refactoring. All orchestrator primitives, presets, and tests need updating. Generic inference for variadic Pipeline composition is complex in TypeScript.

**Context:** The current `unknown` approach works because BaseAgent handles input/output parsing via Zod schemas. But the Zod validation happens inside run(), so the orchestrator can't verify compatibility before execution. This becomes more important as the number of presets and user-defined pipelines grows.

**Depends on / blocked by:** EventBus + RetryPolicy work should land first. This is a standalone refactoring PR.
