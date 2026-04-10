import { describe, it, expect } from "vitest";
import { Parallel } from "../../src/orchestration/parallel.js";
import { sessionStore } from "../../src/store.js";
import type { Runnable } from "../../src/types.js";

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

describe("Parallel", () => {
  it("runs agents concurrently and merges by name", async () => {
    const a = { name: "frontend", async run() { return "react-app"; } };
    const b = { name: "backend", async run() { return "fastapi-server"; } };
    const result = await new Parallel(a, b).run("spec");
    expect(result).toEqual({
      frontend: { status: "fulfilled", value: "react-app" },
      backend: { status: "fulfilled", value: "fastapi-server" },
    });
  });

  it("actually runs concurrently", async () => {
    const start = Date.now();
    const slow = { name: "slow", async run() { await new Promise((r) => setTimeout(r, 50)); return "done"; } };
    const slow2 = { name: "slow2", async run() { await new Promise((r) => setTimeout(r, 50)); return "done2"; } };
    await new Parallel(slow, slow2).run(null);
    expect(Date.now() - start).toBeLessThan(90);
  });

  it("throws with no agents", () => {
    expect(() => new Parallel()).toThrow("Parallel requires at least one agent");
  });

  it("accumulates lastMetrics from all agents", async () => {
    const a = new FakeAgentWithMetrics("frontend", "react-app", { cost: 0.25, inputTokens: 100, outputTokens: 50 });
    const b = new FakeAgentWithMetrics("backend", "fastapi-server", { cost: 0.25, inputTokens: 200, outputTokens: 100 });
    const parallel = new Parallel(a, b);
    await parallel.run("spec");

    expect(parallel.lastMetrics).toEqual({
      cost: 0.50,
      inputTokens: 300,
      outputTokens: 150,
    });
  });
});

describe("Parallel shouldStop", () => {
  it("short-circuits at run() entry when shouldStop is true", async () => {
    let agentRan = false;
    const agent: Runnable<string, string> = {
      name: "agent", lastMetrics: null,
      async run() { agentRan = true; return "done"; },
    };

    const session = { shouldStop: true } as any;
    const parallel = new Parallel(agent);
    const result = await sessionStore.run(session, () => parallel.run("input"));
    expect(agentRan).toBe(false);
    expect(result).toEqual({});
  });

  it("runs normally when no Session", async () => {
    let agentRan = false;
    const agent: Runnable<string, string> = {
      name: "agent", lastMetrics: null,
      async run() { agentRan = true; return "done"; },
    };

    const parallel = new Parallel(agent);
    await parallel.run("input");
    expect(agentRan).toBe(true);
  });
});
