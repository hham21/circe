import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Agent, agent, loadAgent } from "../src/agent.js";
import { QAReportSchema } from "../src/handoff.js";
import { setSkillRegistry, setWorkDir } from "../src/context.js";
import { SkillRegistry } from "../src/tools/skills.js";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

describe("Agent", () => {
  it("creates with defaults", () => {
    const a = new Agent({ name: "test", prompt: "You are a tester." });
    expect(a.name).toBe("test");
    expect(a.prompt).toBe("You are a tester.");
    expect(a.tools).toBeNull();
    expect(a.disallowedTools).toEqual([]);
    expect(a.skills).toEqual([]);
    expect(a.contextStrategy).toBe("compaction");
    expect(a.permissionMode).toBe("bypassPermissions");
    expect(a.continueSession).toBe(false);
  });

  it("creates with custom config", () => {
    const a = new Agent({
      name: "evaluator",
      prompt: "Evaluate the app.",
      tools: ["Read", "Bash"],
      skills: ["qa"],
      contextStrategy: "reset",
      continueSession: true,
    });
    expect(a.tools).toEqual(["Read", "Bash"]);
    expect(a.disallowedTools).toEqual([]);
    expect(a.skills).toEqual(["qa"]);
    expect(a.contextStrategy).toBe("reset");
    expect(a.continueSession).toBe(true);
  });

  it("creates with custom disallowedTools", () => {
    const a = new Agent({
      name: "safe",
      prompt: "No file access.",
      disallowedTools: ["Bash", "Write", "Edit"],
    });
    expect(a.disallowedTools).toEqual(["Bash", "Write", "Edit"]);
  });

  it("builds system prompt without skills", () => {
    const a = new Agent({ name: "test", prompt: "Base prompt." });
    const result = a.buildSystemPrompt();
    expect(result).toBe("Base prompt.");
  });

  it("builds system prompt with skill registry via context", () => {
    const mockRegistry = {
      promptSummary: (_names: string[]) => "Available skills:\n- qa: Test apps",
    };
    setSkillRegistry(mockRegistry as any);
    const a = new Agent({ name: "test", prompt: "Base prompt.", skills: ["qa"] });
    const result = a.buildSystemPrompt();
    setSkillRegistry(null);
    expect(result).toContain("Base prompt.");
    expect(result).toContain("Available skills:");
  });

  it("extracts JSON from markdown code block", () => {
    const a = new Agent({ name: "test", prompt: "" });
    const text = 'Here is the result:\n```json\n{"passed": true}\n```';
    const extracted = a.extractJson(text);
    expect(extracted).toBe('{"passed": true}');
  });

  it("extracts raw JSON object", () => {
    const a = new Agent({ name: "test", prompt: "" });
    const text = 'Some text {"key": "value"} more text';
    const extracted = a.extractJson(text);
    expect(extracted).toBe('{"key": "value"}');
  });

  it("returns null for no JSON", () => {
    const a = new Agent({ name: "test", prompt: "" });
    expect(a.extractJson("no json here")).toBeNull();
  });

  it("parses result with output schema", () => {
    const a = new Agent({
      name: "test",
      prompt: "",
      outputSchema: QAReportSchema,
    });
    const raw = '{"passed": true, "scores": {"quality": 8}, "feedback": ["Good"]}';
    const result = a.parseResult(raw) as any;
    expect(result.passed).toBe(true);
    expect(result.scores.quality).toBe(8);
  });

  it("returns raw string when no output schema", () => {
    const a = new Agent({ name: "test", prompt: "" });
    const result = a.parseResult("plain text");
    expect(result).toBe("plain text");
  });

  it("returns raw string when JSON parsing fails", () => {
    const a = new Agent({
      name: "test",
      prompt: "",
      outputSchema: QAReportSchema,
    });
    const result = a.parseResult("not valid json at all");
    expect(result).toBe("not valid json at all");
  });

  it("estimates cost with default pricing", () => {
    const a = new Agent({ name: "test", prompt: "" });
    const cost = a.estimateCost(1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(90.0);
  });

  it("estimates cost with custom costPerMTokens", () => {
    const a = new Agent({
      name: "test",
      prompt: "",
      costPerMTokens: { input: 3, output: 15 },
    });
    const cost = a.estimateCost(1_000_000, 1_000_000);
    // (1M * 3 + 1M * 15) / 1M = 18
    expect(cost).toBeCloseTo(18.0);
  });

  it("stores inputSchema when provided", () => {
    const a = new Agent({
      name: "test",
      prompt: "",
      inputSchema: QAReportSchema,
    });
    expect(a.inputSchema).toBe(QAReportSchema);
  });

  it("inputSchema defaults to null", () => {
    const a = new Agent({ name: "test", prompt: "" });
    expect(a.inputSchema).toBeNull();
  });
});

describe("agent factory", () => {
  it("creates an Agent from config", () => {
    const myAgent = agent({
      name: "planner",
      prompt: "Plan the app.",
      tools: ["Read"],
    });
    expect(myAgent).toBeInstanceOf(Agent);
    expect(myAgent.name).toBe("planner");
  });
});

describe("Agent skill integration", () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = mkdtempSync(join(tmpdir(), "circe-agent-skills-"));
    const qaDir = join(skillsDir, "qa");
    mkdirSync(qaDir);
    writeFileSync(
      join(qaDir, "SKILL.md"),
      `---\nname: qa\ndescription: Test web apps\n---\n\n# QA content`
    );
    setSkillRegistry(new SkillRegistry([skillsDir]));
  });

  afterEach(() => {
    rmSync(skillsDir, { recursive: true, force: true });
    setSkillRegistry(null);
  });

  it("buildSystemPrompt includes skill summary when skills declared", () => {
    const a = agent({ name: "test", prompt: "Base prompt.", skills: ["qa"] });
    const prompt = a.buildSystemPrompt();
    expect(prompt).toContain("Base prompt.");
    expect(prompt).toContain("qa: Test web apps");
    expect(prompt).toContain("mcp__circe-skills__use_skill");
  });

  it("buildSystemPrompt unchanged when no skills declared", () => {
    const a = agent({ name: "test", prompt: "Base prompt." });
    const prompt = a.buildSystemPrompt();
    expect(prompt).toBe("Base prompt.");
  });

  it("buildSystemPrompt unchanged when no registry set", () => {
    setSkillRegistry(null);
    const a = agent({ name: "test", prompt: "Base prompt.", skills: ["qa"] });
    const prompt = a.buildSystemPrompt();
    expect(prompt).toBe("Base prompt.");
  });

  it("run throws when declared skill is missing", async () => {
    const a = agent({ name: "test", prompt: "Do stuff.", skills: ["nonexistent"] });
    await expect(a.run("hello")).rejects.toThrow("Required skill(s) not found: nonexistent");
  });
});

