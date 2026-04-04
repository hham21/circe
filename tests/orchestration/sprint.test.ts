import { describe, it, expect } from "vitest";
import { Sprint } from "../../src/orchestration/sprint.js";

describe("Sprint", () => {
  it("decomposes spec into sprints and runs each", async () => {
    const results: unknown[] = [];
    const inner = { name: "inner", async run(input: unknown) { results.push(input); return `done: ${JSON.stringify(input)}`; } };
    const sprint = new Sprint(inner);
    const result = await sprint.run({ sprints: [{ name: "auth" }, { name: "dashboard" }] });
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ name: "auth" });
    expect((result as any).sprintResults).toHaveLength(2);
  });

  it("handles empty sprints", async () => {
    const inner = { name: "inner", async run(input: unknown) { return input; } };
    const result = await new Sprint(inner).run({ sprints: [] });
    expect((result as any).sprintResults).toEqual([]);
  });

  it("handles non-dict input", async () => {
    const inner = { name: "inner", async run(input: unknown) { return input; } };
    const result = await new Sprint(inner).run("not a dict");
    expect((result as any).sprintResults).toEqual([]);
  });

  it("accumulates lastMetrics across all sprint items", async () => {
    const inner = {
      name: "inner",
      lastMetrics: null as { cost: number; inputTokens: number; outputTokens: number } | null,
      async run(input: unknown) {
        this.lastMetrics = { cost: 0.25, inputTokens: 100, outputTokens: 50 };
        return `done: ${JSON.stringify(input)}`;
      },
    };
    const sprint = new Sprint(inner);
    await sprint.run({ sprints: [{ name: "auth" }, { name: "dashboard" }] });

    expect(sprint.lastMetrics).toEqual({
      cost: 0.50,
      inputTokens: 200,
      outputTokens: 100,
    });
  });

  it("lastMetrics available after error (partial accumulation)", async () => {
    let callCount = 0;
    const inner = {
      name: "inner",
      lastMetrics: null as { cost: number; inputTokens: number; outputTokens: number } | null,
      async run(_input: unknown) {
        callCount++;
        this.lastMetrics = { cost: 0.10, inputTokens: 100, outputTokens: 50 };
        if (callCount === 2) throw new Error("boom");
        return "done";
      },
    };
    const sprint = new Sprint(inner);

    await expect(sprint.run({ sprints: [{ name: "a" }, { name: "b" }] })).rejects.toThrow();
    // Only the first sprint item's metrics are accumulated; the second threw before accumulation
    expect(sprint.lastMetrics).toEqual({
      cost: 0.10,
      inputTokens: 100,
      outputTokens: 50,
    });
  });
});
