// Loop 실패 케이스: 절대 통과 못하는 critic
import { BaseAgent } from "../src/agent.js";
import { Loop } from "../src/orchestration/loop.js";
import { QAReportSchema } from "../src/handoff.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";

setFormatter(new OutputFormatter(true));

const writer = new BaseAgent({
  name: "writer",
  prompt: `You are a creative writer. Write a one-line joke about the given topic.
If the input is a QAReport with feedback, try to improve based on the feedback.
Output ONLY the joke, nothing else.`,
});

const critic = new BaseAgent({
  name: "critic",
  prompt: `You are the harshest comedy critic alive. You have NEVER laughed in your life.
Nothing is funny to you. Score "quality" from 1-10.
You NEVER give above 4. Ever. No joke in history deserves more than 4.

Output JSON only:
{"passed": true/false, "scores": {"quality": N}, "feedback": ["why it's not funny"]}`,
  outputSchema: QAReportSchema,
});

console.log("=== Loop: impossible critic (max 3 rounds) ===\n");
const loop = new Loop(writer, critic, {
  maxRounds: 3,
  stopWhen: (r: any) => r?.passed === true,
});

const result = await loop.run("programmers");

console.log("\nFinal:", JSON.stringify(result, null, 2));
console.log("\n" + (result as any).passed ? "" : "⚠️  Loop exhausted — never passed.");
