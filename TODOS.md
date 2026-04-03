# TODOS

## Type-safe Runnable generics

**What:** Change `Runnable` from `run(input: unknown): Promise<unknown>` to `Runnable<TIn, TOut>` with `run(input: TIn): Promise<TOut>`. Enable compile-time type checking for Pipeline agent chains (A's output type matches B's input type).

**Why:** Currently Pipeline passes `unknown` between agents. A type mismatch between agent output and next agent's expected input only surfaces at runtime. With generics, TypeScript catches it at compile time.

**Pros:** Compile-time safety for agent composition. Better IDE autocomplete. Self-documenting agent interfaces.

**Cons:** Significant refactoring. All orchestrator primitives, presets, and tests need updating. Generic inference for variadic Pipeline composition is complex in TypeScript.

**Context:** The current `unknown` approach works because BaseAgent handles input/output parsing via Zod schemas. But the Zod validation happens inside run(), so the orchestrator can't verify compatibility before execution. This becomes more important as the number of presets and user-defined pipelines grows.

**Depends on / blocked by:** EventBus + RetryPolicy work should land first. This is a standalone refactoring PR.

## SDK outputFormat for structured JSON output

**What:** When `outputSchema` is set on BaseAgent, pass `outputFormat: { type: 'json_schema', schema }` to the SDK query options. This makes the model guarantee JSON output at the model level, removing the need for "Output JSON only" in prompts.

**Why:** Currently `outputSchema` only parses the response after the fact (`parseResult()` → `extractJson()` → `JSON.parse()` → `zod.parse()`). If the model returns natural language, `extractJson()` fails silently and returns the raw string. Adding `outputFormat` to the SDK call makes JSON output a hard constraint, not a prompt-level suggestion.

**Pros:** Reliable structured output. Simpler prompts (no "Output JSON only" boilerplate). `parseResult()` can skip the extractJson heuristic when outputFormat is active.

**Cons:** Requires converting Zod schemas to JSON Schema format for the SDK. Need to verify SDK `outputFormat` compatibility with all model versions Circe supports.

**Context:** SDK docs show `outputFormat: { type: 'json_schema', schema: JSONSchema }` as a query option. Zod has `zod-to-json-schema` for conversion. After this, examples like 03-loop and 08-code-review can drop the "Output JSON only" prompt instruction.

**Depends on / blocked by:** None. Standalone improvement.
