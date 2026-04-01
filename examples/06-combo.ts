// Combo: Contract(합의) → Loop(작성⇄평가) — 협상 후 반복 개선
import { BaseAgent } from "../src/agent.js";
import { Pipeline } from "../src/orchestration/pipeline.js";
import { Contract } from "../src/orchestration/contract.js";
import { Loop } from "../src/orchestration/loop.js";
import { QAReportSchema } from "../src/handoff.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";

setFormatter(new OutputFormatter(true));

// Phase 1: Contract — 어떤 레시피를 만들지 합의
const proposer = new BaseAgent({
  name: "proposer",
  prompt: `You are a chef. Given a theme (or reviewer feedback), propose a recipe plan.
Output JSON: {"proposal": "recipe outline", "criteria": ["criterion 1", ...]}`,
});

const reviewer = new BaseAgent({
  name: "reviewer",
  prompt: `You are a food critic reviewing a recipe plan.
Accept if it has clear ingredients, steps, and serving suggestion.
Output JSON: {"accepted": true/false, "feedback": "specific feedback"}`,
});

// Phase 2: Loop — 합의된 계획대로 레시피를 작성하고 평가
const writer = new BaseAgent({
  name: "writer",
  prompt: `You are a recipe writer.
If input has "accepted", write a complete recipe based on the agreed plan.
If input is a QAReport with feedback, improve the recipe.
Output the recipe as formatted text.`,
});

const critic = new BaseAgent({
  name: "critic",
  prompt: `You are a Michelin food critic. Score the recipe on "quality" (1-10).
Pass if quality >= 8.
Output JSON only:
{"passed": true/false, "scores": {"quality": N}, "feedback": ["specific feedback"]}`,
  outputSchema: QAReportSchema,
});

console.log("=== Combo: Contract(합의) → Loop(작성⇄평가) ===");
const app = new Pipeline(
  new Contract(proposer, reviewer, { maxRounds: 2 }),
  new Loop(writer, critic, { maxRounds: 3, stopWhen: (r: any) => r?.passed === true }),
);
const result = await app.run("Korean street food");
console.log("Result:", JSON.stringify(result, null, 2));
