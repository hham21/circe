import { Command } from "commander";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SkillRegistry } from "../tools/skills.js";

export const skillsCommand = new Command("skills").description("Manage skills");

skillsCommand
  .command("list")
  .description("List available skills")
  .action(() => {
    const registry = createRegistry();
    const skills = registry.listSkills();
    if (skills.length === 0) {
      console.log("No skills found.");
      return;
    }
    console.log("Skills:");
    for (const skill of skills) {
      const scope = resolveSkillScope(skill.source);
      console.log(`  ${skill.name.padEnd(16)} ${skill.description.padEnd(40)} (${scope})`);
    }
  });

skillsCommand
  .command("info <name>")
  .description("Show skill details")
  .action((name: string) => {
    const registry = createRegistry();
    const info = registry.getSkillInfo(name);
    if (!info) {
      console.error(`Skill '${name}' not found.`);
      process.exit(1);
    }
    const scope = resolveSkillScope(info.source);
    console.log(`Name:        ${info.name}`);
    console.log(`Description: ${info.description}`);
    console.log(`Source:      ${info.source} (${scope})`);
    console.log(`---`);
    const content = registry.getSkill(name);
    if (content) console.log(content);
  });

skillsCommand
  .command("create <name>")
  .description("Create a new skill from template")
  .option("--global", "Create in global skills directory")
  .action((name: string, options: { global?: boolean }) => {
    const baseDir = options.global ? globalSkillsDir() : localSkillsDir();
    const skillDir = join(baseDir, name);
    const skillFile = join(skillDir, "SKILL.md");

    if (existsSync(skillFile)) {
      console.error(`Skill '${name}' already exists at ${skillDir}`);
      process.exit(1);
    }

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillFile, buildSkillTemplate(name));
    console.log(`Skill '${name}' created at ${skillFile}`);
  });

skillsCommand
  .command("delete <name>")
  .description("Delete a skill")
  .option("--global", "Delete from global skills directory")
  .action((name: string, options: { global?: boolean }) => {
    const baseDir = options.global ? globalSkillsDir() : localSkillsDir();
    const skillDir = join(baseDir, name);

    if (!existsSync(skillDir)) {
      console.error(`Skill '${name}' not found at ${baseDir}`);
      process.exit(1);
    }

    rmSync(skillDir, { recursive: true, force: true });
    console.log(`Skill '${name}' deleted.`);
  });

function createRegistry(): SkillRegistry {
  return new SkillRegistry([localSkillsDir(), globalSkillsDir()]);
}

function resolveSkillScope(sourceDir: string): "local" | "global" {
  return sourceDir === localSkillsDir() ? "local" : "global";
}

function buildSkillTemplate(name: string): string {
  return `---\nname: ${name}\ndescription: \n---\n\n# ${name}\n\n(Write your skill content here)\n`;
}

function localSkillsDir(): string {
  return join(process.cwd(), ".circe", "skills");
}

function globalSkillsDir(): string {
  const home = process.env.CIRCE_HOME ?? join(process.env.HOME!, ".circe");
  return join(home, "skills");
}
