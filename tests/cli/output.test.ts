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

describe("LogLevel and timestamps", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes ISO timestamps to log file", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logInfo("test message");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /m);
  });

  it("no tool logging when logLevel is undefined", () => {
    const fmt = new OutputFormatter();
    fmt.setLogFile(logPath);
    fmt.logToolCall("agent", "Bash", { command: "npm test" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).not.toContain("Bash");
  });
});

describe("logToolCall", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("info level shows friendly summary", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "Bash", { command: "npm test" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("$ npm test");
    expect(content).not.toContain('"command"');
  });

  it("debug level shows full args JSON", () => {
    const fmt = new OutputFormatter("debug");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "Bash", { command: "npm test", description: "Run tests" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("Bash");
    expect(content).toContain('"command"');
    expect(content).toContain('"description"');
  });

  it("info level uses Read summary", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "Read", { file_path: "/src/index.ts" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("Read /src/index.ts");
  });

  it("info level uses Write summary", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "Write", { file_path: "/src/new.ts", content: "..." });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("Write /src/new.ts");
  });

  it("info level uses Edit summary", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "Edit", { file_path: "/src/old.ts", old_string: "a", new_string: "b" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("Edit /src/old.ts");
  });

  it("info level falls back to tool name for unknown tools", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "CustomTool", { foo: "bar" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("CustomTool");
    expect(content).not.toContain("foo");
  });
});

describe("logToolResult", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("not logged at info level", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolResult("planner", "Bash", "test output");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).not.toContain("test output");
  });

  it("debug level truncates at 500 chars", () => {
    const fmt = new OutputFormatter("debug");
    fmt.setLogFile(logPath);
    const longResult = "x".repeat(600);
    fmt.logToolResult("planner", "Bash", longResult);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("<- Bash");
    expect(content).toContain("...");
    expect(content).not.toContain("x".repeat(600));
  });

  it("trace level shows full result", () => {
    const fmt = new OutputFormatter("trace");
    fmt.setLogFile(logPath);
    const longResult = "x".repeat(600);
    fmt.logToolResult("planner", "Bash", longResult);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("x".repeat(600));
  });
});

describe("logThinking", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("not logged at info level", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logThinking("planner", "Let me analyze...");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).not.toContain("thinking");
  });

  it("not logged at debug level", () => {
    const fmt = new OutputFormatter("debug");
    fmt.setLogFile(logPath);
    fmt.logThinking("planner", "Let me analyze...");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).not.toContain("thinking");
  });

  it("logged at trace level", () => {
    const fmt = new OutputFormatter("trace");
    fmt.setLogFile(logPath);
    fmt.logThinking("planner", "Let me analyze the code structure");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[thinking]");
    expect(content).toContain("Let me analyze the code structure");
  });
});

describe("agentDone full result at trace level", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const longResult = "This is a very long result that exceeds fifty characters so truncation will apply to the summary preview line";

  it("info level: only 50-char preview, no full result line", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", longResult, [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("…");
    expect(content).not.toContain(">> This is a very long result");
    expect(content).not.toContain("truncation will apply");
  });

  it("debug level: only 50-char preview, no full result line", () => {
    const fmt = new OutputFormatter("debug");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", longResult, [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("…");
    expect(content).not.toContain(">> This is a very long result");
  });

  it("trace level: preview + full result line", () => {
    const fmt = new OutputFormatter("trace");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", longResult, [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("…");
    expect(content).toContain(">> " + longResult);
  });

  it("trace level: skips full result line when result is empty", () => {
    const fmt = new OutputFormatter("trace");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", "", [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).not.toContain(">> ");
  });

  it("no logLevel: agentDone summary still prints but no full result line", () => {
    const fmt = new OutputFormatter();
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", longResult, [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[planner]");
    expect(content).not.toContain(">> ");
  });
});
