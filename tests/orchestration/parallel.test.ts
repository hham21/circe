import { describe, it, expect } from "vitest";
import { Parallel } from "../../src/orchestration/parallel.js";

describe("Parallel", () => {
  it("runs agents concurrently and merges by name", async () => {
    const a = { name: "frontend", async run() { return "react-app"; } };
    const b = { name: "backend", async run() { return "fastapi-server"; } };
    const result = await new Parallel(a, b).run("spec");
    expect(result).toEqual({ frontend: "react-app", backend: "fastapi-server" });
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
});
