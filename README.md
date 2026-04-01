# Circe

GAN-style multi-agent framework that turns prompts into full-stack applications.

Inspired by Anthropic's [Harness Design for Long-Running Application Development](https://www.anthropic.com/engineering/harness-design-long-running-apps) — a Planner, Generator, and Evaluator work together in an adversarial loop to build, test, and refine applications autonomously.

## Install

```bash
git clone https://github.com/hham21/circe.git
cd circe
npm install
```

Requires Node.js 22+ and [Claude Code](https://claude.ai/code) authenticated via OAuth or API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Run examples with `npx tsx`:

```bash
npx tsx examples/01-single-agent.ts
npx tsx examples/02-pipeline.ts
npx tsx examples/03-loop.ts
npx tsx examples/04-parallel.ts
npx tsx examples/05-contract.ts
npx tsx examples/06-combo.ts
npx tsx examples/07-loop-fail.ts
npx tsx examples/08-frontend-design.ts
```

## Quick Start

### Using a preset

```bash
circe run fullstack --preset -i "Build a browser-based DAW"
circe run frontend-design --preset -i "Dutch art museum website"
```

### Programmatic usage

```typescript
import { Pipeline, Loop, agent } from "circe";

const planner = agent({
  name: "planner",
  prompt: "Expand the user prompt into a detailed product spec.",
});

const generator = agent({
  name: "generator",
  prompt: "Build the app based on the spec or QA feedback.",
});

const evaluator = agent({
  name: "evaluator",
  prompt: "Test the app with Playwright. FAIL with feedback if issues found.",
  tools: ["Read", "Bash", "Glob", "Grep"],
  skills: ["qa", "browse"],
});

const app = new Pipeline(
  planner,
  new Loop(generator, evaluator, { maxRounds: 3, stopWhen: (r: any) => r.passed }),
);

await app.run("Build a retro game maker");
```

## Concepts

### Agents

```typescript
import { BaseAgent, agent } from "circe";

// Factory function (simple)
const reviewer = agent({
  name: "reviewer",
  prompt: "Review code for bugs.",
  tools: ["Read", "Grep"],
});

// Class (fine-grained control)
const evaluator = new BaseAgent({
  name: "evaluator",
  prompt: "Strict QA engineer.",
  tools: ["Read", "Bash"],
  skills: ["qa"],
  contextStrategy: "reset",
});
```

All Claude Agent SDK built-in tools (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent) are available by default. Restrict with `tools`.

### Orchestrators

Five composable building blocks:

| Orchestrator | Purpose | Example |
|---|---|---|
| `Pipeline` | Sequential execution | `new Pipeline(planner, builder)` |
| `Loop` | Repeat until condition | `new Loop(gen, eval, { maxRounds: 3, stopWhen: ... })` |
| `Parallel` | Concurrent execution | `new Parallel(frontend, backend)` |
| `Contract` | Pre-build negotiation | `new Contract(proposer, reviewer)` |
| `Sprint` | Feature decomposition | `new Sprint(innerOrchestrator)` |

Compose freely:

```typescript
// Simple
new Pipeline(planner, new Loop(generator, evaluator, { maxRounds: 3 }));

// With negotiation
new Pipeline(planner, new Contract(generator, evaluator), new Loop(generator, evaluator));

// Parallel build
new Pipeline(planner, new Parallel(frontendGen, backendGen), integrationEvaluator);
```

### Tools

```typescript
import { tool } from "circe";

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
  skills: ["qa", "browse"],
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
# Run
circe run fullstack --preset -i "Build a DAW"
circe run workflow.js -i "prompt or spec file"

# Presets
circe presets

# Agent management
circe agents create my-reviewer --prompt "Review code." --tools "Read,Grep"
circe agents list
circe agents info my-reviewer
circe agents delete my-reviewer

# Workflow management
circe workflows create my-pipe --agents "planner,generator,evaluator"
circe workflows list
circe workflows delete my-pipe
```

## Architecture

```
CLI Layer          circe run, agents, workflows
Orchestration      Pipeline, Loop, Parallel, Sprint, Contract
Agent Layer        BaseAgent, agent(), Handoff, Context Strategy
Tool Layer         SDK built-ins, tool(), MCP servers, Skills
```

## Development

```bash
npm install
npm test
npm run build
```
