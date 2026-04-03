// Example 03: Loop (GAN Pattern)
// Primitives: Loop, BaseAgent, QAReportSchema
// Difficulty: Beginner
// Estimated cost: ~$0.05 (3 rounds max)
//
// Iterative refinement: a writer produces, a critic scores, repeat until quality threshold.
// This is the GAN pattern — Generator vs Evaluator.
// See 05-contract for a different adversarial pattern where both sides negotiate.

import { BaseAgent, Loop, QAReportSchema, EventBus } from "../src/index.js";

const writer = new BaseAgent({
  name: "writer",
  prompt: `You are a creative writer.
If the input is a topic string, write a short haiku about it.
If the input is a JSON QAReport with feedback, improve your haiku based on the feedback.
Output ONLY the haiku, nothing else.`,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const critic = new BaseAgent({
  name: "critic",
  prompt: `You are a harsh poetry critic. Score on "quality" (1-10).
Only pass if quality >= 8. Most haikus deserve 4-6.
Clichés like "leaves falling", "gentle rain" are automatic failures.

Output JSON only:
{"passed": true/false, "scores": {"quality": N}, "feedback": ["specific feedback"]}`,
  outputSchema: QAReportSchema,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const bus = new EventBus();

bus.on("round:start", (e) => {
  console.log(`  Round ${e.round} starting...`);
});

bus.on("round:done", (e) => {
  const r = e.result as any;
  console.log(`  Round ${e.round} done — quality: ${r?.scores?.quality ?? "?"}, passed: ${r?.passed ?? false}`);
});

console.log("=== Example 03: Loop (Haiku Writer ⇄ Harsh Critic) ===\n");
const loop = new Loop(writer, critic, {
  maxRounds: 3,
  stopWhen: (r: any) => r?.passed === true,
  eventBus: bus,
});
const result = await loop.run("autumn rain");

console.log("\nFinal:", JSON.stringify(result, null, 2));
console.log("\n--- Metrics ---");
const cost = bus.getCostSummary();
console.log(`Total cost: $${cost.total.toFixed(4)}`);
console.log(`Rounds: ${bus.history.filter((e) => e.type === "round:done").length}`);
