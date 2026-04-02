import { describe, it, expect } from "vitest";
import { Parallel } from "../../src/orchestration/parallel.js";
import { EventBus } from "../../src/events.js";

describe("Parallel with allSettled", () => {
  it("returns partial results when throwOnError=false", async () => {
    const ok = { name: "ok", async run() { return "success"; } };
    const fail = { name: "fail", async run() { throw new Error("boom"); } };

    const result = await new Parallel(ok, fail, { throwOnError: false }).run("input");

    expect(result.ok).toEqual({ status: "fulfilled", value: "success" });
    expect(result.fail).toEqual({ status: "rejected", error: "boom" });
  });

  it("throws first error when throwOnError=true (default)", async () => {
    const ok = { name: "ok", async run() { return "success"; } };
    const fail = { name: "fail", async run() { throw new Error("boom"); } };

    await expect(new Parallel(ok, fail).run("input")).rejects.toThrow("boom");
  });

  it("returns all fulfilled when no errors", async () => {
    const a = { name: "a", async run() { return 1; } };
    const b = { name: "b", async run() { return 2; } };

    const result = await new Parallel(a, b, { throwOnError: false }).run("input");
    expect(result).toEqual({
      a: { status: "fulfilled", value: 1 },
      b: { status: "fulfilled", value: 2 },
    });
  });

  it("returns all rejected when all fail", async () => {
    const a = { name: "a", async run() { throw new Error("err-a"); } };
    const b = { name: "b", async run() { throw new Error("err-b"); } };

    const result = await new Parallel(a, b, { throwOnError: false }).run("input");
    expect(result.a.status).toBe("rejected");
    expect(result.b.status).toBe("rejected");
  });
});

describe("Parallel with EventBus", () => {
  it("emits branch:start and branch:done events", async () => {
    const bus = new EventBus();
    const a = { name: "a", async run() { return "ok"; } };
    const parallel = new Parallel(a, { eventBus: bus });

    await parallel.run("input");

    const starts = bus.history.filter((e) => e.type === "branch:start");
    const dones = bus.history.filter((e) => e.type === "branch:done");
    expect(starts).toHaveLength(1);
    expect(dones).toHaveLength(1);
  });

  it("emits branch:error on failure", async () => {
    const bus = new EventBus();
    const fail = { name: "fail", async run() { throw new Error("boom"); } };
    const parallel = new Parallel(fail, { eventBus: bus, throwOnError: false });

    await parallel.run("input");

    const errors = bus.history.filter((e) => e.type === "branch:error");
    expect(errors).toHaveLength(1);
    expect((errors[0] as any).error).toBe("boom");
  });
});

describe("Parallel with RetryPolicy", () => {
  it("retries failed branches", async () => {
    let calls = 0;
    const flaky = {
      name: "flaky",
      async run() {
        calls++;
        if (calls < 2) throw new Error("transient");
        return "recovered";
      },
    };

    const bus = new EventBus();
    const result = await new Parallel(flaky, {
      retryPolicy: { maxRetries: 2, backoff: () => 0 },
      eventBus: bus,
    }).run("input");

    expect(result.flaky).toEqual({ status: "fulfilled", value: "recovered" });
    expect(calls).toBe(2);

    const retries = bus.history.filter((e) => e.type === "retry");
    expect(retries).toHaveLength(1);
  });
});
