import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { Pipeline } from "../src/orchestration/pipeline.js";
import { Loop } from "../src/orchestration/loop.js";
import { Parallel } from "../src/orchestration/parallel.js";
import { Contract } from "../src/orchestration/contract.js";

describe("integration: nested orchestrators", () => {
  it("Pipeline containing Loop", async () => {
    const planner = {
      name: "planner",
      async run(input: unknown) {
        return { spec: input, features: ["auth", "dashboard"] };
      },
    };

    let genCalls = 0;
    const gen = {
      name: "generator",
      async run(input: unknown) {
        genCalls++;
        return { built: true, round: genCalls };
      },
    };

    let evalCalls = 0;
    const eval_ = {
      name: "evaluator",
      async run(input: unknown) {
        evalCalls++;
        return { passed: evalCalls >= 2, scores: { quality: evalCalls >= 2 ? 9 : 5 }, feedback: [] };
      },
    };

    const pipeline = new Pipeline(
      planner,
      new Loop(gen, eval_, { maxRounds: 5, stopWhen: (r: any) => r.passed }),
    );

    const result = await pipeline.run("Build an app");
    expect((result as any).passed).toBe(true);
    expect(genCalls).toBe(2);
  });

  it("Parallel agents merge results", async () => {
    const frontend = {
      name: "frontend",
      async run() {
        await new Promise((r) => setTimeout(r, 10));
        return { component: "Header" };
      },
    };
    const backend = {
      name: "backend",
      async run() {
        await new Promise((r) => setTimeout(r, 10));
        return { endpoint: "/api/users" };
      },
    };

    const parallel = new Parallel(frontend, backend);
    const result = await parallel.run("spec");
    expect(result).toEqual({
      frontend: { component: "Header" },
      backend: { endpoint: "/api/users" },
    });
  });

  it("Contract + Loop composition", async () => {
    let proposerCalls = 0;
    const proposer = {
      name: "proposer",
      async run(_: unknown) {
        proposerCalls++;
        return { proposal: "Plan", criteria: ["test1"] };
      },
    };
    const reviewer = {
      name: "reviewer",
      async run(_: unknown) {
        return { accepted: true };
      },
    };
    const contract = new Contract(proposer, reviewer);

    let genCalls = 0;
    const gen = {
      name: "gen",
      async run(_: unknown) {
        genCalls++;
        return "built";
      },
    };
    const eval_ = {
      name: "eval",
      async run(_: unknown) {
        return { passed: true, feedback: [] };
      },
    };
    const loop = new Loop(gen, eval_, { maxRounds: 3, stopWhen: (r: any) => r.passed });

    const pipeline = new Pipeline(contract, loop);
    const result = await pipeline.run("spec");
    expect(proposerCalls).toBe(1);
    expect(genCalls).toBe(1);
    expect((result as any).passed).toBe(true);
  });
});
