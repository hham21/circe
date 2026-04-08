import type { OutputFormatter } from "./cli/output.js";
import type { Session } from "./session.js";
import { sessionStore } from "./session.js";
import type { SkillRegistry } from "./tools/skills.js";

// Global fallbacks used when no AsyncLocalStorage session is active.
let globalFormatter: OutputFormatter | null = null;
let globalWorkDir: string | null = null;
let globalSkillRegistry: SkillRegistry | null = null;

function resolveFromSession<K extends keyof Session>(
  key: K,
  globalFallback: Session[K] | null,
): Session[K] | null {
  return sessionStore.getStore()?.[key] ?? globalFallback;
}

export function setFormatter(value: OutputFormatter | null): void {
  globalFormatter = value;
}

export function getFormatter(): OutputFormatter | null {
  return resolveFromSession("formatter", globalFormatter);
}

export function setWorkDir(value: string | null): void {
  globalWorkDir = value;
}

export function getWorkDir(): string | null {
  return resolveFromSession("workDir", globalWorkDir);
}

export function setSkillRegistry(value: SkillRegistry | null): void {
  globalSkillRegistry = value;
}

export function getSkillRegistry(): SkillRegistry | null {
  return resolveFromSession("skillRegistry", globalSkillRegistry);
}
