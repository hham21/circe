# Circe

GAN-style multi-agent framework that turns prompts into full-stack applications.

Inspired by Anthropic's [Harness Design for Long-Running Application Development](https://www.anthropic.com/engineering/harness-design-long-running-apps) — a Planner, Generator, and Evaluator work together in an adversarial loop to build, test, and refine applications autonomously.

## Install

```bash
npm install @hham21/circe
```

Requires Node.js 22+ and a Claude API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
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

await new Session({ outputDir: "./output", verbose: true })
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
  skills: ["qa"],
  contextStrategy: "reset",
});
```

All Claude Agent SDK built-in tools (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent) are available by default. Restrict with `tools`. Set `model` per agent to control cost/capability.

### Orchestrators

Five composable building blocks, all generic: `Runnable<TIn, TOut>`.

| Orchestrator | Purpose | Example |
|---|---|---|
| `Pipeline` | Sequential execution | `new Pipeline(planner, builder)` or `pipe(a, b, c)` |
| `Loop` | Repeat until condition | `new Loop(gen, eval, { maxRounds: 3, stopWhen: ... })` |
| `Parallel` | Concurrent execution | `new Parallel(frontend, backend)` |
| `Contract` | Pre-build negotiation | `new Contract(proposer, reviewer)` |
| `Sprint` | Feature decomposition | `new Sprint(runner)` |

Loop and Contract return **producer output on success** (the content, not the evaluation). Access evaluation via `.lastEvaluatorResult`. All orchestrators expose `.lastMetrics` for cost tracking.

Compose freely:

```typescript
import { pipe } from "@hham21/circe";

// Type-safe pipeline — compiler checks that output types chain correctly
pipe(planner, new Loop(generator, evaluator, { maxRounds: 3 }));

// With negotiation
pipe(planner, new Contract(proposer, reviewer), new Loop(generator, evaluator));
```

### Session

Session eliminates boilerplate. It auto-creates the output directory, sets up logging, initializes the skill registry, and cleans up when done. Context propagates through any orchestrator nesting via `AsyncLocalStorage`.

```typescript
import { Session } from "@hham21/circe";

const session = new Session({ outputDir: "./output/my-app", verbose: true });
await session.run(() => pipeline.run("Build a todo app"));

console.log(`Duration: ${session.duration.toFixed(1)}s`);
```

Without Session, you can still use the global setters (`setFormatter`, `setWorkDir`, `setSkillRegistry`) directly.

### Tools

```typescript
import { tool } from "@hham21/circe";

const searchNpm = tool(function searchNpm(query: string): string {
  // Search npm packages
  return `results for ${query}`;
});
```

MCP servers are supported via the `mcpServers` parameter on agents.

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
```

## Architecture

```
Session Layer      Session (AsyncLocalStorage context propagation)
CLI Layer          circe run, skills
Orchestration      Pipeline, Loop, Parallel, Sprint, Contract
Agent Layer        Agent, agent(), Handoff, Context Strategy
Tool Layer         SDK built-ins, tool(), MCP servers, Skills
```

## Development

```bash
npm install
npm test
npm run build
```
