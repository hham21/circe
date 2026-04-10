// Example 07: Sprint
// Primitives: Sprint, Agent
// Difficulty: Intermediate
// Estimated cost: ~$0.27
//
// Batch sequential execution: one runner agent processes multiple tasks in order.
// Sprint expects input as { sprints: [...definitions] } — each definition
// is passed to the runner agent sequentially.

import { Agent, Sprint, EventBus, OutputFormatter, setFormatter } from "../src/index.js";

const verbose = process.argv.includes("--verbose");
if (verbose) setFormatter(new OutputFormatter("debug"));

const copywriter = new Agent({
  name: "copywriter",
  prompt: `You are a marketing copywriter. Given a product description, write a catchy one-line tagline.
Output ONLY the tagline, nothing else.`,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const bus = new EventBus();

bus.on("sprint:start", (e) => {
  console.log(`  Sprint item ${e.index}: ${JSON.stringify(e.definition).slice(0, 60)}...`);
});
bus.on("sprint:done", (e) => {
  console.log(`  Sprint item ${e.index} done: "${e.result}"`);
});

console.log("=== Example 07: Sprint (Batch Tagline Generation) ===\n");

const sprint = new Sprint(copywriter, { eventBus: bus });
const result = await sprint.run({
  sprints: [
    "A waterproof notebook for outdoor adventures",
    "An AI-powered alarm clock that wakes you with personalized jokes",
    "A subscription service for rare houseplants",
  ],
});

console.log("\nResults:", JSON.stringify(result, null, 2));
console.log("\n--- Metrics ---");
const cost = bus.getCostSummary();
console.log(`Total cost: $${cost.total.toFixed(4)}`);
console.log(`Items processed: ${result.sprintResults.length}`);
