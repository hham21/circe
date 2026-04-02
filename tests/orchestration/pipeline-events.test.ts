import { describe, it, expect, vi } from "vitest";
import { Pipeline } from "../../src/orchestration/pipeline.js";
import { EventBus } from "../../src/events.js";

class FakeAgent {
  name: string;
  private transform: (input: unknown) => unknown;
  constructor(name: string, transform: (input: unknown) => unknown) {
    this.name = name;
    this.transform = transform;
  }
  async run(input: unknown) { return this.transform(input); }
}

class FailingAgent {
  name: string;
  failCount: number;
  calls = 0;
  constructor(name: string, failCount: number) {
    this.name = name;
    this.failCount = failCount;
  }
  async run(input: unknown) {
    this.calls++;
    if (this.calls <= this.failCount) throw new Error(`fail-${this.calls}`);
    return `${input}+${this.name}`;
  }
}

describe("Pipeline with EventBus", () => {
  it("emits step:start and step:done events in order", async () => {
    const bus = new EventBus();
    const a = new FakeAgent("a", (i) => `${i}+a`);
    const b = new FakeAgent("b", (i) => `${i}+b`);
    const pipeline = new Pipeline(a, b, { eventBus: bus });

    await pipeline.run("start");

    const types = bus.history.map((e) => e.type);
    expect(types).toEqual([
      "step:start", "step:done",
      "step:start", "step:done",
      "pipeline:done",
    ]);
  });

  it("records step outputs in history", async () => {
    const bus = new EventBus();
    const a = new FakeAgent("a", () => "result-a");
    const pipeline = new Pipeline(a, { eventBus: bus });

    await pipeline.run("input");

    const done = bus.history.find((e) => e.type === "step:done");
    expect(done).toBeDefined();
    expect((done as any).output).toBe("result-a");
  });

  it("emits step:error on failure", async () => {
    const bus = new EventBus();
    const fail = { name: "fail", async run() { throw new Error("boom"); } };
    const pipeline = new Pipeline(fail, { eventBus: bus });

    await expect(pipeline.run("input")).rejects.toThrow("boom");

    const errEvent = bus.history.find((e) => e.type === "step:error");
    expect(errEvent).toBeDefined();
    expect((errEvent as any).error).toBe("boom");
  });
});

describe("Pipeline with RetryPolicy", () => {
  it("retries failing step and succeeds", async () => {
    const bus = new EventBus();
    const agent = new FailingAgent("flaky", 2);
    const pipeline = new Pipeline(agent, {
      retryPolicy: { maxRetries: 3, backoff: () => 0 },
      eventBus: bus,
    });

    const result = await pipeline.run("input");
    expect(result).toBe("input+flaky");
    expect(agent.calls).toBe(3);

    const retries = bus.history.filter((e) => e.type === "retry");
    expect(retries).toHaveLength(2);
  });

  it("throws after retry exhaustion", async () => {
    const agent = new FailingAgent("always-fail", 999);
    const pipeline = new Pipeline(agent, {
      retryPolicy: { maxRetries: 2, backoff: () => 0 },
    });

    await expect(pipeline.run("input")).rejects.toThrow("fail-3");
    expect(agent.calls).toBe(3);
  });

  it("respects shouldRetry predicate", async () => {
    const agent = { name: "auth-fail", async run() { throw new Error("401 Unauthorized"); } };
    const pipeline = new Pipeline(agent, {
      retryPolicy: { maxRetries: 3, backoff: () => 0 },
    });

    await expect(pipeline.run("input")).rejects.toThrow("401");
  });
});

describe("Pipeline.resume", () => {
  it("skips completed steps and resumes from last output", async () => {
    const calls: string[] = [];
    const a = new FakeAgent("a", (i) => { calls.push("a"); return `${i}+a`; });
    const b = new FakeAgent("b", (i) => { calls.push("b"); return `${i}+b`; });
    const c = new FakeAgent("c", (i) => { calls.push("c"); return `${i}+c`; });
    const pipeline = new Pipeline(a, b, c);

    const history = [
      { type: "step:done" as const, step: 0, agent: "a", output: "start+a", timestamp: 1 },
      { type: "step:done" as const, step: 1, agent: "b", output: "start+a+b", timestamp: 2 },
    ];

    const result = await pipeline.resume(history, "start");
    expect(result).toBe("start+a+b+c");
    expect(calls).toEqual(["c"]);
  });

  it("runs from scratch when no completed steps in history", async () => {
    const a = new FakeAgent("a", (i) => `${i}+a`);
    const pipeline = new Pipeline(a);

    const result = await pipeline.resume([], "start");
    expect(result).toBe("start+a");
  });

  it("returns last output when all steps completed", async () => {
    const a = new FakeAgent("a", () => "done");
    const pipeline = new Pipeline(a);

    const history = [
      { type: "step:done" as const, step: 0, agent: "a", output: "final", timestamp: 1 },
    ];

    const result = await pipeline.resume(history, "input");
    expect(result).toBe("final");
  });
});
