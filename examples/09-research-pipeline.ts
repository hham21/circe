// Example 09: Research Pipeline (Multi-Primitive Workflow)
// Primitives: Parallel + Pipeline + Loop
// Difficulty: Advanced
// Estimated cost: ~$1.50
//
// 3 research agents gather info in parallel → synthesizer combines → reviewer refines.
// Builds on 02-pipeline, 03-loop, and 04-parallel combined.

import { Agent, Pipeline, Parallel, Loop, QAReportSchema, EventBus, OutputFormatter, setFormatter } from "../src/index.js";

const verbose = process.argv.includes("--verbose");
if (verbose) setFormatter(new OutputFormatter("debug"));

// Phase 1: Parallel research from 3 angles
const historian = new Agent({
  name: "historian",
  prompt: "You are a historian. Give 2 historical facts about the topic. Output ONLY the facts.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const scientist = new Agent({
  name: "scientist",
  prompt: "You are a scientist. Give 2 scientific facts about the topic. Output ONLY the facts.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const economist = new Agent({
  name: "economist",
  prompt: "You are an economist. Give 2 economic facts about the topic. Output ONLY the facts.",
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

// Phase 2: Synthesize parallel results into a report
const synthesizer = new Agent({
  name: "synthesizer",
  prompt: `You receive research results from multiple experts as a JSON object.
Synthesize them into a brief, coherent 3-paragraph summary.
Output ONLY the summary text.`,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

// Phase 3: Quality check loop
const polisher = new Agent({
  name: "polisher",
  prompt: `You receive a research summary (or QA feedback). Improve clarity and flow.
Output ONLY the improved summary.`,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const editor = new Agent({
  name: "editor",
  prompt: `Score the summary on "quality" (1-10). Pass if quality >= 10.
Check for: coherence, factual integration, readability.
Output JSON: {"passed": true/false, "scores": {"quality": N}, "feedback": ["feedback"]}`,
  outputSchema: QAReportSchema,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const bus = new EventBus();
bus.on("step:start", (e) => console.log(`\n>>> Step ${e.step}: ${e.agent}`));
bus.on("branch:done", (e) => console.log(`  ✓ ${e.branch} done`));
bus.on("round:done", (e) => {
  const r = e.result as any;
  if (r?.scores) console.log(`  Edit round ${e.round}: quality=${r.scores.quality}`);
});

console.log("=== Example 09: Research Pipeline (Parallel → Synthesize → Refine) ===\n");

const pipeline = new Pipeline(
  new Parallel(historian, scientist, economist, { eventBus: bus }),
  synthesizer,
  new Loop(polisher, editor, { maxRounds: 2, stopWhen: (r: any) => r?.passed === true, eventBus: bus }),
  { eventBus: bus },
);

const result = await pipeline.run("The impact of coffee on human civilization");

console.log("\nFinal:", typeof result === "string" ? result.slice(0, 300) : JSON.stringify(result, null, 2));
console.log("\n--- Metrics ---");
const cost = bus.getCostSummary();
console.log(`Total cost: $${cost.total.toFixed(4)}`);
for (const [agent, c] of Object.entries(cost.perAgent)) {
  console.log(`  ${agent}: $${c.toFixed(4)}`);
}
