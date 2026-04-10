import { describe, it, expect } from "vitest";
import { map } from "../../src/orchestration/map.js";

describe("map", () => {
  it("wraps a sync function as Runnable", async () => {
    const double = map((n: number) => n * 2);
    expect(await double.run(5)).toBe(10);
  });

  it("wraps an async function as Runnable", async () => {
    const asyncUpper = map(async (s: string) => s.toUpperCase());
    expect(await asyncUpper.run("hello")).toBe("HELLO");
  });

  it("transforms ParallelResult to string via JSON.stringify", async () => {
    const serialize = map((r: Record<string, unknown>) => JSON.stringify(r));
    const input = { agent: { status: "fulfilled", value: "ok" } };
    const result = await serialize.run(input);
    expect(JSON.parse(result)).toEqual(input);
  });

  it("propagates sync errors", async () => {
    const failing = map(() => { throw new Error("boom"); });
    await expect(failing.run("x")).rejects.toThrow("boom");
  });

  it("propagates async rejections", async () => {
    const failing = map(async () => { throw new Error("async boom"); });
    await expect(failing.run("x")).rejects.toThrow("async boom");
  });

  it("has name 'map'", () => {
    const m = map((x: string) => x);
    expect(m.name).toBe("map");
  });

  it("has lastMetrics as null", () => {
    const m = map((x: string) => x);
    expect(m.lastMetrics).toBeNull();
  });
});
