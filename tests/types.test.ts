import { describe, it, expect } from "vitest";
import { RunContext, type Runnable } from "../src/types.js";

describe("RunContext", () => {
  it("creates with defaults", () => {
    const ctx = RunContext.parse({ workDir: "/tmp/test" });
    expect(ctx.workDir).toBe("/tmp/test");
    expect(ctx.sessionId).toBeNull();
    expect(ctx.model).toBe("claude-opus-4-6");
    expect(ctx.verbose).toBe(false);
  });

  it("creates with custom values", () => {
    const ctx = RunContext.parse({
      workDir: "/tmp/test",
      sessionId: "abc123",
      model: "claude-sonnet-4-6",
      verbose: true,
    });
    expect(ctx.sessionId).toBe("abc123");
    expect(ctx.model).toBe("claude-sonnet-4-6");
    expect(ctx.verbose).toBe(true);
  });

  it("rejects missing workDir", () => {
    expect(() => RunContext.parse({})).toThrow();
  });
});

describe("Runnable", () => {
  it("accepts object with run method", () => {
    const runnable: Runnable = {
      run: async (input: unknown) => input,
    };
    expect(runnable.run).toBeDefined();
  });
});
