import { describe, it, expect } from "vitest";
import { Pipeline } from "../../src/orchestration/pipeline.js";

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
});
