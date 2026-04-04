# Circe Architecture

## Overview

Circe is a **GAN-style multi-agent framework** that turns natural language prompts into full-stack applications. Inspired by Anthropic's [Harness Design for Long-Running Application Development](https://www.anthropic.com/engineering/harness-design-long-running-apps) paper — agents autonomously build, test, and refine applications in an adversarial loop.

Core insight: every harness component encodes an assumption about what the LLM cannot do. As models improve, these assumptions must be re-validated.

## Project Structure

```
src/
├── agent.ts              # Core agent abstraction (Agent, agent(), loadAgent())
├── handoff.ts            # Agent-to-agent communication schemas (Zod)
├── session.ts            # Session + AsyncLocalStorage context propagation
├── context.ts            # Context getters (session-aware with global fallback)
├── types.ts              # RunContext, Runnable interface
├── cli/                  # CLI interface (Commander-based)
│   ├── index.ts          # Entry point (circe command)
│   ├── run.ts            # Workflow execution engine
│   ├── output.ts         # Terminal formatter (Chalk)
│   ├── agents-cmd.ts     # Agent CRUD commands
│   └── workflows-cmd.ts  # Workflow CRUD commands
├── orchestration/        # 5 composable orchestration patterns
│   ├── pipeline.ts       # Sequential execution
│   ├── loop.ts           # Conditional iteration
│   ├── parallel.ts       # Concurrent execution
│   ├── contract.ts       # Proposal-review negotiation
│   └── sprint.ts         # Feature decomposition
├── tools/                # Tool & skill registry
│   ├── custom.ts         # tool() decorator
│   └── skills.ts         # SkillRegistry (SKILL.md discovery)
└── utils.ts              # Shared utilities (circeHome, PLAYWRIGHT_MCP_SERVER)
```

## Layer Architecture

```
┌─────────────────────────────────────────────┐
│  CLI Layer                                   │
│  Input parsing, workflow loading, output      │
├─────────────────────────────────────────────┤
│  Orchestration Layer                         │
│  Pipeline, Loop, Parallel, Contract, Sprint  │
├─────────────────────────────────────────────┤
│  Agent Layer                                 │
│  Agent: Claude Agent SDK wrapper              │
├─────────────────────────────────────────────┤
│  Tool Layer                                  │
│  SDK built-in tools, MCP servers, Skills     │
└─────────────────────────────────────────────┘
```

---

## Core Components

### 1. Agent (`agent.ts`)

Base class for all agents. Wraps the Claude Agent SDK for structured execution.

```typescript
class Agent<TIn = string, TOut = string> implements Runnable<TIn, TOut> {
  name: string;                      // "planner", "generator", etc.
  prompt: string;                    // System prompt
  model: string | undefined;         // "claude-sonnet-4-6" (per-agent model)
  tools: string[] | null;            // ["Read", "Bash"] or null (allow all)
  skills: string[];                  // ["qa", "browse"]
  contextStrategy: "compaction" | "reset";
  permissionMode: string;            // "bypassPermissions"
  continueSession: boolean;          // Reuse session across runs
  inputSchema: ZodSchema | null;     // Input validation (optional)
  outputSchema: ZodSchema | null;    // Auto JSON parsing + SDK outputFormat

  async run(input: TIn): Promise<TOut>
}
```

**Key features:**
- Generic `<TIn, TOut>` for compile-time type safety in agent chains
- Optional input validation via `inputSchema` (Zod)
- Auto JSON output parsing when `outputSchema` is set; SDK `outputFormat` for model-level JSON guarantee
- Token counting with cache-inclusive totals
- Cost tracking from SDK's `total_cost_usd`, exposed via `lastMetrics`
- Skill summary auto-injected into system prompt

**`agent()` factory:** Creates an Agent from a config object.

**`loadAgent(name)`:** Dynamically loads an agent from `~/.circe/agents/<name>.json`.

### 2. Handoff Schemas (`handoff.ts`)

Zod schemas for structured agent-to-agent communication:

| Schema | Purpose | Flow |
|--------|---------|------|
| `FeatureSchema` | Single feature definition | name, description |
| `TechStackSchema` | Technology stack choice | frontend, backend, database |
| `ProductSpecSchema` | Planning output | Planner → Generator |
| `BuildResultSchema` | Build output | Generator → Evaluator |
| `QAReportSchema` | QA evaluation result | Evaluator → Loop (or exit) |

### 3. Orchestration Patterns (`orchestration/`)

Five composable patterns:

| Pattern | Description | Example |
|---------|-------------|---------|
| **Pipeline** | Sequential (A → B → C) | `new Pipeline(planner, builder, tester)` |
| **Loop** | Repeat until condition or max rounds | `new Loop(gen, eval, { maxRounds: 3, stopWhen: ... })` |
| **Parallel** | Concurrent, merge results by name | `new Parallel(frontendGen, backendGen)` |
| **Contract** | Proposal-review negotiation loop | `new Contract(proposer, reviewer, { maxRounds: 3 })` |
| **Sprint** | Decompose into features, run each | `new Sprint(innerOrchestrator)` |

