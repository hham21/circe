// Contract: 기획자가 제안하고, 리뷰어가 승인할 때까지 협상
import { BaseAgent } from "../src/agent.js";
import { Contract } from "../src/orchestration/contract.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";

setFormatter(new OutputFormatter(true));

const proposer = new BaseAgent({
  name: "proposer",
  prompt: `You are a product planner. Given a product idea (or reviewer feedback), propose a feature list.
Output JSON: {"proposal": "feature list description", "criteria": ["testable criterion 1", ...]}`,
});

const reviewer = new BaseAgent({
  name: "reviewer",
  prompt: `You are a strict reviewer. Evaluate the proposal.
- If every feature has a testable criterion, accept.
- Otherwise reject with specific feedback.
Output JSON: {"accepted": true/false, "feedback": "what's missing or why accepted"}`,
});

console.log("=== Contract: propose → review (max 3 rounds) ===");
const contract = new Contract(proposer, reviewer, { maxRounds: 3 });
const result = await contract.run("A simple todo app");
console.log("Result:", JSON.stringify(result, null, 2));
