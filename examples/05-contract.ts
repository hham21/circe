// Example 05: Contract
// Primitives: Contract, BaseAgent
// Difficulty: Intermediate
// Estimated cost: ~$0.55 (2-3 rounds)
//
// Adversarial negotiation: proposer and reviewer go back and forth until agreement.
// Different from Loop (03) — both sides have agency here.
// Compare with 03-loop: Loop has a passive creator, Contract has two active negotiators.

import { BaseAgent, Contract, EventBus } from "../src/index.js";

const proposer = new BaseAgent({
  name: "proposer",
  prompt: `You are a project planner. Given a project idea (or reviewer feedback), propose a budget breakdown.
Output JSON: {"proposal": "budget breakdown description", "criteria": ["testable criterion 1", ...]}`,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const reviewer = new BaseAgent({
  name: "reviewer",
  prompt: `You are a strict budget reviewer. Evaluate the proposal.
- If every line item has a justification, accept.
- Otherwise reject with specific feedback on what's missing.
Output JSON: {"accepted": true/false, "feedback": "what's missing or why accepted"}`,
  disallowedTools: ["Bash", "Read", "Write", "Edit"],
});

const bus = new EventBus();

bus.on("round:start", (e) => console.log(`  Round ${e.round}...`));
bus.on("round:done", (e) => {
  const r = e.result as any;
  console.log(`  Round ${e.round} — ${r?.accepted ? "ACCEPTED" : "REJECTED"}: ${r?.feedback?.slice(0, 80) ?? ""}`);
});

console.log("=== Example 05: Contract (Budget Proposer ⇄ Reviewer) ===\n");
const contract = new Contract(proposer, reviewer, { maxRounds: 3, eventBus: bus });
const result = await contract.run("Build a mobile app for a local coffee shop");

console.log("\nResult:", JSON.stringify(result, null, 2));
console.log("\n--- Metrics ---");
const cost = bus.getCostSummary();
console.log(`Total cost: $${cost.total.toFixed(4)}`);
console.log(`Rounds: ${bus.history.filter((e) => e.type === "round:done").length}`);
