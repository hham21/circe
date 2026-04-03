import { describe, it, expect, vi } from "vitest";
import { EventBus, defaultShouldRetry, defaultBackoff, executeWithRetry } from "../src/events.js";

describe("EventBus", () => {
  it("records events in history", () => {
    const bus = new EventBus();
    bus.emit({ type: "agent:start", agent: "test", timestamp: 1 });
    expect(bus.history).toHaveLength(1);
    expect(bus.history[0].type).toBe("agent:start");
  });

  it("calls typed handlers on emit", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("agent:done", handler);
    bus.emit({ type: "agent:start", agent: "a", timestamp: 1 });
    expect(handler).not.toHaveBeenCalled();
    bus.emit({ type: "agent:done", agent: "a", result: "ok", cost: 1, tokens: [100, 50], timestamp: 2 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].agent).toBe("a");
  });

  it("isolates handler errors via try/catch", () => {
    const bus = new EventBus();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    bus.on("agent:start", () => { throw new Error("boom"); });
    const goodHandler = vi.fn();
    bus.on("agent:start", goodHandler);

    bus.emit({ type: "agent:start", agent: "a", timestamp: 1 });

    expect(errSpy).toHaveBeenCalledOnce();
    expect(goodHandler).toHaveBeenCalledOnce();
    expect(bus.history).toHaveLength(1);
    errSpy.mockRestore();
  });

  it("getCostSummary aggregates agent:done costs", () => {
    const bus = new EventBus();
    bus.emit({ type: "agent:done", agent: "a", result: "", cost: 1.5, tokens: [100, 50], timestamp: 1 });
    bus.emit({ type: "agent:done", agent: "b", result: "", cost: 2.0, tokens: [200, 100], timestamp: 2 });
    bus.emit({ type: "agent:done", agent: "a", result: "", cost: 0.5, tokens: [50, 25], timestamp: 3 });

    const summary = bus.getCostSummary();
    expect(summary.total).toBe(4.0);
    expect(summary.perAgent).toEqual({ a: 2.0, b: 2.0 });
  });

  it("getCostSummary includes partial cost from agent:error", () => {
    const bus = new EventBus();
    bus.emit({ type: "agent:done", agent: "a", result: "", cost: 1.0, tokens: [100, 50], timestamp: 1 });
    bus.emit({ type: "agent:error", agent: "b", error: "fail", attempt: 1, cost: 0.3, tokens: [30, 10], timestamp: 2 });

    const summary = bus.getCostSummary();
    expect(summary.total).toBe(1.3);
    expect(summary.perAgent).toEqual({ a: 1.0, b: 0.3 });
  });

  it("getCostSummary returns zeros for empty history", () => {
    const bus = new EventBus();
    expect(bus.getCostSummary()).toEqual({ total: 0, perAgent: {} });
  });

  it("getCostSummary aggregates step:done and branch:done costs", () => {
    const bus = new EventBus();
    bus.emit({ type: "step:done", step: 0, agent: "planner", output: "", cost: 0.5, tokens: [100, 50], timestamp: 1 });
    bus.emit({ type: "step:done", step: 1, agent: "builder", output: "", cost: 1.0, tokens: [200, 100], timestamp: 2 });
    bus.emit({ type: "branch:done", branch: "frontend", result: "", cost: 0.8, timestamp: 3 });

    const summary = bus.getCostSummary();
    expect(summary.total).toBe(2.3);
    expect(summary.perAgent).toEqual({ planner: 0.5, builder: 1.0, frontend: 0.8 });
  });

  it("maxCost triggers from step:done costs", () => {
    const bus = new EventBus({ maxCost: 1.0 });
    bus.emit({ type: "step:done", step: 0, agent: "planner", output: "", cost: 0.5, tokens: [100, 50], timestamp: 1 });

    expect(() => {
      bus.emit({ type: "step:done", step: 1, agent: "builder", output: "", cost: 0.8, tokens: [200, 100], timestamp: 2 });
    }).toThrow("Cost limit exceeded");
  });

  it("maxCost throws when total cost exceeds limit", () => {
    const bus = new EventBus({ maxCost: 2.0 });
    bus.emit({ type: "agent:done", agent: "a", result: "", cost: 1.5, tokens: [100, 50], timestamp: 1 });

    expect(() => {
      bus.emit({ type: "agent:done", agent: "b", result: "", cost: 1.0, tokens: [200, 100], timestamp: 2 });
    }).toThrow("Cost limit exceeded: $2.50 spent, limit is $2.00");
  });

  it("maxCost does not throw when under limit", () => {
    const bus = new EventBus({ maxCost: 5.0 });
    bus.emit({ type: "agent:done", agent: "a", result: "", cost: 1.5, tokens: [100, 50], timestamp: 1 });
    bus.emit({ type: "agent:done", agent: "b", result: "", cost: 2.0, tokens: [200, 100], timestamp: 2 });

    const summary = bus.getCostSummary();
    expect(summary.total).toBe(3.5);
  });
});

describe("defaultShouldRetry", () => {
  it("returns false for 401 errors", () => {
    expect(defaultShouldRetry(new Error("401 Unauthorized"))).toBe(false);
  });

  it("returns false for 400 errors", () => {
    expect(defaultShouldRetry(new Error("400 Bad Request"))).toBe(false);
  });

  it("returns false for invalid model errors", () => {
    expect(defaultShouldRetry(new Error("invalid model specified"))).toBe(false);
  });

  it("returns true for 500 errors", () => {
    expect(defaultShouldRetry(new Error("500 Internal Server Error"))).toBe(true);
  });

  it("returns true for timeout errors", () => {
    expect(defaultShouldRetry(new Error("request timeout"))).toBe(true);
  });
});

describe("defaultBackoff", () => {
  it("uses exponential backoff", () => {
    expect(defaultBackoff(0)).toBe(1000);
    expect(defaultBackoff(1)).toBe(2000);
    expect(defaultBackoff(2)).toBe(4000);
  });

  it("caps at 60 seconds", () => {
    expect(defaultBackoff(20)).toBe(60_000);
    expect(defaultBackoff(100)).toBe(60_000);
  });
});

describe("executeWithRetry", () => {
  it("returns result on first success", async () => {
    const result = await executeWithRetry(
      async () => "ok",
      { maxRetries: 3 },
    );
    expect(result).toBe("ok");
  });

  it("retries on failure and succeeds", async () => {
    let calls = 0;
    const result = await executeWithRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("fail");
        return "ok";
      },
      { maxRetries: 3, backoff: () => 0 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("throws after exhausting retries", async () => {
    await expect(
      executeWithRetry(
        async () => { throw new Error("always fail"); },
        { maxRetries: 2, backoff: () => 0 },
      ),
    ).rejects.toThrow("always fail");
  });

  it("calls onRetry callback", async () => {
    let calls = 0;
    const retries: number[] = [];
    await executeWithRetry(
      async () => {
        calls++;
        if (calls < 2) throw new Error("fail");
        return "ok";
      },
      { maxRetries: 2, backoff: () => 0 },
      (attempt) => retries.push(attempt),
    );
    expect(retries).toEqual([1]);
  });

  it("skips non-retryable errors", async () => {
    let calls = 0;
    await expect(
      executeWithRetry(
        async () => {
          calls++;
          throw new Error("401 Unauthorized");
        },
        { maxRetries: 3, backoff: () => 0 },
      ),
    ).rejects.toThrow("401");
    expect(calls).toBe(1);
  });
});
