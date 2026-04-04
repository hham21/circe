import type { OutputFormatter } from "./cli/output.js";
import type { SkillRegistry } from "./tools/skills.js";
import { sessionStore } from "./session.js";

// Module-level singletons shared across the agent session (legacy fallback)
let formatter: OutputFormatter | null = null;
let workDir: string | null = null;
let skillRegistry: SkillRegistry | null = null;

export function setFormatter(value: OutputFormatter | null): void {
  formatter = value;
}

export function getFormatter(): OutputFormatter | null {
  return sessionStore.getStore()?.formatter ?? formatter;
}

export function setWorkDir(value: string | null): void {
  workDir = value;
}

export function getWorkDir(): string | null {
  return sessionStore.getStore()?.workDir ?? workDir;
}

export function setSkillRegistry(value: SkillRegistry | null): void {
  skillRegistry = value;
}

export function getSkillRegistry(): SkillRegistry | null {
  return sessionStore.getStore()?.skillRegistry ?? skillRegistry;
}
