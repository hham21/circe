import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { OutputFormatter } from "./cli/output.js";
import { SkillRegistry } from "./tools/skills.js";
import { circeHome } from "./utils.js";

export interface SessionOptions {
  outputDir?: string;
  verbose?: boolean;
  skills?: string[];
}

export class Session {
  workDir: string;
  formatter: OutputFormatter;
  skillRegistry: SkillRegistry;
  private startTime: number | null = null;
  private endTime: number | null = null;

  constructor(options: SessionOptions = {}) {
    this.workDir = resolve(options.outputDir ?? process.cwd());
    mkdirSync(this.workDir, { recursive: true });

    this.formatter = new OutputFormatter(options.verbose);
    this.formatter.setLogFile(join(this.workDir, "circe.log"));

    this.skillRegistry = options.skills
      ? new SkillRegistry(options.skills)
      : this.createDefaultSkillRegistry();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.startTime = Date.now();

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
    if (this.startTime == null) return 0;
    const end = this.endTime ?? Date.now();
    return (end - this.startTime) / 1000;
  }

  private createDefaultSkillRegistry(): SkillRegistry {
    const dirs = [
      join(this.workDir, ".circe", "skills"),
      join(circeHome(), "skills"),
    ];
    return new SkillRegistry(dirs);
  }

  private teardown(): void {
    try {
      this.formatter.close();
    } catch (err) {
      console.error("[session] teardown error:", err);
    }
  }
}

export const sessionStore = new AsyncLocalStorage<Session>();
