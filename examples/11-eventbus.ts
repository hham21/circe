// Example 11: EventBus (Observability & Cost Tracking)
// Primitives: EventBus, Pipeline, Agent
// Difficulty: Advanced
// Estimated cost: ~$0.18
//
// Wire up EventBus listeners to watch real-time execution events.
// getCostSummary() gives per-agent cost breakdown.
// Add this pattern to any example above for full observability.

import { Agent, Pipeline, EventBus, OutputFormatter, setFormatter } from "../src/index.js";

const verbose = process.argv.includes("--verbose");
if (verbose) setFormatter(new OutputFormatter(true));

const bus = new EventBus();

// Register event listeners for real-time observation
bus.on("step:start", (e) => {
  console.log(`  >>> Step ${e.step} starting: ${e.agent}`);
});

bus.on("step:done", (e) => {
  console.log(`  <<< Step ${e.step} done: ${e.agent} (cost: $${e.cost?.toFixed(4) ?? "N/A"})`);
});

const translator = new Agent({
  name: "translator",
  prompt: "Translate the input to Korean. Output ONLY the translation.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const formatter = new Agent({
  name: "formatter",
  prompt: "Take the Korean text and add a relevant emoji prefix. Output ONLY the result.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const pipeline = new Pipeline(translator, formatter, { eventBus: bus });

console.log("=== Example 11: EventBus (Real-Time Observation) ===\n");
const result = await pipeline.run("The stars are beautiful tonight.");

console.log("\nResult:", result);

console.log("\n--- Metrics ---");
const cost = bus.getCostSummary();
console.log(`Total cost: $${cost.total.toFixed(4)}`);
for (const [agent, c] of Object.entries(cost.perAgent)) {
  console.log(`  ${agent}: $${c.toFixed(4)}`);
}
console.log(`Total events: ${bus.history.length}`);
console.log("Event types:", [...new Set(bus.history.map((e) => e.type))].join(", "));
