// Parallel partial results: 하나가 실패해도 나머지 결과를 유지
import { BaseAgent } from "../src/agent.js";
import { Parallel } from "../src/orchestration/parallel.js";
import { EventBus } from "../src/events.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";

setFormatter(new OutputFormatter(true));

const bus = new EventBus();

bus.on("branch:done", (e) => {
  console.log(`  ✓ ${e.branch} finished`);
});

bus.on("branch:error", (e) => {
  console.log(`  ✗ ${e.branch} failed: ${e.error}`);
});

const optimist = new BaseAgent({
  name: "optimist",
  prompt: "You are an optimist. Give a positive one-sentence take on the topic.",
});

const pessimist = new BaseAgent({
  name: "pessimist",
  prompt: "You are a pessimist. Give a negative one-sentence take on the topic.",
});

const realist = new BaseAgent({
  name: "realist",
  prompt: "You are a realist. Give a balanced one-sentence take on the topic.",
});

// throwOnError: false → 실패해도 나머지 결과를 반환
const parallel = new Parallel(optimist, pessimist, realist, {
  throwOnError: false,
  eventBus: bus,
});

console.log("=== Parallel: partial results on failure ===\n");
const result = await parallel.run("AI replacing human jobs");

console.log("\nResults:");
for (const [name, outcome] of Object.entries(result)) {
  if (outcome.status === "fulfilled") {
    console.log(`  ${name}: ${outcome.value}`);
  } else {
    console.log(`  ${name}: FAILED — ${outcome.error}`);
  }
}
