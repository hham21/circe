// Example 02: Pipeline
// Primitives: Pipeline, BaseAgent
// Difficulty: Beginner
// Estimated cost: ~$0.27
//
// Sequential chaining: output of agent A becomes input of agent B.
// Shows per-step cost breakdown via lastMetrics.
// See 06-compose for nesting Pipeline with other primitives.

import { BaseAgent, Pipeline, EventBus } from "../src/index.js";

const researcher = new BaseAgent({
  name: "researcher",
  prompt: "You are a researcher. Given a topic, write 3 key facts about it. Output ONLY the facts as a numbered list.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const summarizer = new BaseAgent({
  name: "summarizer",
  prompt: "You are a summarizer. Condense the input into a single sentence. Output ONLY the sentence.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const translator = new BaseAgent({
  name: "translator",
  prompt: "Translate the input to Korean. Output ONLY the translation, nothing else.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const bus = new EventBus();

bus.on("step:done", (e) => {
  console.log(`  Step ${e.step} (${e.agent}) done — $${e.cost?.toFixed(4) ?? "N/A"}`);
});

console.log("=== Example 02: Pipeline (Research → Summarize → Translate) ===\n");
const pipeline = new Pipeline(researcher, summarizer, translator, { eventBus: bus });
const result = await pipeline.run("The history of coffee");

console.log("\nResult:", result);
console.log("\n--- Metrics ---");
const cost = bus.getCostSummary();
console.log(`Total cost: $${cost.total.toFixed(4)}`);
for (const [agent, c] of Object.entries(cost.perAgent)) {
  console.log(`  ${agent}: $${c.toFixed(4)}`);
}
