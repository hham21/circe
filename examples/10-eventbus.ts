// EventBus: 파이프라인 실행을 실시간으로 관찰하고 비용 추적
import { BaseAgent } from "../src/agent.js";
import { Pipeline } from "../src/orchestration/pipeline.js";
import { EventBus } from "../src/events.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";

setFormatter(new OutputFormatter(true));

const bus = new EventBus();

// 이벤트 리스너 등록
bus.on("step:start", (e) => {
  console.log(`\n>>> Step ${e.step} starting: ${e.agent}`);
});

bus.on("step:done", (e) => {
  console.log(`<<< Step ${e.step} done: ${e.agent} (cost: $${e.cost?.toFixed(4) ?? "N/A"})`);
});

const translator = new BaseAgent({
  name: "translator",
  prompt: "Translate the input to Korean. Output ONLY the translation.",
});

const formatter = new BaseAgent({
  name: "formatter",
  prompt: "Take the Korean text and add a relevant emoji prefix. Output ONLY the result.",
});

const pipeline = new Pipeline(translator, formatter, { eventBus: bus });

console.log("=== EventBus: observe pipeline execution ===\n");
const result = await pipeline.run("The stars are beautiful tonight.");

console.log("\nResult:", result);
console.log("\nCost summary:", bus.getCostSummary());
console.log("Total events recorded:", bus.history.length);
