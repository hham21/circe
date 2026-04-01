import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SkillRegistry } from "../../src/tools/skills.js";

describe("SkillRegistry", () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = mkdtempSync(join(tmpdir(), "circe-skills-"));
    const qaDir = join(skillsDir, "qa");
    mkdirSync(qaDir);
    writeFileSync(
      join(qaDir, "SKILL.md"),
      `---\nname: qa\ndescription: Test web apps with Playwright\n---\n\n# QA Methodology\n1. Navigate to the app\n2. Take screenshots\n`
    );
    const browseDir = join(skillsDir, "browse");
    mkdirSync(browseDir);
    writeFileSync(
      join(browseDir, "SKILL.md"),
      `---\nname: browse\ndescription: Navigate websites\n---\n\n# Browse instructions\nOpen the URL.\n`
    );
  });

  afterEach(() => {
    rmSync(skillsDir, { recursive: true, force: true });
  });

  it("lists discovered skills", () => {
    const registry = new SkillRegistry([skillsDir]);
    const skills = registry.listSkills();
    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name);
    expect(names).toContain("qa");
    expect(names).toContain("browse");
  });

  it("returns skill description", () => {
    const registry = new SkillRegistry([skillsDir]);
    const skills = registry.listSkills();
    const qa = skills.find((s) => s.name === "qa")!;
    expect(qa.description).toBe("Test web apps with Playwright");
  });

  it("loads full skill content", () => {
    const registry = new SkillRegistry([skillsDir]);
    const content = registry.getSkill("qa");
    expect(content).toContain("# QA Methodology");
    expect(content).toContain("Take screenshots");
  });

  it("returns null for unknown skill", () => {
    const registry = new SkillRegistry([skillsDir]);
    expect(registry.getSkill("nonexistent")).toBeNull();
  });

  it("generates prompt summary", () => {
    const registry = new SkillRegistry([skillsDir]);
    const summary = registry.promptSummary(["qa", "browse"]);
    expect(summary).toContain("qa");
    expect(summary).toContain("browse");
  });
});

describe("SkillRegistry multi-directory", () => {
  let localDir: string;
  let globalDir: string;

  beforeEach(() => {
    localDir = mkdtempSync(join(tmpdir(), "circe-local-"));
    globalDir = mkdtempSync(join(tmpdir(), "circe-global-"));

    // local has "qa"
    const qaDir = join(localDir, "qa");
    mkdirSync(qaDir);
    writeFileSync(
      join(qaDir, "SKILL.md"),
      `---\nname: qa\ndescription: Local QA skill\n---\n\n# Local QA\nLocal version.`
    );

    // global has "qa" (should be shadowed) and "browse"
    const qaGlobalDir = join(globalDir, "qa");
    mkdirSync(qaGlobalDir);
    writeFileSync(
      join(qaGlobalDir, "SKILL.md"),
      `---\nname: qa\ndescription: Global QA skill\n---\n\n# Global QA\nGlobal version.`
    );

    const browseDir = join(globalDir, "browse");
    mkdirSync(browseDir);
    writeFileSync(
      join(browseDir, "SKILL.md"),
      `---\nname: browse\ndescription: Navigate websites\n---\n\n# Browse\nBrowse instructions.`
    );
  });

  afterEach(() => {
    rmSync(localDir, { recursive: true, force: true });
    rmSync(globalDir, { recursive: true, force: true });
  });

  it("accepts array of directories", () => {
    const registry = new SkillRegistry([localDir, globalDir]);
    const skills = registry.listSkills();
    expect(skills.length).toBe(2); // qa (local) + browse (global)
  });

  it("local shadows global for same name", () => {
    const registry = new SkillRegistry([localDir, globalDir]);
    const content = registry.getSkill("qa");
    expect(content).toContain("Local QA");
    expect(content).not.toContain("Global QA");
  });

  it("falls back to global for skills not in local", () => {
    const registry = new SkillRegistry([localDir, globalDir]);
    const content = registry.getSkill("browse");
    expect(content).toContain("Browse instructions");
  });

  it("returns null for nonexistent skill", () => {
    const registry = new SkillRegistry([localDir, globalDir]);
    expect(registry.getSkill("nonexistent")).toBeNull();
  });

  it("validateSkills passes for existing skills", () => {
    const registry = new SkillRegistry([localDir, globalDir]);
    expect(() => registry.validateSkills(["qa", "browse"])).not.toThrow();
  });

  it("validateSkills throws for missing skills", () => {
    const registry = new SkillRegistry([localDir, globalDir]);
    expect(() => registry.validateSkills(["qa", "nonexistent"])).toThrow(
      "Required skill(s) not found: nonexistent"
    );
  });

  it("promptSummary returns formatted summary", () => {
    const registry = new SkillRegistry([localDir, globalDir]);
    const summary = registry.promptSummary(["qa", "browse"]);
    expect(summary).toContain("qa: Local QA skill");
    expect(summary).toContain("browse: Navigate websites");
    expect(summary).toContain("mcp__circe-skills__use_skill");
  });

  it("promptSummary returns empty string for no skills", () => {
    const registry = new SkillRegistry([localDir, globalDir]);
    expect(registry.promptSummary([])).toBe("");
  });

  it("getSkillInfo returns source directory", () => {
    const registry = new SkillRegistry([localDir, globalDir]);
    const qa = registry.getSkillInfo("qa");
    expect(qa?.source).toBe(localDir);
    const browse = registry.getSkillInfo("browse");
    expect(browse?.source).toBe(globalDir);
  });
});
