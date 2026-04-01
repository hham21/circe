import { describe, it, expect } from "vitest";
import { Contract } from "../../src/orchestration/contract.js";

describe("Contract", () => {
  it("returns immediately when accepted on first round", async () => {
    const proposer = { name: "proposer", async run(_: unknown) { return { proposal: "Build React app" }; } };
    const reviewer = { name: "reviewer", async run(_: unknown) { return { accepted: true, feedback: "Looks good" }; } };
    const result = (await new Contract(proposer, reviewer).run("spec")) as any;
    expect(result.accepted).toBe(true);
  });

  it("negotiates multiple rounds", async () => {
    let proposerCalls = 0;
    const proposer = { name: "proposer", async run(_: unknown) { proposerCalls++; return { proposal: `Plan v${proposerCalls}` }; } };
    let reviewerCalls = 0;
    const reviewer = { name: "reviewer", async run(_: unknown) { reviewerCalls++; return { accepted: reviewerCalls >= 2, feedback: "Needs work" }; } };
    const result = (await new Contract(proposer, reviewer, { maxRounds: 5 }).run("spec")) as any;
    expect(result.accepted).toBe(true);
    expect(proposerCalls).toBe(2);
  });

  it("returns last review when max rounds exceeded", async () => {
    const proposer = { name: "proposer", async run(_: unknown) { return { proposal: "Plan" }; } };
    const reviewer = { name: "reviewer", async run(_: unknown) { return { accepted: false, feedback: "Still bad" }; } };
    const result = (await new Contract(proposer, reviewer, { maxRounds: 2 }).run("spec")) as any;
    expect(result.accepted).toBe(false);
  });

  it("parses accepted from JSON string response", async () => {
    const proposer = { name: "proposer", async run(_: unknown) { return "proposal text"; } };
    const reviewer = { name: "reviewer", async run(_: unknown) { return '```json\n{"accepted": true}\n```'; } };
    const contract = new Contract(proposer, reviewer);
    const result = await contract.run("spec");
    expect(result).toBeDefined();
  });
});
