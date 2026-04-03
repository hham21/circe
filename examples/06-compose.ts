// Example 06: Compose — Nested Primitives (The Money Shot)
// Primitives: Pipeline + Contract + Loop (3 primitives composed)
// Difficulty: Intermediate
// Estimated cost: ~$1.00
//
// This is what makes Circe different from other frameworks.
// Pipeline where stage 1 is a Contract (negotiate specs) and stage 2 is a Loop (iterative build).
// You've seen Pipeline (02), Loop (03), Contract (05) individually. Now they compose.

import { BaseAgent, Pipeline, Contract, Loop, QAReportSchema, EventBus, OutputFormatter, setFormatter } from "../src/index.js";

const verbose = process.argv.includes("--verbose");
if (verbose) setFormatter(new OutputFormatter(true));

// Phase 1: Contract — negotiate what to build
const specWriter = new BaseAgent({
  name: "spec-writer",
  prompt: `You are a product spec writer. Given a product idea (or reviewer feedback), write a brief spec.
Output JSON: {"proposal": "spec description", "criteria": ["criterion 1", ...]}`,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const specReviewer = new BaseAgent({
  name: "spec-reviewer",
  prompt: `You are a spec reviewer. Accept if the spec has clear scope, deliverables, and success criteria.
Output JSON: {"accepted": true/false, "feedback": "specific feedback"}`,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

// Phase 2: Loop — iteratively build and refine
const builder = new BaseAgent({
  name: "builder",
  prompt: `You are a developer. Given a spec (or QA feedback), write a brief implementation plan.
If input contains "accepted", use the agreed spec to write the plan.
If input is a QAReport with feedback, revise the plan based on feedback.
Output ONLY the implementation plan as text.`,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const qa = new BaseAgent({
  name: "qa",
  prompt: `You are a QA reviewer. Score the implementation plan on "quality" (1-10).
Pass if quality >= 7. Check for: completeness, feasibility, clear steps.
Output JSON: {"passed": true/false, "scores": {"quality": N}, "feedback": ["feedback"]}`,
  outputSchema: QAReportSchema,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const bus = new EventBus();
bus.on("step:start", (e) => console.log(`\n>>> Pipeline step ${e.step}: ${e.agent}`));
bus.on("round:done", (e) => {
  const r = e.result as any;
  if (r?.accepted !== undefined) {
    console.log(`    Contract round ${e.round}: ${r.accepted ? "ACCEPTED" : "REJECTED"}`);
  } else if (r?.scores) {
    console.log(`    Loop round ${e.round}: quality=${r.scores.quality}, passed=${r.passed}`);
  }
});

console.log("=== Example 06: Compose (Contract → Loop inside Pipeline) ===\n");

const app = new Pipeline(
  new Contract(specWriter, specReviewer, { maxRounds: 2, eventBus: bus }),
  new Loop(builder, qa, { maxRounds: 3, stopWhen: (r: any) => r?.passed === true, eventBus: bus }),
  { eventBus: bus },
);

const result = await app.run("A CLI tool for tracking daily habits");

console.log("\nResult:", typeof result === "string" ? result.slice(0, 200) : JSON.stringify(result, null, 2));
console.log("\n--- Metrics ---");
const cost = bus.getCostSummary();
console.log(`Total cost: $${cost.total.toFixed(4)}`);
for (const [agent, c] of Object.entries(cost.perAgent)) {
  console.log(`  ${agent}: $${c.toFixed(4)}`);
}
