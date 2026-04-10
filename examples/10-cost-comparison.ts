// Example 10: Cost Comparison
// Primitives: Pipeline, Loop, Contract (same task, 3 approaches)
// Difficulty: Advanced
// Estimated cost: ~$1.50 total
//
// Same task solved 3 different ways. Prints a comparison table.
// Demonstrates why different orchestration shapes exist — different tradeoffs.

import { Agent, Pipeline, Loop, Contract, QAReportSchema, EventBus, OutputFormatter, setFormatter } from "../src/index.js";

const verbose = process.argv.includes("--verbose");
if (verbose) setFormatter(new OutputFormatter("debug"));

const TASK = "Write a product description for a smart water bottle that tracks hydration";

// --- Approach 1: Pipeline (fast, single-pass) ---
async function runPipeline(): Promise<{ result: string; cost: number; rounds: number }> {
  const bus = new EventBus();
  const drafter = new Agent({
    name: "drafter",
    prompt: "Write a compelling product description in 2-3 sentences. Output ONLY the description.",
    disallowedTools: ["Bash", "Read", "Write", "Edit"],
  });
  const polisher = new Agent({
    name: "polisher",
    prompt: "Polish the product description for clarity and impact. Output ONLY the polished version.",
    disallowedTools: ["Bash", "Read", "Write", "Edit"],
  });
  const p = new Pipeline(drafter, polisher, { eventBus: bus });
  const result = await p.run(TASK);
  return { result: String(result), cost: bus.getCostSummary().total, rounds: 1 };
}

// --- Approach 2: Loop (iterative refinement) ---
async function runLoop(): Promise<{ result: string; cost: number; rounds: number }> {
  const bus = new EventBus();
  const writer = new Agent({
    name: "writer",
    prompt: `Write (or improve based on feedback) a product description.
Output ONLY the description text.`,
    disallowedTools: ["Bash", "Read", "Write", "Edit"],
  });
  const critic = new Agent({
    name: "critic",
    prompt: `Score the description on "quality" (1-10). Pass if >= 8.
Output JSON: {"passed": true/false, "scores": {"quality": N}, "feedback": ["feedback"]}`,
    outputSchema: QAReportSchema,
    disallowedTools: ["Bash", "Read", "Write", "Edit"],
  });
  const loop = new Loop(writer, critic, {
    maxRounds: 3,
    stopWhen: (r: any) => r?.passed === true,
    eventBus: bus,
  });
  const result = await loop.run(TASK);
  const rounds = bus.history.filter((e) => e.type === "round:done").length;
  return { result: typeof result === "string" ? result : JSON.stringify(result), cost: bus.getCostSummary().total, rounds };
}

// --- Approach 3: Contract (negotiated) ---
async function runContract(): Promise<{ result: string; cost: number; rounds: number }> {
  const bus = new EventBus();
  const proposer = new Agent({
    name: "proposer",
    prompt: `Write a product description proposal.
Output JSON: {"proposal": "description text", "criteria": ["criterion"]}`,
    disallowedTools: ["Bash", "Read", "Write", "Edit"],
  });
  const reviewer = new Agent({
    name: "reviewer",
    prompt: `Review the description. Accept if it's compelling, specific, and concise.
Output JSON: {"accepted": true/false, "feedback": "feedback"}`,
    disallowedTools: ["Bash", "Read", "Write", "Edit"],
  });
  const contract = new Contract(proposer, reviewer, { maxRounds: 3, eventBus: bus });
  const result = await contract.run(TASK);
  const rounds = bus.history.filter((e) => e.type === "round:done").length;
  return { result: typeof result === "string" ? result : JSON.stringify(result), cost: bus.getCostSummary().total, rounds };
}

console.log("=== Example 10: Cost Comparison (Same Task, 3 Approaches) ===\n");
console.log(`Task: "${TASK}"\n`);

console.log("Running all 3 approaches in parallel...\n");
const [pResult, lResult, cResult] = await Promise.all([
  runPipeline(),
  runLoop(),
  runContract(),
]);

console.log("\n--- Comparison Table ---");
console.log("┌────────────┬──────────┬────────┬───────────────┐");
console.log("│ Approach   │ Cost     │ Rounds │ Output Length  │");
console.log("├────────────┼──────────┼────────┼───────────────┤");
console.log(`│ Pipeline   │ $${pResult.cost.toFixed(4).padEnd(6)} │ ${String(pResult.rounds).padEnd(6)} │ ${String(pResult.result.length).padEnd(13)} │`);
console.log(`│ Loop       │ $${lResult.cost.toFixed(4).padEnd(6)} │ ${String(lResult.rounds).padEnd(6)} │ ${String(lResult.result.length).padEnd(13)} │`);
console.log(`│ Contract   │ $${cResult.cost.toFixed(4).padEnd(6)} │ ${String(cResult.rounds).padEnd(6)} │ ${String(cResult.result.length).padEnd(13)} │`);
console.log("└────────────┴──────────┴────────┴───────────────┘");
console.log(`\nTotal cost: $${(pResult.cost + lResult.cost + cResult.cost).toFixed(4)}`);
