// Example 14: Session (Zero-Config Context)
// Primitives: Session, Agent, Loop
// Difficulty: Beginner
// Estimated cost: ~$0.55
//
// Session eliminates boilerplate. Instead of manually setting up formatter,
// workDir, and skillRegistry, just wrap your orchestrator in session.run().
// Context propagates automatically through any nesting depth via AsyncLocalStorage.

import { Agent, Loop, Session, QAReportSchema } from "../src/index.js";

const parseArgs = () => {
  const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
  return { verbose };
};

const generator = new Agent({
  name: "generator",
  prompt: `You are a creative writer. Write or improve a short haiku about the given topic.
Output just the haiku, nothing else.`,
});

const evaluator = new Agent({
  name: "evaluator",
  prompt: `You are a poetry critic. Rate the haiku on a scale of 1-10.
If score >= 8, set passed to true. Otherwise set passed to false and give specific feedback.
Output JSON: {"passed": true/false, "scores": {"quality": N}, "feedback": ["..."]}`,
  outputSchema: QAReportSchema,
});

const loop = new Loop(generator, evaluator, {
  maxRounds: 3,
  stopWhen: (r: any) => r?.passed === true,
});

// --- This is the whole setup. No setFormatter, no setWorkDir, no teardown. ---

const { verbose } = parseArgs();

const session = new Session({
  outputDir: "./output/session-example",
  verbose,
});

await session.run(() => loop.run("autumn leaves"));

console.log(`\nDuration: ${session.duration.toFixed(1)}s`);
