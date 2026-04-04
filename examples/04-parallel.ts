// Example 04: Parallel
// Primitives: Parallel, Agent
// Difficulty: Intermediate
// Estimated cost: ~$0.18
//
// Three agents run simultaneously on the same input.
// One agent is deliberately broken to demonstrate partial failure handling (throwOnError: false).
// See 06-compose for Parallel inside a Pipeline.

import type { Runnable } from "../src/index.js";
import { Agent, Parallel, EventBus, OutputFormatter, setFormatter } from "../src/index.js";

const verbose = process.argv.includes("--verbose");
if (verbose) setFormatter(new OutputFormatter(true));

const optimist = new Agent({
  name: "optimist",
  prompt: "You are an optimist. Give a positive one-sentence take on the topic.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

// A deliberately broken agent to demonstrate partial failure
const brokenAgent: Runnable & { name: string } = {
  name: "pessimist",
  async run() {
    throw new Error("Connection timeout after 30s");
  },
};

const realist = new Agent({
  name: "realist",
  prompt: "You are a realist. Give a balanced one-sentence take on the topic.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const bus = new EventBus();

bus.on("branch:done", (e) => console.log(`  ✓ ${e.branch} finished`));
bus.on("branch:error", (e) => console.log(`  ✗ ${e.branch} failed: ${e.error}`));

console.log("=== Example 04: Parallel (3 agents, 1 broken) ===\n");
const parallel = new Parallel(optimist, brokenAgent, realist, {
  throwOnError: false,
  eventBus: bus,
});
const result = await parallel.run("AI replacing human jobs");

console.log("\nResults:");
for (const [name, outcome] of Object.entries(result)) {
  if (outcome.status === "fulfilled") {
    console.log(`  ✓ ${name}: ${outcome.value}`);
  } else {
    console.log(`  ✗ ${name}: FAILED — ${outcome.error}`);
  }
}

const outcomes = Object.values(result);
const succeeded = outcomes.filter((o) => o.status === "fulfilled").length;
const failed = outcomes.length - succeeded;
console.log(`\n--- Metrics ---`);
console.log(`${succeeded} succeeded, ${failed} failed. Partial results preserved.`);
const cost = bus.getCostSummary();
console.log(`Total cost: $${cost.total.toFixed(4)}`);
