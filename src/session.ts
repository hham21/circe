import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { OutputFormatter } from "./cli/output.js";
import { sessionStore } from "./store.js";
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
    this.workDir = this.initWorkDir(options.outputDir);
    this.formatter = this.initFormatter(options.verbose);
    this.skillRegistry = this.initSkillRegistry(options.skills);
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

export { sessionStore } from "./store.js";
