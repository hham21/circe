import { describe, it, expect } from "vitest";
import { Contract } from "../../src/orchestration/contract.js";

class FakeAgentWithMetrics {
  name: string;
  lastMetrics: { cost: number; inputTokens: number; outputTokens: number } | null = null;
  private metrics: { cost: number; inputTokens: number; outputTokens: number };
  private result: unknown;

  constructor(name: string, result: unknown, metrics: { cost: number; inputTokens: number; outputTokens: number }) {
    this.name = name;
    this.result = result;
    this.metrics = metrics;
  }

  async run(_input: unknown) {
    this.lastMetrics = { ...this.metrics };
    return this.result;
  }
}

describe("Contract", () => {
  it("returns proposal when accepted on first round", async () => {
    const proposer = { name: "proposer", async run(_: unknown) { return { proposal: "Build React app" }; } };
    const reviewer = { name: "reviewer", async run(_: unknown) { return { accepted: true, feedback: "Looks good" }; } };
    const contract = new Contract(proposer, reviewer);
    const result = (await contract.run("spec")) as any;
    expect(result.proposal).toBe("Build React app");
    expect(contract.lastEvaluatorResult).toBeTruthy();
    expect((contract.lastEvaluatorResult as any).accepted).toBe(true);
  });

  it("negotiates multiple rounds", async () => {
    let proposerCalls = 0;
    const proposer = { name: "proposer", async run(_: unknown) { proposerCalls++; return { proposal: `Plan v${proposerCalls}` }; } };
    let reviewerCalls = 0;
    const reviewer = { name: "reviewer", async run(_: unknown) { reviewerCalls++; return { accepted: reviewerCalls >= 2, feedback: "Needs work" }; } };
    const contract = new Contract(proposer, reviewer, { maxRounds: 5 });
    const result = (await contract.run("spec")) as any;
    expect(result.proposal).toBe("Plan v2");
    expect((contract.lastEvaluatorResult as any).accepted).toBe(true);
    expect(proposerCalls).toBe(2);
  });

  it("returns last proposal when max rounds exceeded", async () => {
    const proposer = { name: "proposer", async run(_: unknown) { return { proposal: "Plan" }; } };
    const reviewer = { name: "reviewer", async run(_: unknown) { return { accepted: false, feedback: "Still bad" }; } };
    const contract = new Contract(proposer, reviewer, { maxRounds: 2 });
    const result = (await contract.run("spec")) as any;
    expect(result.proposal).toBe("Plan");
    expect((contract.lastEvaluatorResult as any).accepted).toBe(false);
  });

  it("parses accepted from JSON string response", async () => {
    const proposer = { name: "proposer", async run(_: unknown) { return "proposal text"; } };
    const reviewer = { name: "reviewer", async run(_: unknown) { return '```json\n{"accepted": true}\n```'; } };
    const contract = new Contract(proposer, reviewer);
    const result = await contract.run("spec");
    expect(result).toBeDefined();
  });

  it("accumulates lastMetrics across all rounds", async () => {
    let reviewerCalls = 0;
    const proposer = new FakeAgentWithMetrics("proposer", { proposal: "Plan" }, { cost: 0.25, inputTokens: 100, outputTokens: 50 });
    const reviewer = {
      name: "reviewer",
      lastMetrics: null as { cost: number; inputTokens: number; outputTokens: number } | null,
      async run(_: unknown) {
        reviewerCalls++;
        this.lastMetrics = { cost: 0.25, inputTokens: 80, outputTokens: 30 };
        return { accepted: reviewerCalls >= 2, feedback: "Needs work" };
      },
    };
    const contract = new Contract(proposer, reviewer, { maxRounds: 3 });
    await contract.run("spec");

    // 2 rounds: each round has proposer (0.25) + reviewer (0.25) = 0.50 per round
    expect(contract.lastMetrics).toEqual({
      cost: 1.00,
      inputTokens: 360,
      outputTokens: 160,
    });
  });

  it("accepted returns proposal, lastEvaluatorResult has review", async () => {
    const proposer = new FakeAgentWithMetrics("proposer", { plan: "Build API" }, { cost: 0.1, inputTokens: 50, outputTokens: 50 });
    const reviewer = new FakeAgentWithMetrics("reviewer", { accepted: true, score: 9 }, { cost: 0.05, inputTokens: 30, outputTokens: 20 });
    const contract = new Contract(proposer, reviewer);
    const result = (await contract.run("spec")) as any;

    expect(result.plan).toBe("Build API");
    expect(contract.lastEvaluatorResult).toEqual({ accepted: true, score: 9 });
  });

  it("maxRounds returns proposal, evaluator in lastEvaluatorResult", async () => {
    const proposer = new FakeAgentWithMetrics("proposer", { plan: "v1" }, { cost: 0.1, inputTokens: 50, outputTokens: 50 });
    const reviewer = new FakeAgentWithMetrics("reviewer", { accepted: false, feedback: "rejected" }, { cost: 0.05, inputTokens: 30, outputTokens: 20 });
    const contract = new Contract(proposer, reviewer, { maxRounds: 2 });
    const result = (await contract.run("spec")) as any;

    expect(result.plan).toBe("v1");
    expect((contract.lastEvaluatorResult as any).accepted).toBe(false);
    expect((contract.lastEvaluatorResult as any).feedback).toBe("rejected");
  });
});
