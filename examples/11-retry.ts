// RetryPolicy: 실패하는 에이전트를 자동으로 재시도
import { BaseAgent } from "../src/agent.js";
import { Pipeline } from "../src/orchestration/pipeline.js";
import { EventBus } from "../src/events.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";

setFormatter(new OutputFormatter(true));

const bus = new EventBus();

bus.on("retry", (e) => {
  console.log(`  ⟳ Retry ${e.attempt}/${e.maxAttempts} for ${e.agent}`);
});

bus.on("step:error", (e) => {
  console.log(`  ✗ Step ${e.step} failed: ${e.error}`);
});

const translator = new BaseAgent({
  name: "translator",
  prompt: "Translate the input to Japanese. Output ONLY the translation.",
});

const summarizer = new BaseAgent({
  name: "summarizer",
  prompt: "Summarize the input in one word. Output ONLY the word.",
});

const pipeline = new Pipeline(translator, summarizer, {
  retryPolicy: {
    maxRetries: 2,
    backoff: (attempt) => 1000 * attempt,
  },
  eventBus: bus,
});

console.log("=== RetryPolicy: auto-retry on failure ===\n");
const result = await pipeline.run("Perseverance conquers all obstacles.");
console.log("\nResult:", result);
console.log("Cost:", bus.getCostSummary());