All patterns implement `Runnable<TIn, TOut>` and **compose recursively**. Loop and Contract return producer output on success (`.lastEvaluatorResult` for evaluation). All orchestrators expose `.lastMetrics` for cost tracking. Use `pipe()` for type-safe pipeline composition:

```typescript
new Pipeline(
  planner,
  new Contract(proposer, reviewer),
  new Loop(generator, evaluator, { maxRounds: 3 })
)
```

### 4. Skill Registry (`tools/skills.ts`)

On-demand prompt templates loaded by agents at runtime:

```
~/.circe/skills/
├── qa/
│   └── SKILL.md       # QA testing methodology
├── browse/
│   └── SKILL.md       # Web navigation patterns
└── code-review/
    └── SKILL.md       # Code review guide
```

SKILL.md structure:
```markdown
---
name: qa
description: Test web apps with Playwright
---
# Detailed methodology...
```

Skills are not hardcoded — agents call `use_skill("qa")` at runtime to load the full content.

### 5. Session (`session.ts`)

Zero-config context management via `AsyncLocalStorage`:

```typescript
const session = new Session({ outputDir: "./output", verbose: true });
await session.run(() => orchestrator.run(input));
```

- Auto-creates outputDir, OutputFormatter, SkillRegistry
- Context propagates through any orchestrator nesting depth
- Parallel sessions are isolated (no shared global state)
- Teardown (formatter.close()) runs in finally block

---

## How It Works

### GAN-Style Adversarial Loop

The core of Circe is the **Generator-Evaluator adversarial loop**:

```
                    ┌──────────────┐
                    │   Planner    │
                    └──────┬───────┘
                           │ ProductSpec
                           ↓
                    ┌──────────────┐
                    │   Contract   │
                    │  (negotiation)│
                    └──────┬───────┘
                           │ Agreed criteria
                           ↓
               ┌───────────────────────┐
               │   BUILD-QA LOOP      │
               │                       │
               │  ┌─────────────┐     │
           ┌──→│  │  Generator  │     │
           │   │  │  (build/fix) │     │
           │   │  └──────┬──────┘     │
           │   │         │ BuildResult │
           │   │         ↓            │
           │   │  ┌─────────────┐     │
           │   │  │  Evaluator  │     │
           │   │  │  (test/grade)│     │
           │   │  └──────┬──────┘     │
           │   │         │ QAReport   │
           │   └─────────┼───────────┘
           │             │
           │   passed=false?
           └─── feedback ┘
                         │
                   passed=true?
                         ↓
                    Final result
```

**Why this structure:**
1. **Eliminates self-evaluation bias** — models are too lenient grading their own work. Separating Generator and Evaluator removes this bias.
2. **Iterative improvement** — feedback loops drive quality up each round.
3. **Deterministic termination** — `QAReport.passed === true` or `maxRounds` reached.

### Context Strategy

| Strategy | When to use |
|----------|-------------|
| **compaction** (default) | Most cases. Agent SDK auto-summarizes context mid-conversation. |
| **reset** | Weaker models or long Sprint-based builds. Clean context per sprint. |

Compaction prevents "context anxiety" — the tendency for agents to terminate early as the context window fills up.

---

## CLI Usage

```bash
# Run a workflow file
circe run workflow.js -i "spec.md" -o ./my-output -v

# Skill management
circe skills list
circe skills create my-skill
circe skills info my-skill
```

### Output Structure

Execution creates a slug-based directory under `./output/`:

```
./output/memo-app/
├── circe.log          # Full execution log
├── _status.md         # Generator progress tracking
├── _scores.md         # Evaluator score history (frontend-design)
├── screenshots/       # Per-round screenshots (frontend-design)
│   ├── round-1/
│   └── round-2/
└── (generated app files)
```

---

## Design Principles

### Runnable Interface

All agents and orchestrators implement the same generic interface:

```typescript
interface Runnable<TIn = unknown, TOut = unknown> {
  name?: string;
  lastMetrics?: MetricsSnapshot | null;
  run(input: TIn): Promise<TOut>;
}
```

This allows free composition with compile-time type checking. `pipe(a, b)` verifies that `a`'s output type matches `b`'s input type.

### Structured Handoffs

Agent-to-agent data passing is enforced via Zod schemas. Generator knows exactly what Planner outputs; Evaluator returns structured feedback. Optional `inputSchema` validates inputs at the boundary.

### Progressive Elimination

Each framework component encodes an assumption about model limitations. As models improve:
- Remove Sprint and run in a single context
- Switch from context reset to compaction
- Skip the Contract phase and build directly

Every component is optional and replaceable.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/claude-agent-sdk` | Claude agent execution |
| `zod` | Handoff schema validation |
| `zod-to-json-schema` | Zod → JSON Schema for SDK outputFormat |
| `commander` | CLI framework |
| `chalk` | Terminal output formatting |

Requires Node.js 22+.
