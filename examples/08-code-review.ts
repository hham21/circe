// Example 08: Code Review (Practical GAN Pattern)
// Primitives: Loop, BaseAgent, QAReportSchema
// Difficulty: Intermediate
// Estimated cost: ~$0.55 (3 rounds max)
//
// Same pattern as 03-loop, but applied to a real engineering task.
// A code writer generates a function, a code reviewer critiques it, iterate.

import { BaseAgent, Loop, QAReportSchema, EventBus } from "../src/index.js";

const coder = new BaseAgent({
  name: "coder",
  prompt: `You are a TypeScript developer.
If the input is a task description, write a function that solves it.
If the input is a JSON QAReport with feedback, fix the issues mentioned.
Output ONLY the TypeScript code, nothing else.`,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const reviewer = new BaseAgent({
  name: "reviewer",
  prompt: `You are a senior code reviewer. Review the TypeScript code for:
- Correctness (logic errors, edge cases)
- Style (naming, readability)
- Edge cases (null, empty, boundary values)

Score on "quality" (1-10). Pass if quality >= 8.
Output JSON: {"passed": true/false, "scores": {"quality": N}, "feedback": ["specific issues"]}`,
  outputSchema: QAReportSchema,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const bus = new EventBus();

bus.on("round:done", (e) => {
  const r = e.result as any;
  console.log(`  Round ${e.round}: quality=${r?.scores?.quality ?? "?"}, passed=${r?.passed ?? false}`);
});

console.log("=== Example 08: Code Review (Writer ⇄ Reviewer) ===\n");
const loop = new Loop(coder, reviewer, {
  maxRounds: 3,
  stopWhen: (r: any) => r?.passed === true,
  eventBus: bus,
});
const result = await loop.run("Write a function that validates email addresses using a regex");

console.log("\nFinal:", typeof result === "string" ? result : JSON.stringify(result, null, 2));
console.log("\n--- Metrics ---");
const cost = bus.getCostSummary();
console.log(`Total cost: $${cost.total.toFixed(4)}`);
console.log(`Review rounds: ${bus.history.filter((e) => e.type === "round:done").length}`);
