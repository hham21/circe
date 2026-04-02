// Parallel partial results: 하나가 실패해도 나머지 결과를 유지
import type { Runnable } from "../src/types.js";
import { BaseAgent } from "../src/agent.js";
import { Parallel } from "../src/orchestration/parallel.js";
import { EventBus } from "../src/events.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";

setFormatter(new OutputFormatter(true));

// 항상 실패하는 에이전트 래퍼
function brokenAgent(agentName: string): Runnable & { name: string } {
  return {
    name: agentName,
    async run() {
      throw new Error("Connection timeout after 30s");
    },
  };
}

const bus = new EventBus();

bus.on("branch:done", (e) => {
  console.log(`  ✓ ${e.branch} finished`);
});

bus.on("branch:error", (e) => {
  console.log(`  ✗ ${e.branch} failed: ${e.error}`);
});

const optimist = new BaseAgent({
  name: "optimist",
  prompt: "You are an optimist. Give a positive one-sentence take on the topic. Output ONLY the sentence.",
  tools: [],
});

// pessimist는 항상 실패
const pessimist = brokenAgent("pessimist");

const realist = new BaseAgent({
  name: "realist",
  prompt: "You are a realist. Give a balanced one-sentence take on the topic. Output ONLY the sentence.",
  tools: [],
});

// throwOnError: false → 실패해도 나머지 결과를 반환
const parallel = new Parallel(optimist, pessimist, realist, {
  throwOnError: false,
  eventBus: bus,
});

console.log("=== Parallel: 3 agents, 1 broken (pessimist always fails) ===\n");
const result = await parallel.run("AI replacing human jobs");

console.log("\nResults:");
for (const [name, outcome] of Object.entries(result)) {
  if (outcome.status === "fulfilled") {
    console.log(`  ✓ ${name}: ${outcome.value}`);
  } else {
    console.log(`  ✗ ${name}: FAILED — ${outcome.error}`);
  }
}

const succeeded = Object.values(result).filter((o) => o.status === "fulfilled").length;
const failed = Object.values(result).filter((o) => o.status === "rejected").length;
console.log(`\n${succeeded} succeeded, ${failed} failed. Partial results preserved.`);
