// Example 01: Single Agent
// Primitives: Agent
// Difficulty: Beginner
// Estimated cost: ~$0.09
//
// The simplest possible example: create one agent, run it, print the result and cost.
// This is the "hello world" of Circe.

import { Agent, OutputFormatter, setFormatter } from "../src/index.js";

const verbose = process.argv.includes("--verbose");
if (verbose) setFormatter(new OutputFormatter(true));

const agent = new Agent({
  name: "echo",
  prompt: "You are a helpful assistant. Reply in one short sentence.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

console.log("=== Example 01: Single Agent ===\n");
const result = await agent.run("What is 2 + 2?");

console.log("Result:", result);
console.log("\n--- Metrics ---");
const m = agent.lastMetrics!;
console.log(`Tokens: ${m.inputTokens} in / ${m.outputTokens} out`);
console.log(`Cost: $${m.cost.toFixed(4)}`);
