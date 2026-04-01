// Loop: 작성자가 글을 쓰고, 평가자가 점수를 매기고, 8점 이상이면 종료
import { BaseAgent } from "../src/agent.js";
import { Loop } from "../src/orchestration/loop.js";
import { QAReportSchema } from "../src/handoff.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";

// 라운드 진행 상황을 보기 위해 formatter 연결
setFormatter(new OutputFormatter(true));

const writer = new BaseAgent({
  name: "writer",
  prompt: `You are a creative writer.
If the input is a topic string, write a short haiku about it.
If the input is a JSON QAReport with feedback, improve your haiku based on the feedback.
Output ONLY the haiku, nothing else.`,
});

const critic = new BaseAgent({
  name: "critic",
  prompt: `You are an impossibly harsh poetry critic. You almost never give high scores.
Your standards: a haiku must have striking originality, unexpected imagery, emotional depth, and perfect rhythm.
Clichés like "leaves falling", "gentle rain", "morning dew" are automatic failures.

Score on "quality" (1-10). Be brutal — most haikus deserve 4-6.
Only pass if quality >= 9. A 9 means genuinely publishable in a literary magazine.

Output JSON only:
{"passed": true/false, "scores": {"quality": N}, "feedback": ["specific harsh feedback"]}`,
  outputSchema: QAReportSchema,
});

console.log("=== Loop: write haiku → harsh critique (max 3 rounds, pass=9+) ===\n");
const loop = new Loop(writer, critic, {
  maxRounds: 3,
  stopWhen: (r: any) => r?.passed === true,
});
const result = await loop.run("autumn rain");
console.log("\nFinal:", JSON.stringify(result, null, 2));
