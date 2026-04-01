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
});
