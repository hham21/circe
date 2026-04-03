// Example 12: Retry + Resume (Error Recovery & Checkpointing)
// Primitives: RetryPolicy, Pipeline, EventBus, Pipeline.resume()
// Difficulty: Advanced
// Estimated cost: ~$0.05
//
// Part 1: A flaky agent fails twice then succeeds (RetryPolicy handles it).
// Part 2: Serialize EventBus.history to disk, then use Pipeline.resume(history)
// to skip already-completed steps on a second run.
// Disk persistence is user-side (JSON.stringify), not a built-in framework feature.
// Combines EventBus (11) with retry and Pipeline.resume() capabilities.

import type { Runnable, OrchestratorEvent } from "../src/index.js";
import { BaseAgent, Pipeline, EventBus } from "../src/index.js";
import { writeFileSync, readFileSync } from "node:fs";

const HISTORY_FILE = "/tmp/circe-retry-resume-history.json";

// A wrapper that fails the first N calls, then delegates to the real agent
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

bus.on("retry", (e) => console.log(`  ⟳ Retry ${e.attempt}/${e.maxAttempts} for ${e.agent}`));
bus.on("step:done", (e) => console.log(`  ✓ Step ${e.step} (${e.agent}) done`));

const step1 = new BaseAgent({
  name: "brainstorm",
  prompt: "Generate 3 creative band name ideas. Output ONLY a numbered list.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const step2 = flakyAgent(
  new BaseAgent({
    name: "evaluate",
    prompt: "Pick the best band name from the list and explain why in one sentence. Format: 'Name — reason'.",
    disallowedTools: ["Bash", "Read", "Write", "Edit"],
  }),
  2, // Fails twice, succeeds on 3rd attempt
);

const step3 = new BaseAgent({
  name: "tagline",
  prompt: "Create a catchy one-line slogan for the band. Output ONLY the slogan.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const pipeline = new Pipeline(step1, step2, step3, {
  retryPolicy: { maxRetries: 3, backoff: () => 100 },
  eventBus: bus,
});

// Try to load saved history for resume (single FS call, no TOCTOU race)
let savedHistory: OrchestratorEvent[] | null = null;
try {
  savedHistory = JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
} catch { /* no checkpoint file — fresh run */ }

if (savedHistory) {
  console.log("=== Example 12: Resume (picking up from saved checkpoint) ===\n");
  const completedSteps = savedHistory.filter((e) => e.type === "step:done").length;
  console.log(`Found ${completedSteps} completed steps. Resuming...\n`);
  const result = await pipeline.resume(savedHistory, "Name a jazz trio");
  console.log("\nResult:", result);
} else {
  console.log("=== Example 12: Retry + Resume (flaky agent, 3-step pipeline) ===\n");
  const result = await pipeline.run("Name a jazz trio");
  console.log("\nResult:", result);
}

// Save history for potential resume
writeFileSync(HISTORY_FILE, JSON.stringify(bus.history, null, 2));

console.log("\n--- Metrics ---");
const cost = bus.getCostSummary();
console.log(`Total cost: $${cost.total.toFixed(4)}`);
console.log(`Retries: ${bus.history.filter((e) => e.type === "retry").length}`);
console.log(`History saved to ${HISTORY_FILE} (${bus.history.length} events)`);
console.log("Run again to see resume in action!");