describe("Agent.buildUserPrompt", () => {
  afterEach(() => setWorkDir(null));

  it("includes workDir rule when set", () => {
    setWorkDir("/tmp/test-project");
    const a = new Agent({ name: "test", prompt: "" });
    const prompt = a.buildUserPrompt("build an app");
    expect(prompt).toContain("/tmp/test-project");
    expect(prompt).toContain("build an app");
  });

  it("includes fallback rule when no workDir", () => {
    const a = new Agent({ name: "test", prompt: "" });
    const prompt = a.buildUserPrompt("build an app");
    expect(prompt).toContain("relative paths");
  });

  it("handles null input", () => {
    const a = new Agent({ name: "test", prompt: "" });
    const prompt = a.buildUserPrompt(null);
    expect(prompt).toContain("relative paths");
    expect(prompt).not.toContain("null");
  });

  it("stringifies object input as JSON", () => {
    const a = new Agent({ name: "test", prompt: "" });
    const prompt = a.buildUserPrompt({ key: "value" });
    expect(prompt).toContain('"key": "value"');
  });
});

describe("Agent outputFormat", () => {
  it("caches JSON Schema from outputSchema in constructor", () => {
    const a = new Agent({
      name: "test",
      prompt: "",
      outputSchema: QAReportSchema,
    });
    // Access private field via any cast
    const jsonSchema = (a as any).outputJsonSchema;
    expect(jsonSchema).toBeTruthy();
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.properties).toBeDefined();
  });

  it("does not create JSON Schema without outputSchema", () => {
    const a = new Agent({ name: "test", prompt: "" });
    expect((a as any).outputJsonSchema).toBeNull();
  });

  it("validates structured output with outputSchema", () => {
    const a = new Agent({
      name: "test",
      prompt: "",
      outputSchema: QAReportSchema,
    });
    const data = { passed: true, scores: { quality: 8 }, feedback: ["Good"] };
    const result = (a as any).tryParseWithSchema(data);
    expect(result.passed).toBe(true);
    expect(result.scores.quality).toBe(8);
  });

  it("returns data as-is when tryParseWithSchema fails", () => {
    const a = new Agent({
      name: "test",
      prompt: "",
      outputSchema: QAReportSchema,
    });
    const badData = { wrong: "shape" };
    const result = (a as any).tryParseWithSchema(badData);
    expect(result).toEqual(badData);
  });

  it("returns data as-is when no outputSchema in tryParseWithSchema", () => {
    const a = new Agent({ name: "test", prompt: "" });
    const data = { any: "data" };
    const result = (a as any).tryParseWithSchema(data);
    expect(result).toEqual(data);
  });
});

describe("Agent timeout", () => {
  it("stores timeout from config", () => {
    const a = new Agent({ name: "test", prompt: "", timeout: 5000 });
    expect(a.timeout).toBe(5000);
  });

  it("defaults timeout to 0", () => {
    const a = new Agent({ name: "test", prompt: "" });
    expect(a.timeout).toBe(0);
  });
});

describe("loadAgent", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "circe-load-agent-"));
    mkdirSync(join(tmpDir, "agents"), { recursive: true });
    process.env.CIRCE_HOME = tmpDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.CIRCE_HOME;
  });

  it("loads valid agent from file", async () => {
    const config = { name: "test-agent", prompt: "You are a tester." };
    writeFileSync(join(tmpDir, "agents", "test-agent.json"), JSON.stringify(config));
    const a = await loadAgent("test-agent");
    expect(a).toBeInstanceOf(Agent);
    expect(a.name).toBe("test-agent");
  });

  it("loads agent with disallowedTools from file", async () => {
    const config = {
      name: "safe-agent",
      prompt: "No file ops.",
      disallowedTools: ["Bash", "Write"],
    };
    writeFileSync(join(tmpDir, "agents", "safe-agent.json"), JSON.stringify(config));
    const a = await loadAgent("safe-agent");
    expect(a.disallowedTools).toEqual(["Bash", "Write"]);
  });

  it("throws for missing file", async () => {
    await expect(loadAgent("nonexistent")).rejects.toThrow("Agent file not found");
  });

  it("throws for invalid JSON", async () => {
    writeFileSync(join(tmpDir, "agents", "bad.json"), "not json{{{");
    await expect(loadAgent("bad")).rejects.toThrow("Invalid JSON");
  });

  it("throws for invalid schema", async () => {
    writeFileSync(join(tmpDir, "agents", "bad-schema.json"), JSON.stringify({ foo: "bar" }));
    await expect(loadAgent("bad-schema")).rejects.toThrow("Invalid agent config");
  });
});
