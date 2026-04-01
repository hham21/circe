import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseAgent, agent } from "../src/agent.js";
import { QAReportSchema } from "../src/handoff.js";
import { setSkillRegistry } from "../src/context.js";
import { SkillRegistry } from "../src/tools/skills.js";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

describe("BaseAgent", () => {
  it("creates with defaults", () => {
    const a = new BaseAgent({ name: "test", prompt: "You are a tester." });
    expect(a.name).toBe("test");
    expect(a.prompt).toBe("You are a tester.");
    expect(a.tools).toBeNull();
    expect(a.skills).toEqual([]);
    expect(a.contextStrategy).toBe("compaction");
    expect(a.permissionMode).toBe("bypassPermissions");
    expect(a.continueSession).toBe(false);
  });

  it("creates with custom config", () => {
    const a = new BaseAgent({
      name: "evaluator",
      prompt: "Evaluate the app.",
      tools: ["Read", "Bash"],
      skills: ["qa"],
      contextStrategy: "reset",
      continueSession: true,
    });
    expect(a.tools).toEqual(["Read", "Bash"]);
    expect(a.skills).toEqual(["qa"]);
    expect(a.contextStrategy).toBe("reset");
    expect(a.continueSession).toBe(true);
  });

  it("builds system prompt without skills", () => {
    const a = new BaseAgent({ name: "test", prompt: "Base prompt." });
    const result = a.buildSystemPrompt();
    expect(result).toBe("Base prompt.");
  });

  it("builds system prompt with skill registry via context", () => {
    const mockRegistry = {
      promptSummary: (_names: string[]) => "Available skills:\n- qa: Test apps",
    };
    setSkillRegistry(mockRegistry as any);
    const a = new BaseAgent({ name: "test", prompt: "Base prompt.", skills: ["qa"] });
    const result = a.buildSystemPrompt();
    setSkillRegistry(null);
    expect(result).toContain("Base prompt.");
    expect(result).toContain("Available skills:");
  });

  it("extracts JSON from markdown code block", () => {
    const a = new BaseAgent({ name: "test", prompt: "" });
    const text = 'Here is the result:\n```json\n{"passed": true}\n```';
    const extracted = a.extractJson(text);
    expect(extracted).toBe('{"passed": true}');
  });

  it("extracts raw JSON object", () => {
    const a = new BaseAgent({ name: "test", prompt: "" });
    const text = 'Some text {"key": "value"} more text';
    const extracted = a.extractJson(text);
    expect(extracted).toBe('{"key": "value"}');
  });

  it("returns null for no JSON", () => {
    const a = new BaseAgent({ name: "test", prompt: "" });
    expect(a.extractJson("no json here")).toBeNull();
  });

  it("parses result with output schema", () => {
    const a = new BaseAgent({
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
    const a = new BaseAgent({ name: "test", prompt: "" });
    const result = a.parseResult("plain text");
    expect(result).toBe("plain text");
  });

  it("returns raw string when JSON parsing fails", () => {
    const a = new BaseAgent({
      name: "test",
      prompt: "",
      outputSchema: QAReportSchema,
    });
    const result = a.parseResult("not valid json at all");
    expect(result).toBe("not valid json at all");
  });

  it("estimates cost", () => {
    const a = new BaseAgent({ name: "test", prompt: "" });
    const cost = a.estimateCost(1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(90.0);
  });

  it("stores inputSchema when provided", () => {
    const a = new BaseAgent({
      name: "test",
      prompt: "",
      inputSchema: QAReportSchema,
    });
    expect(a.inputSchema).toBe(QAReportSchema);
  });

  it("inputSchema defaults to null", () => {
    const a = new BaseAgent({ name: "test", prompt: "" });
    expect(a.inputSchema).toBeNull();
  });
});

describe("agent factory", () => {
  it("creates a BaseAgent from config", () => {
    const myAgent = agent({
      name: "planner",
      prompt: "Plan the app.",
      tools: ["Read"],
    });
    expect(myAgent).toBeInstanceOf(BaseAgent);
    expect(myAgent.name).toBe("planner");
  });
});

describe("BaseAgent skill integration", () => {
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
