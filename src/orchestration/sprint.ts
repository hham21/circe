import type { Runnable } from "../types.js";

export class Sprint implements Runnable {
  private inner: Runnable;

  constructor(inner: Runnable) {
    this.inner = inner;
  }

  async run(spec: unknown): Promise<{ sprintResults: unknown[] }> {
    const definitions = this.extractSprintDefinitions(spec);
    const sprintResults: unknown[] = [];

    for (const def of definitions) {
      const result = await this.inner.run(def);
      sprintResults.push(result);
    }

    return { sprintResults };
  }

  private extractSprintDefinitions(spec: unknown): unknown[] {
    if (spec == null || typeof spec !== "object") return [];
    return (spec as any).sprints ?? [];
  }
}
