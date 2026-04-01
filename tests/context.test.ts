import { describe, it, expect, beforeEach } from "vitest";
import {
  setFormatter,
  getFormatter,
  setWorkDir,
  getWorkDir,
} from "../src/context.js";

describe("context", () => {
  beforeEach(() => {
    setFormatter(null);
    setWorkDir(null);
  });

  it("returns null by default", () => {
    expect(getFormatter()).toBeNull();
    expect(getWorkDir()).toBeNull();
  });

  it("stores and retrieves formatter", () => {
    const fakeFormatter = { agent_start: () => {} } as any;
    setFormatter(fakeFormatter);
    expect(getFormatter()).toBe(fakeFormatter);
  });

  it("stores and retrieves workDir", () => {
    setWorkDir("/tmp/work");
    expect(getWorkDir()).toBe("/tmp/work");
  });
});
