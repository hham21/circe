// Resume: 실패한 파이프라인을 마지막 성공 지점부터 재개
import { BaseAgent } from "../src/agent.js";
import { Pipeline } from "../src/orchestration/pipeline.js";
import { EventBus } from "../src/events.js";
import type { OrchestratorEvent } from "../src/events.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

setFormatter(new OutputFormatter(true));

const HISTORY_FILE = "/tmp/circe-resume-history.json";

const step1 = new BaseAgent({
  name: "step1-brainstorm",
  prompt: "Generate 3 creative band name ideas for a jazz trio. Output ONLY a numbered list of names, nothing else. Do NOT use any tools or create any files.",
  tools: [],
});

const step2 = new BaseAgent({
  name: "step2-evaluate",
  prompt: "You receive a numbered list of band names. Pick the best one and explain why in one sentence. Format: 'BandName — reason'. Do NOT use any tools.",
  tools: [],
});

const step3 = new BaseAgent({
  name: "step3-tagline",
  prompt: "You receive a band name with a reason. Create a catchy one-line slogan for that band. Output ONLY the slogan, nothing else. Do NOT use any tools.",
  tools: [],
});

const bus = new EventBus();

bus.on("step:done", (e) => {
  console.log(`  ✓ Step ${e.step} (${e.agent}) complete`);
});

const pipeline = new Pipeline(step1, step2, step3, { eventBus: bus });

// 이전 실행의 히스토리가 있으면 resume, 없으면 새로 시작
if (existsSync(HISTORY_FILE)) {
  console.log("=== Resume: picking up from last checkpoint ===\n");
  const history: OrchestratorEvent[] = JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
  const completedSteps = history.filter((e) => e.type === "step:done").length;
  console.log(`Found ${completedSteps} completed steps in history. Resuming...\n`);
  const result = await pipeline.resume(history, "Build a todo app");
  console.log("\nResult:", result);
} else {
  console.log("=== Resume: first run (history will be saved) ===\n");
  const result = await pipeline.run("Name a jazz trio");
  console.log("\nResult:", result);
}

// 히스토리 저장 (다음 실행에서 resume 가능)
writeFileSync(HISTORY_FILE, JSON.stringify(bus.history, null, 2));
console.log(`\nHistory saved to ${HISTORY_FILE} (${bus.history.length} events)`);
console.log("Run again to see resume in action!");
