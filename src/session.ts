import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { sessionStore } from "./store.js";
import { OutputFormatter } from "./cli/output.js";
import { SkillRegistry } from "./tools/skills.js";
import { circeHome } from "./utils.js";

export interface CostPolicy {
  /** costPressure threshold for warning log + cost:warning event (default 0.7) */
  warn?: number;
  /** costPressure threshold for setting shouldStop flag (default 0.9) */
  softStop?: number;
  /** costPressure threshold for throwing Error (default 1.0) */
  hardStop?: number;
}

const DEFAULT_COST_POLICY: Required<CostPolicy> = {
  warn: 0.7,
  softStop: 0.9,
  hardStop: 1.0,
};

export interface SessionOptions {
  outputDir?: string;
  verbose?: boolean;
  skills?: string[];
  maxCost?: number;
  costPolicy?: CostPolicy;
  agentCostLimits?: Record<string, number>;
}

export class Session {
  workDir: string;
  formatter: OutputFormatter;
  skillRegistry: SkillRegistry;
  maxCost: number | null;
  costPolicy: Required<CostPolicy>;
  agentCostLimits: Record<string, number>;
  shouldStop = false;
  private startTime: number | null = null;
  private endTime: number | null = null;

  constructor(options: SessionOptions = {}) {
    this.workDir = this.initWorkDir(options.outputDir);
    this.formatter = this.initFormatter(options.verbose);
    this.skillRegistry = this.initSkillRegistry(options.skills);
    this.maxCost = options.maxCost ?? null;
    this.costPolicy = { ...DEFAULT_COST_POLICY, ...options.costPolicy };
    this.agentCostLimits = options.agentCostLimits ?? {};
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.startTime = Date.now();
    this.shouldStop = false; // reset so re-used sessions start clean

    return sessionStore.run(this, async () => {
      try {
        return await fn();
      } finally {
        this.endTime = Date.now();
        this.teardown();
      }
    });
  }

  get duration(): number {
    if (this.startTime === null) return 0;
    const end = this.endTime ?? Date.now();
    return (end - this.startTime) / 1000;
  }

  private initWorkDir(outputDir?: string): string {
    const workDir = resolve(outputDir ?? process.cwd());
    mkdirSync(workDir, { recursive: true });
    return workDir;
  }

  private initFormatter(verbose?: boolean): OutputFormatter {
    const formatter = new OutputFormatter(verbose);
    formatter.setLogFile(join(this.workDir, "circe.log"));
    return formatter;
  }

  private initSkillRegistry(skills?: string[]): SkillRegistry {
    if (skills) return new SkillRegistry(skills);
    return this.createDefaultSkillRegistry();
  }

  private createDefaultSkillRegistry(): SkillRegistry {
    const skillDirectories = [
      join(this.workDir, ".circe", "skills"),
      join(circeHome(), "skills"),
    ];
    return new SkillRegistry(skillDirectories);
  }

  private teardown(): void {
    try {
      this.formatter.close();
    } catch (err) {
      console.error("[session] teardown error:", err);
    }
  }
}

// Re-export for backward compatibility — canonical source is store.ts
export { sessionStore } from "./store.js";
