import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OutputFormatter } from "../../src/cli/output.js";

// Matches any ANSI color escape sequence; tests strip these to assert plain text.
const ANSI = /\x1b\[[0-9;]*m/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

describe("OutputFormatter — basics", () => {
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

  it("terminal output uses HH:MM:SS (not ISO)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fmt = new OutputFormatter("info");
    fmt.agentStart("planner", "desc");
    const terminalLine = stripAnsi(spy.mock.calls.map((c) => String(c[0])).join("\n"));
    expect(terminalLine).toMatch(/\b\d{2}:\d{2}:\d{2}\b/);
    expect(terminalLine).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no ISO
    spy.mockRestore();
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

describe("kindLabel padding (regression: off-by-one width)", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("[thinking] marker has trailing space (width 11, not 10)", () => {
    const fmt = new OutputFormatter("trace");
    fmt.setLogFile(logPath);
    fmt.logThinking("planner", "analyzing");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    // [thinking] is 10 chars. padEnd(11) leaves at least 1 trailing space.
    // So file line should contain "[thinking] " (bracket+space), NOT "[thinking]a".
    expect(content).toMatch(/\[thinking\] /);
  });

  it("shorter markers also padded to same width as [thinking]", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.agentStart("planner", "");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    // [start] is 7 chars, padded to 11 → "[start]    "
    expect(content).toMatch(/\[start\] {4}/);
  });
});

describe("agentStart", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("file log has [start] marker after agent label", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.agentStart("planner", "Planning phase");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[planner]");
    expect(content).toContain("[start]");
    // ISO timestamp prefix
    expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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

  it("info level shows friendly summary with [call] marker", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "Bash", { command: "npm test" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[call]");
    expect(content).toContain("$ npm test");
    expect(content).not.toContain('"command"');
  });

  it("debug level shows full args JSON with toolName (regression: toolName must be present)", () => {
    const fmt = new OutputFormatter("debug");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "Bash", { command: "npm test", description: "Run tests" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[call]");
    // toolName must appear between the [call] marker and the args JSON so
    // grep can distinguish Read/Write/Edit. Exact spacing isn't asserted to
    // stay resilient to KIND_LABEL_WIDTH tweaks.
    expect(content).toMatch(/\[call\]\s+Bash \{/);
    expect(content).toContain('"command"');
    expect(content).toContain('"description"');
  });

  it("info level uses Read summary", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "Read", { file_path: "/src/index.ts" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[call]");
    expect(content).toContain("Read /src/index.ts");
  });

  it("info level uses Write summary", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "Write", { file_path: "/src/new.ts", content: "..." });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[call]");
    expect(content).toContain("Write /src/new.ts");
  });

  it("info level uses Edit summary", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "Edit", { file_path: "/src/old.ts", old_string: "a", new_string: "b" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[call]");
    expect(content).toContain("Edit /src/old.ts");
  });

  it("info level falls back to tool name for unknown tools", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logToolCall("planner", "CustomTool", { foo: "bar" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[call]");
    expect(content).toContain("CustomTool");
    expect(content).not.toContain('"foo"');
  });

  it("debug mode keeps call entry as a single file line (grep invariant)", () => {
    const fmt = new OutputFormatter("debug");
    fmt.setLogFile(logPath);
    // Input contains real newlines in the value. JSON.stringify escapes them
    // as "\n" (backslash+n) so the rendered line is still single-line; this
    // test guards against any future regression that lets real newlines leak
    // into the file output.
    fmt.logToolCall("planner", "Write", { content: "line1\nline2\n\nline3" });
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    const callLines = content.split("\n").filter((l) => l.includes("[call]"));
    expect(callLines).toHaveLength(1);
    // Every non-empty line in the file should start with an ISO timestamp.
    // If a real newline had leaked, a subsequent line would fail this check.
    const nonEmpty = content.split("\n").filter((l) => l.length > 0);
    for (const line of nonEmpty) {
      expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
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

  it("debug level truncates at 500 chars with [result] marker", () => {
    const fmt = new OutputFormatter("debug");
    fmt.setLogFile(logPath);
    const longResult = "x".repeat(600);
    fmt.logToolResult("planner", "Bash", longResult);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[result]");
    expect(content).toContain("Bash");
    expect(content).toContain("...");
    expect(content).not.toContain("x".repeat(600));
  });

  it("trace level shows full result (compacted whitespace)", () => {
    const fmt = new OutputFormatter("trace");
    fmt.setLogFile(logPath);
    const longResult = "x".repeat(600);
    fmt.logToolResult("planner", "Bash", longResult);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("x".repeat(600));
  });

  it("StructuredOutput tool → compact result 'ok'", () => {
    const fmt = new OutputFormatter("debug");
    fmt.setLogFile(logPath);
    fmt.logToolResult(
      "critic",
      "StructuredOutput",
      '{"passed":false,"scores":{"quality":5},"feedback":["too long"]}',
    );
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    const resultLine = content.split("\n").find((l) => l.includes("[result]"));
    expect(resultLine).toBeDefined();
    expect(resultLine).toContain("StructuredOutput ok");
    // raw JSON should NOT leak into the result line
    expect(resultLine).not.toContain('"passed"');
  });

  it("multiline result compressed to single line in file log", () => {
    const fmt = new OutputFormatter("debug");
    fmt.setLogFile(logPath);
    fmt.logToolResult("planner", "Bash", "line1\nline2\nline3");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    const resultLine = content.split("\n").find((l) => l.includes("[result]"));
    expect(resultLine).toBeDefined();
    // no embedded newlines (the split("\n") guarantees this if the assertion passes)
    expect(resultLine).toContain("line1 line2 line3");
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

  it("logged at trace level with [thinking] marker", () => {
    const fmt = new OutputFormatter("trace");
    fmt.setLogFile(logPath);
    fmt.logThinking("planner", "Let me analyze the code structure");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[thinking]");
    expect(content).toContain("Let me analyze the code structure");
  });

  it("file log compresses multiline reasoning to single line", () => {
    const fmt = new OutputFormatter("trace");
    fmt.setLogFile(logPath);
    fmt.logThinking("planner", "First step.\nSecond step.\n\nThird step.");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    const thinkingLine = content.split("\n").find((l) => l.includes("[thinking]"));
    expect(thinkingLine).toBeDefined();
    expect(thinkingLine).toContain("First step. Second step. Third step.");
    // Every non-empty line in the file should start with a timestamp (grep invariant)
    const lines = content.split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe("agentDone", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const longResult =
    "This is a very long result that exceeds eighty characters so truncation applies to the summary preview line";

  it("info level: main line with [done] marker, no trace extra", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", longResult, [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[done]");
    expect(content).toContain("…"); // preview truncation ellipsis
    // only ONE [done] line (no trace extra)
    const doneLines = content.split("\n").filter((l) => l.includes("[done]"));
    expect(doneLines).toHaveLength(1);
  });

  it("debug level: same as info (no trace extra)", () => {
    const fmt = new OutputFormatter("debug");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", longResult, [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[done]");
    const doneLines = content.split("\n").filter((l) => l.includes("[done]"));
    expect(doneLines).toHaveLength(1);
  });

  it("trace level: main line + full result extra line", () => {
    const fmt = new OutputFormatter("trace");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", longResult, [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    const doneLines = content.split("\n").filter((l) => l.includes("[done]"));
    expect(doneLines).toHaveLength(2);
    // the second line should contain the full result (not truncated)
    expect(doneLines[1]).toContain("truncation applies");
  });

  it("trace level: empty result skips extra line", () => {
    const fmt = new OutputFormatter("trace");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", "", [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    const doneLines = content.split("\n").filter((l) => l.includes("[done]"));
    expect(doneLines).toHaveLength(1);
  });

  it("no logLevel: still prints main line, no extra", () => {
    const fmt = new OutputFormatter();
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", longResult, [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[planner]");
    expect(content).toContain("[done]");
    const doneLines = content.split("\n").filter((l) => l.includes("[done]"));
    expect(doneLines).toHaveLength(1);
  });

  it("StructuredOutput result → summarized preview (passed=X quality=Y)", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.agentDone(
      "critic",
      '{"passed":false,"scores":{"quality":5},"feedback":["too short"]}',
      [100, 50],
      0.05,
    );
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("passed=false");
    expect(content).toContain("quality=5");
    // The raw JSON should NOT be the main preview
    const doneLine = content.split("\n").find((l) => l.includes("[done]"));
    expect(doneLine).toBeDefined();
    expect(doneLine).not.toMatch(/"feedback"/);
  });

  it("structured result with only passed → 'passed=X'", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.agentDone("critic", '{"passed":true}', [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("passed=true");
  });

  it("ERROR: prefix result → fallback to preview (no summarization)", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", "ERROR: connection timeout", [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("ERROR: connection timeout");
    expect(content).not.toContain("passed=");
  });

  it("non-JSON result → fallback to buildResultPreview", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", "plain text result here", [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("plain text result here");
    expect(content).not.toContain("passed=");
  });

  it("JSON array result → fallback (no summarization)", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", "[1,2,3]", [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[1,2,3]");
    expect(content).not.toContain("passed=");
  });

  it("empty object → fallback", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.agentDone("planner", "{}", [100, 50], 0.05);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("{}");
    expect(content).not.toContain("passed=");
  });
});

describe("logInfo", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("file log contains [info] marker", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logInfo("Starting pipeline");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[info]");
    expect(content).toContain("Starting pipeline");
  });
});

