// RetryPolicy: 실패하는 에이전트를 자동으로 재시도
import type { Runnable } from "../src/types.js";
import { BaseAgent } from "../src/agent.js";
import { Pipeline } from "../src/orchestration/pipeline.js";
import { EventBus } from "../src/events.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";

setFormatter(new OutputFormatter(true));

// 처음 N번은 실패하고 그 다음부터 성공하는 래퍼
function flakyAgent(inner: Runnable, failCount: number): Runnable {
  let calls = 0;
  return {
    get name() { return (inner as any).name; },
    get lastMetrics() { return (inner as any).lastMetrics; },
    async run(input: unknown) {
      calls++;
      if (calls <= failCount) {
        throw new Error(`Transient failure (attempt ${calls})`);
      }
      return inner.run(input);
    },
  };
}

const bus = new EventBus();

bus.on("retry", (e) => {
  console.log(`  ⟳ Retry ${e.attempt}/${e.maxAttempts} for ${e.agent}`);
});

bus.on("step:done", (e) => {
  console.log(`  ✓ Step ${e.step} (${e.agent}) succeeded`);
});

const translator = flakyAgent(
  new BaseAgent({
    name: "translator",
    prompt: "Translate the input to Japanese. Output ONLY the translation.",
  }),
  2, // 처음 2번 실패 후 3번째에 성공
);

const summarizer = new BaseAgent({
  name: "summarizer",
  prompt: "Summarize the input in one word. Output ONLY the word.",
});

const pipeline = new Pipeline(translator, summarizer, {
  retryPolicy: {
    maxRetries: 3,
    backoff: () => 500,
  },
  eventBus: bus,
});

console.log("=== RetryPolicy: translator fails twice, then succeeds ===\n");
const result = await pipeline.run("Perseverance conquers all obstacles.");
console.log("\nResult:", result);
console.log("Cost:", bus.getCostSummary());
console.log("Total retries:", bus.history.filter((e) => e.type === "retry").length);
