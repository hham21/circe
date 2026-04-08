import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SKILL_FILENAME = "SKILL.md";

export interface SkillInfo {
  name: string;
  description: string;
  source: string; // directory path where found
}

export class SkillRegistry {
  private searchDirs: string[];

  constructor(dirs: string[]) {
    this.searchDirs = dirs;
  }

  listSkills(): SkillInfo[] {
    const visitedNames = new Set<string>();
    const skills: SkillInfo[] = [];

    for (const dir of this.searchDirs) {
      this.collectSkillsFromDir(dir, visitedNames, skills);
    }

    return skills;
  }

  getSkillInfo(name: string): SkillInfo | null {
    for (const dir of this.searchDirs) {
      const skill = this.readSkillInfoFromDir(dir, name);
      if (skill) return skill;
    }
    return null;
  }

  getSkill(name: string): string | null {
    for (const dir of this.searchDirs) {
      const skillFilePath = this.buildSkillFilePath(dir, name);
      if (!existsSync(skillFilePath)) continue;
      return readFileSync(skillFilePath, "utf-8");
    }
    return null;
  }

  promptSummary(names: string[]): string {
    const skillSummaryLines = names
      .map((name) => this.getSkillInfo(name))
      .filter((info): info is SkillInfo => info !== null)
      .map((info) => `- ${info.name}: ${info.description}`);

    if (skillSummaryLines.length === 0) return "";
    return `Available skills (call mcp__circe-skills__use_skill to load full methodology):\n${skillSummaryLines.join("\n")}`;
  }

  validateSkills(names: string[]): void {
    const missingSkills = names.filter((name) => this.getSkillInfo(name) === null);
    if (missingSkills.length > 0) {
      throw new Error(`Required skill(s) not found: ${missingSkills.join(", ")}`);
    }
  }

  private collectSkillsFromDir(dir: string, visitedNames: Set<string>, skills: SkillInfo[]): void {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (visitedNames.has(entry.name)) continue;

      const skill = this.readSkillInfoFromDir(dir, entry.name);
      if (skill) {
        visitedNames.add(entry.name);
        skills.push(skill);
      }
    }
  }

  private buildSkillFilePath(dir: string, skillName: string): string {
    return join(dir, skillName, SKILL_FILENAME);
  }

  private readSkillInfoFromDir(dir: string, skillName: string): SkillInfo | null {
    const skillFilePath = this.buildSkillFilePath(dir, skillName);
    if (!existsSync(skillFilePath)) return null;

    const content = readFileSync(skillFilePath, "utf-8");
    const parsedFrontmatter = this.parseFrontmatter(content);
    if (!parsedFrontmatter.name) return null;

    return {
      name: parsedFrontmatter.name,
      description: parsedFrontmatter.description ?? "",
      source: dir,
    };
  }

  private parseFrontmatter(text: string): Record<string, string> {
    const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return {};

    const frontmatterBody = match[1];
    const result: Record<string, string> = {};
    for (const line of frontmatterBody.split("\n")) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      result[key] = value;
    }
    return result;
  }
}
