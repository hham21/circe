import type { OutputFormatter } from "./cli/output.js";
import type { SkillRegistry } from "./tools/skills.js";

// Module-level singletons shared across the agent session
let activeFormatter: OutputFormatter | null = null;
let activeWorkDir: string | null = null;
let activeSkillRegistry: SkillRegistry | null = null;

export function setFormatter(formatter: OutputFormatter | null): void {
  activeFormatter = formatter;
}

export function getFormatter(): OutputFormatter | null {
  return activeFormatter;
}

export function setWorkDir(path: string | null): void {
  activeWorkDir = path;
}

export function getWorkDir(): string | null {
  return activeWorkDir;
}

export function setSkillRegistry(registry: SkillRegistry | null): void {
  activeSkillRegistry = registry;
}

export function getSkillRegistry(): SkillRegistry | null {
  return activeSkillRegistry;
}
