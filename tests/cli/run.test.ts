import { describe, it, expect } from "vitest";
import { slugify, resolveInput, findUniqueOutputDir } from "../../src/cli/run.js";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("slugify", () => {
  it("converts text to slug", () => {
    expect(slugify("Build a Memo App")).toBe("build-a-memo-app");
  });

  it("removes special characters", () => {
    expect(slugify("Hello, World! #123")).toBe("hello-world-123");
  });

  it("trims and collapses dashes", () => {
    expect(slugify("  too   many   spaces  ")).toBe("too-many-spaces");
  });

  it("truncates long slugs", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(50);
  });
});

describe("resolveInput", () => {
  it("returns string as-is", () => {
    expect(resolveInput("Build an app")).toBe("Build an app");
  });

  it("reads file content when path exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "circe-input-"));
    const file = join(dir, "spec.md");
    writeFileSync(file, "# My Spec\nBuild something.");
    expect(resolveInput(file)).toBe("# My Spec\nBuild something.");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("findUniqueOutputDir", () => {
  it("returns base path when it does not exist", () => {
    const dir = join(tmpdir(), `circe-test-${Date.now()}`);
    expect(findUniqueOutputDir(dir, "test")).toBe(join(dir, "test"));
  });

  it("appends number when dir exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "circe-output-"));
    mkdirSync(join(dir, "test"));
    const result = findUniqueOutputDir(dir, "test");
    expect(result).toBe(join(dir, "test-1"));
    rmSync(dir, { recursive: true, force: true });
  });
});
