# Circe

[![npm version](https://img.shields.io/npm/v/@hham21/circe)](https://www.npmjs.com/package/@hham21/circe)
[![npm downloads](https://img.shields.io/npm/dw/@hham21/circe)](https://www.npmjs.com/package/@hham21/circe)
[![license](https://img.shields.io/npm/l/@hham21/circe)](https://github.com/hham21/circe/blob/main/LICENSE)

Composable multi-agent orchestration framework built on the [Claude Agent SDK](https://github.com/anthropic/claude-agent-sdk). ~2K lines of source, 5 dependencies.

Five building blocks — Pipeline, Loop, Parallel, Contract, Sprint — snap together like LEGO to create complex agent workflows. Runs in the Claude Code ecosystem with OAuth (free) or API key.

Originally inspired by Anthropic's [harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps). Works for any agent composition pattern — not just adversarial loops.

## Install

```bash
npm install @hham21/circe
```

Requires Node.js 22+ and Claude authentication (API key or OAuth):

```bash
# API key
export ANTHROPIC_API_KEY=sk-ant-...

# Or OAuth (Claude App, Claude Code, etc.)
# The Agent SDK detects OAuth tokens automatically
```

## Quick Start

```typescript
import { Agent, Loop, Session } from "@hham21/circe";

const generator = new Agent({
  name: "generator",
  prompt: "Build the app based on the spec or QA feedback.",
  model: "claude-sonnet-4-6",
});

const evaluator = new Agent({
  name: "evaluator",
  prompt: "Test the app. FAIL with feedback if issues found.",
  model: "claude-opus-4-6",
});

const loop = new Loop(generator, evaluator, { maxRounds: 3 });

await new Session({ outputDir: "./output", logLevel: "debug" })
  .run(() => loop.run("Build a retro game maker"));
```

See [examples/](examples/README.md) for 14 progressive examples (`npx tsx examples/01-single-agent.ts`).

## Concepts

### Agents

```typescript
import { Agent, agent } from "@hham21/circe";

// Factory function (simple)
const reviewer = agent({
  name: "reviewer",
  prompt: "Review code for bugs.",
  tools: ["Read", "Grep"],
});

// Class (fine-grained control)
const evaluator = new Agent({
  name: "evaluator",
  prompt: "Strict QA engineer.",
  model: "claude-opus-4-6",
  tools: ["Read", "Bash"],
  disallowedTools: ["Write"],
  skills: ["qa"],
  contextStrategy: "reset",
});
```

All Claude Agent SDK built-in tools (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent) are available by default. Restrict with `tools` (allowlist) or `disallowedTools` (blocklist). Set `model` per agent to control cost/capability.

#### Structured Output

Use Zod schemas to validate agent input and output:

```typescript
import { Agent } from "@hham21/circe";
import { z } from "zod";

const planner = new Agent({
  name: "planner",
  prompt: "Break the spec into features.",
  outputSchema: z.object({
    features: z.array(z.object({
      name: z.string(),
      description: z.string(),
    })),
  }),
});

const result = await planner.run("Build a todo app");
// result is typed and validated against the schema
```

#### Full Agent Options

| Option | Type | Description |
|---|---|---|
| `name` | `string` | Agent name (required) |
| `prompt` | `string` | System prompt (required) |
| `model` | `string` | Claude model ID |
| `tools` | `string[]` | Allowed tools (allowlist) |
| `disallowedTools` | `string[]` | Blocked tools (blocklist) |
| `skills` | `string[]` | On-demand prompt templates |
| `mcpServers` | `Record<string, unknown>` | MCP server config |
| `contextStrategy` | `"compaction" \| "reset"` | Context management |
| `inputSchema` | `ZodSchema` | Validate input |
| `outputSchema` | `ZodSchema` | Validate & type output |
| `permissionMode` | `string` | Tool permission mode |
| `continueSession` | `boolean` | Resume previous session |
| `costPerMTokens` | `{ input, output }` | Custom cost rates |
| `timeout` | `number` | Max execution time (ms) |

### Orchestrators

Five composable building blocks, all generic: `Runnable<TIn, TOut>`.

| Orchestrator | Purpose | Example |
|---|---|---|
| `Pipeline` | Sequential execution | `new Pipeline(planner, builder)` or `pipe(a, b, c)` |
| `Loop` | Repeat until condition | `new Loop(gen, eval, { maxRounds: 3, stopWhen: ... })` |
| `Parallel` | Concurrent execution | `new Parallel(frontend, backend)` |
| `Contract` | Pre-build negotiation | `new Contract(proposer, reviewer, { isAccepted: ... })` |
| `Sprint` | Feature decomposition | `new Sprint(runner)` |

Loop and Contract return **producer output on success** (the content, not the evaluation). Access evaluation via `.lastEvaluatorResult`. All orchestrators expose `.lastMetrics` for cost tracking.

`Parallel` returns a `Record<string, { status: "fulfilled", value } | { status: "rejected", error }>`. `Sprint` returns `{ sprintResults: TOut[] }`.

Compose freely:

```typescript
import { pipe, map } from "@hham21/circe";

// Type-safe pipeline — compiler checks that output types chain correctly
pipe(planner, new Loop(generator, evaluator, { maxRounds: 3 }));

// With negotiation
pipe(planner, new Contract(proposer, reviewer), new Loop(generator, evaluator));

// map() wraps a pure function as a Runnable for inline transforms between steps
pipe(
  planner,
  map((spec) => ({ ...spec, features: spec.features.slice(0, 3) })),
  new Loop(generator, evaluator, { maxRounds: 3 }),
);
```

### Events & Observability

`EventBus` tracks cost, emits lifecycle events, and enforces budget limits across all orchestrators:

```typescript
import { EventBus } from "@hham21/circe";

const bus = new EventBus({ maxCost: 5.0 }); // throws if exceeded

bus.on("agent:done", (e) => console.log(`${e.agent}: $${e.cost.toFixed(4)}`));
bus.on("round:done", (e) => console.log(`Round ${e.round} complete`));
bus.on("retry", (e) => console.log(`Retrying ${e.agent} (${e.attempt}/${e.maxAttempts})`));

const loop = new Loop(generator, evaluator, {
  maxRounds: 3,
  eventBus: bus,
});

await loop.run(input);
console.log(bus.getCostSummary()); // { total: 1.23, perAgent: { generator: 0.8, evaluator: 0.43 } }
```

Event types: `agent:start/done/error`, `step:start/done/error` (Pipeline), `round:start/done/error` (Loop/Contract), `branch:start/done/error` (Parallel), `sprint:start/done/error` (Sprint), `retry`, `pipeline:done`, `cost:pressure`, `cost:warning`.

#### Graduated Cost Control

Beyond the hard `maxCost` limit, Circe emits a **costPressure signal** (0.0–1.0 fraction of budget consumed) on every cost tick. Orchestrators check `session.shouldStop` between steps so workflows can exit cleanly when the budget tightens instead of crashing mid-round. Configure thresholds via `Session.costPolicy` (see [Session](#session) below). `round:done` events also carry `costByAgent` for per-agent attribution.

### Retry

All orchestrators accept a `retryPolicy` for automatic retries with exponential backoff:

```typescript
const loop = new Loop(generator, evaluator, {
  maxRounds: 3,
  retryPolicy: { maxRetries: 2 },
  eventBus: bus,
});
```

Defaults: exponential backoff (1s-60s), skips non-retryable errors (400, 401, 403). Customize with `backoff` and `shouldRetry` functions.

### Session

Session eliminates boilerplate. It auto-creates the output directory, sets up logging, initializes the skill registry, and cleans up when done. Context propagates through any orchestrator nesting via `AsyncLocalStorage`.

```typescript
import { Session } from "@hham21/circe";

const session = new Session({
  outputDir: "./output/my-app",
  logLevel: "debug", // "silent" | "info" | "debug" | "trace"
  maxCost: 5.0,      // hard budget in USD (throws at 100%)
  costPolicy: {      // graduated pressure thresholds (fractions of maxCost)
    warn: 0.7,       // emits cost:warning event at 70%
    softStop: 0.9,   // sets session.shouldStop at 90% (orchestrators exit cleanly)
    hardStop: 1.0,   // throws Error at 100%
  },
  agentCostLimits: { generator: 2.0, evaluator: 1.0 }, // per-agent USD caps
});
await session.run(() => pipeline.run("Build a todo app"));

console.log(`Duration: ${session.duration.toFixed(1)}s`);
```

Without Session, you can still use the global setters (`setFormatter`, `setWorkDir`, `setSkillRegistry`) directly.

### Tools

MCP servers are supported via the `mcpServers` parameter on agents:

```typescript
const agent = new Agent({
  name: "researcher",
  prompt: "Research the topic.",
  mcpServers: {
    "web-search": { command: "npx", args: ["-y", "@anthropic-ai/mcp-web-search"] },
  },
});
```

### Skills

Skills are on-demand prompt templates. Agents load them when needed:

```typescript
const evaluator = agent({
  name: "evaluator",
  prompt: "QA engineer.",
  skills: ["qa"],
});
```

The agent sees a skill list in its prompt and calls `use_skill("qa")` to load the full methodology.

### Context Strategy

| Strategy | When to use |
|---|---|
| `compaction` (default) | Most cases. Agent SDK auto-summarizes context. |
| `reset` | Weaker models or long Sprint-based builds. Clean context per sprint. |

### Handoff Schemas

Zod schemas for structured agent-to-agent data passing:

- `ProductSpecSchema` — Planner output
- `BuildResultSchema` — Generator output
- `QAReportSchema` — Evaluator output

## CLI

```bash
# Run a workflow file
circe run workflow.js -i "prompt or spec file" -v

# Skill management
circe skills list
circe skills create my-skill
circe skills info my-skill
circe skills delete my-skill
```

## Architecture

```
Session Layer      Session (AsyncLocalStorage context propagation)
CLI Layer          circe run, skills
Orchestration      Pipeline, Loop, Parallel, Sprint, Contract
Agent Layer        Agent, agent(), Handoff, Context Strategy
Tool Layer         SDK built-ins, MCP servers, Skills
```

## Development

```bash
npm install
npm test
npm run build
```