describe("logResult", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("file log uses [final] prefix, not [result] (grep collision avoidance)", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logResult("Pipeline completed successfully");
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[final]");
    expect(content).toContain("Pipeline completed");
    // [result] is reserved for tool results; logResult must NOT use it
    const finalLine = content.split("\n").find((l) => l.includes("[final]"));
    expect(finalLine).toBeDefined();
    expect(finalLine).not.toContain("[result]");
  });

  it("terminal output uses green 'Result:' (no bracket marker)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fmt = new OutputFormatter("info");
    fmt.logResult("done");
    const terminalOutput = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(stripAnsi(terminalOutput)).toContain("Result: done");
    spy.mockRestore();
  });
});

describe("finalSummary (regression: writeLog contract silent break)", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes two valid ISO-prefixed lines to file", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.finalSummary("/tmp/output", 65);
    fmt.close();

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("Output: /tmp/output");
    expect(content).toContain("Duration: 1m 5s");
    // no 'undefined' substring should appear anywhere (regression guard)
    expect(content).not.toContain("undefined");
    // both lines have ISO prefix
    const nonEmpty = content.split("\n").filter((l) => l.length > 0);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(2);
    for (const line of nonEmpty) {
      expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe("writeLog I/O error isolation", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "circe-output-"));
    logPath = join(tempDir, "circe.log");
  });

  afterEach(() => {
    try {
      chmodSync(tempDir, 0o755);
    } catch {}
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not throw when the log file becomes unwritable", () => {
    const fmt = new OutputFormatter("info");
    fmt.setLogFile(logPath);
    fmt.logInfo("before");

    // Make the log file read-only so subsequent writes fail
    chmodSync(logPath, 0o444);

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(() => fmt.logInfo("after1")).not.toThrow();
    expect(() => fmt.logInfo("after2")).not.toThrow();

    // At least one stderr warning was emitted, but not one per call
    const warnings = stderrSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes("Log file write failed"));
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.length).toBeLessThanOrEqual(1); // deduped

    stderrSpy.mockRestore();
    fmt.close();
  });
});
