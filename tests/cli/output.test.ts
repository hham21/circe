import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OutputFormatter } from "../../src/cli/output.js";

describe("OutputFormatter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates formatter", () => {
    const fmt = new OutputFormatter();
    expect(fmt).toBeDefined();
  });

  it("logs to file when set", () => {
    const fmt = new OutputFormatter();
    const logPath = join(tempDir, "circe.log");
    fmt.setLogFile(logPath);
    fmt.logInfo("Test message");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("Test message");
  });

  it("tracks agent start/done", () => {
    const fmt = new OutputFormatter();
    fmt.agentStart("planner", "Planning phase");
    fmt.agentDone("planner", "done", [1000, 500], 0.05);
  });

  it("formats duration", () => {
    const fmt = new OutputFormatter();
    expect(fmt.formatDuration(65)).toBe("1m 5s");
    expect(fmt.formatDuration(3661)).toBe("1h 1m 1s");
    expect(fmt.formatDuration(30)).toBe("30s");
  });
});
