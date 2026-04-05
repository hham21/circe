import { describe, it, expect } from "vitest";
import { Loop } from "../../src/orchestration/loop.js";

class FakeGenerator {
  name = "generator";
  callCount = 0;
  async run(input: unknown) {
    this.callCount++;
    return { built: true, round: this.callCount };
  }
}

class FakeEvaluator {
  name = "evaluator";
  passOnRound: number;
  callCount = 0;
  constructor(passOnRound: number) { this.passOnRound = passOnRound; }
  async run(input: unknown) {
    this.callCount++;
    const passed = this.callCount >= this.passOnRound;
    return { passed, feedback: passed ? [] : ["Fix bugs"] };
  }
}

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

describe("Loop", () => {
  it("stops when condition met — returns producer output", async () => {
    const gen = new FakeGenerator();
    const eval_ = new FakeEvaluator(2);
    const loop = new Loop(gen, eval_, { maxRounds: 5, stopWhen: (r: any) => r.passed === true });
    const result = (await loop.run("spec")) as any;
    expect(result.built).toBe(true);
    expect(loop.lastEvaluatorResult).toBeTruthy();
    expect((loop.lastEvaluatorResult as any).passed).toBe(true);
    expect(gen.callCount).toBe(2);
    expect(eval_.callCount).toBe(2);
  });

  it("runs max rounds when condition never met — returns producer output", async () => {
    const gen = new FakeGenerator();
    const eval_ = new FakeEvaluator(999);
    const loop = new Loop(gen, eval_, { maxRounds: 3, stopWhen: (r: any) => r.passed === true });
    const result = (await loop.run("spec")) as any;
    expect(result.built).toBe(true);
    expect(result.round).toBe(3);
    expect(gen.callCount).toBe(3);
    expect((loop.lastEvaluatorResult as any).passed).toBe(false);
  });

  it("feeds evaluator output back to generator", async () => {
    const inputs: unknown[] = [];
    const gen = {
      name: "gen",
      async run(input: unknown) { inputs.push(input); return "built"; },
    };
    let evalCount = 0;
    const eval_ = {
      name: "eval",
      async run(_: unknown) {
        evalCount++;
        return { passed: evalCount >= 2, feedback: ["fix it"] };
      },
    };
    const loop = new Loop(gen, eval_, { maxRounds: 3, stopWhen: (r: any) => r.passed });
    await loop.run("initial");
    expect(inputs[0]).toBe("initial");
    expect((inputs[1] as any).feedback).toEqual(["fix it"]);
  });

  it("throws with fewer than 2 agents", () => {
    const a = { name: "a", run: async () => {} };
    expect(() => new Loop(a)).toThrow("Loop requires at least two agents");
  });

  it("wraps error with round context", async () => {
    const gen = { name: "gen", async run() { return "ok"; } };
    const bad = { name: "bad-eval", async run() { throw new Error("boom"); } };
    await expect(new Loop(gen, bad, { maxRounds: 1 }).run("x")).rejects.toThrow("[Loop:round-1] boom");
  });

  it("accumulates lastMetrics across all rounds", async () => {
    const producer = new FakeAgentWithMetrics("producer", { built: true }, { cost: 0.25, inputTokens: 100, outputTokens: 50 });
    const evaluator = new FakeAgentWithMetrics("evaluator", { passed: false }, { cost: 0.25, inputTokens: 80, outputTokens: 30 });
    const loop = new Loop(producer, evaluator, { maxRounds: 3 });
    await loop.run("spec");

    expect(loop.lastMetrics).toEqual({
      cost: 1.50,
      inputTokens: 540,
      outputTokens: 240,
    });
  });

  it("lastMetrics available after error", async () => {
    const producer = new FakeAgentWithMetrics("producer", "ok", { cost: 0.25, inputTokens: 100, outputTokens: 50 });
    const bad = { name: "bad", async run() { throw new Error("boom"); } };
    const loop = new Loop(producer, bad, { maxRounds: 2 });

    await expect(loop.run("x")).rejects.toThrow();
    expect(loop.lastMetrics).toEqual({
      cost: 0.25,
      inputTokens: 100,
      outputTokens: 50,
    });
  });

  it("success returns producer output, lastEvaluatorResult has evaluator output", async () => {
    const producer = new FakeAgentWithMetrics("producer", { code: "hello world" }, { cost: 0.1, inputTokens: 50, outputTokens: 50 });
    const evaluator = new FakeAgentWithMetrics("evaluator", { passed: true, score: 95 }, { cost: 0.05, inputTokens: 30, outputTokens: 20 });
    const loop = new Loop(producer, evaluator, { maxRounds: 5, stopWhen: (r: any) => r.passed === true });
    const result = (await loop.run("spec")) as any;

    expect(result.code).toBe("hello world");
    expect(loop.lastEvaluatorResult).toEqual({ passed: true, score: 95 });
  });

  it("maxRounds returns producer output, evaluator in lastEvaluatorResult", async () => {
    const producer = new FakeAgentWithMetrics("producer", { code: "v1" }, { cost: 0.1, inputTokens: 50, outputTokens: 50 });
    const evaluator = new FakeAgentWithMetrics("evaluator", { passed: false, feedback: "needs work" }, { cost: 0.05, inputTokens: 30, outputTokens: 20 });
    const loop = new Loop(producer, evaluator, { maxRounds: 2, stopWhen: (r: any) => r.passed === true });
    const result = (await loop.run("spec")) as any;

    expect(result.code).toBe("v1");
    expect((loop.lastEvaluatorResult as any).passed).toBe(false);
    expect((loop.lastEvaluatorResult as any).feedback).toBe("needs work");
  });
});
