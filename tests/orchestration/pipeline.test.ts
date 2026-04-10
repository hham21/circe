import { describe, it, expect } from "vitest";
import { Pipeline } from "../../src/orchestration/pipeline.js";
import { sessionStore } from "../../src/store.js";
import type { Runnable } from "../../src/types.js";

class FakeAgent {
  name: string;
  private transform: (input: unknown) => unknown;
  constructor(name: string, transform: (input: unknown) => unknown) {
    this.name = name;
    this.transform = transform;
  }
  async run(input: unknown) { return this.transform(input); }
}

describe("Pipeline", () => {
  it("passes input through agents sequentially", async () => {
    const a = new FakeAgent("a", (i) => `${i}+a`);
    const b = new FakeAgent("b", (i) => `${i}+b`);
    const result = await new Pipeline(a, b).run("start");
    expect(result).toBe("start+a+b");
  });

  it("works with single agent", async () => {
    const result = await new Pipeline(new FakeAgent("a", (i) => `${i}!`)).run("x");
    expect(result).toBe("x!");
  });

  it("throws with no agents", () => {
    expect(() => new Pipeline()).toThrow("Pipeline requires at least one agent");
  });

  it("passes null input to first agent", async () => {
    const result = await new Pipeline(new FakeAgent("a", (i) => i ?? "default")).run(null);
    expect(result).toBe("default");
  });

  it("wraps error with step context", async () => {
    const good = new FakeAgent("good", (i) => i);
    const bad = { name: "bad-agent", async run() { throw new Error("API error"); } };
    await expect(new Pipeline(good, bad).run("x")).rejects.toThrow("[Pipeline:step-1/bad-agent] API error");
  });
});

describe("Pipeline shouldStop", () => {
  it("stops early when shouldStop is true", async () => {
    const step1: Runnable<string, string> = {
      name: "step1", lastMetrics: null,
      async run() {
        const session = sessionStore.getStore();
        if (session) session.shouldStop = true;
        return "step1-done";
      },
    };
    const step2: Runnable<string, string> = {
      name: "step2", lastMetrics: null,
      async run() { return "step2-done"; },
    };

    const session = { shouldStop: false } as any;
    const pipeline = new Pipeline(step1, step2);
    const result = await sessionStore.run(session, () => pipeline.run("input"));
    expect(result).toBe("step1-done");
  });

  it("runs normally when no Session is active", async () => {
    const step1: Runnable<string, string> = {
      name: "step1", lastMetrics: null,
      async run() { return "s1"; },
    };
    const step2: Runnable<string, string> = {
      name: "step2", lastMetrics: null,
      async run() { return "s2"; },
    };

    const pipeline = new Pipeline(step1, step2);
    const result = await pipeline.run("input");
    expect(result).toBe("s2");
  });
});
