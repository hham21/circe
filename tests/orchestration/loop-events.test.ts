import { describe, it, expect } from "vitest";
import { Loop } from "../../src/orchestration/loop.js";
import { EventBus } from "../../src/events.js";

describe("Loop with EventBus", () => {
  it("emits round:start and round:done events", async () => {
    const bus = new EventBus();
    const gen = { name: "gen", async run() { return "built"; } };
    let evalCalls = 0;
    const eval_ = { name: "eval", async run() { evalCalls++; return { passed: evalCalls >= 2 }; } };

    const loop = new Loop(gen, eval_, {
      maxRounds: 3,
      stopWhen: (r: any) => r.passed,
      eventBus: bus,
    });

    await loop.run("spec");

    const roundStarts = bus.history.filter((e) => e.type === "round:start");
    const roundDones = bus.history.filter((e) => e.type === "round:done");
    expect(roundStarts).toHaveLength(2);
    expect(roundDones).toHaveLength(2);
  });

  it("emits round:error on failure", async () => {
    const bus = new EventBus();
    const gen = { name: "gen", async run() { throw new Error("crash"); } };
    const eval_ = { name: "eval", async run() { return {}; } };

    const loop = new Loop(gen, eval_, { maxRounds: 2, eventBus: bus });

    await expect(loop.run("spec")).rejects.toThrow("crash");

    const errors = bus.history.filter((e) => e.type === "round:error");
    expect(errors).toHaveLength(1);
  });

  it("tracks cost per round from agent lastMetrics", async () => {
    const bus = new EventBus();
    const gen = {
      name: "gen",
      lastMetrics: { cost: 1.5, inputTokens: 100, outputTokens: 50, resultText: "" },
      async run() { return "built"; },
    };
    let evalCalls = 0;
    const eval_ = {
      name: "eval",
      lastMetrics: { cost: 0.5, inputTokens: 50, outputTokens: 25, resultText: "" },
      async run() { evalCalls++; return { passed: evalCalls >= 1 }; },
    };

    const loop = new Loop(gen, eval_, {
      maxRounds: 2,
      stopWhen: (r: any) => r.passed,
      eventBus: bus,
    });

    await loop.run("spec");

    const roundDone = bus.history.find((e) => e.type === "round:done") as any;
    expect(roundDone).toBeDefined();
    expect(roundDone.cost).toBe(2.0);
  });
});

describe("Loop with RetryPolicy", () => {
  it("retries failing agent within round", async () => {
    let genCalls = 0;
    const gen = {
      name: "gen",
      async run() {
        genCalls++;
        if (genCalls === 1) throw new Error("transient");
        return "built";
      },
    };
    const eval_ = { name: "eval", async run() { return { passed: true }; } };

    const bus = new EventBus();
    const loop = new Loop(gen, eval_, {
      maxRounds: 2,
      stopWhen: (r: any) => r.passed,
      retryPolicy: { maxRetries: 2, backoff: () => 0 },
      eventBus: bus,
    });

    const result = await loop.run("spec");
    // Loop returns producer output on stopWhen success
    expect(result).toBe("built");
    expect(genCalls).toBe(2);

    const retries = bus.history.filter((e) => e.type === "retry");
    expect(retries).toHaveLength(1);
  });
});
