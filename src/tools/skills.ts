import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface SkillInfo {
  name: string;
  description: string;
  source: string; // directory path where found
}

export class SkillRegistry {
  private dirs: string[];

  constructor(dirs: string[]) {
    this.dirs = dirs;
  }

  listSkills(): SkillInfo[] {
    const seenSkillNames = new Set<string>();
    const skills: SkillInfo[] = [];

    for (const dir of this.dirs) {
      if (!existsSync(dir)) continue;

      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (seenSkillNames.has(entry.name)) continue;

        const skill = this.readSkillInfoFromDir(dir, entry.name);
        if (skill) {
          seenSkillNames.add(entry.name);
          skills.push(skill);
        }
      }
    }

    return skills;
  }

  getSkillInfo(name: string): SkillInfo | null {
    for (const dir of this.dirs) {
      const skill = this.readSkillInfoFromDir(dir, name);
      if (skill) return skill;
    }
    return null;
  }

  getSkill(name: string): string | null {
    for (const dir of this.dirs) {
      const skillFilePath = this.buildSkillFilePath(dir, name);
      if (!existsSync(skillFilePath)) continue;
      return readFileSync(skillFilePath, "utf-8");
    }
    return null;
  }

  validateSkills(names: string[]): void {
    const missingSkills = names.filter((name) => this.getSkillInfo(name) === null);
    if (missingSkills.length > 0) {
      throw new Error(`Required skill(s) not found: ${missingSkills.join(", ")}`);
    }
  }

  promptSummary(names: string[]): string {
    const summaryLines = names
      .map((name) => this.getSkillInfo(name))
      .filter((info): info is SkillInfo => info !== null)
      .map((info) => `- ${info.name}: ${info.description}`);

    if (summaryLines.length === 0) return "";
    return `Available skills (call mcp__circe-skills__use_skill to load full methodology):\n${summaryLines.join("\n")}`;
  }

  private buildSkillFilePath(dir: string, skillName: string): string {
    return join(dir, skillName, "SKILL.md");
  }

  private readSkillInfoFromDir(dir: string, skillName: string): SkillInfo | null {
    const skillFilePath = this.buildSkillFilePath(dir, skillName);
    if (!existsSync(skillFilePath)) return null;

    const content = readFileSync(skillFilePath, "utf-8");
    const frontmatter = this.parseFrontmatter(content);
    if (!frontmatter.name) return null;

    return {
      name: frontmatter.name,
      description: frontmatter.description ?? "",
      source: dir,
    };
  }

  private parseFrontmatter(text: string): Record<string, string> {
    const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return {};

    const result: Record<string, string> = {};
    for (const line of match[1].split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      result[key] = value;
    }
    return result;
  }
}
