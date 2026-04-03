import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { executeWithRetry } from "../events.js";

export interface SprintOptions {
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Sprint implements Runnable {
  private runner: Runnable;
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;

  constructor(runner: Runnable, options?: SprintOptions) {
    this.runner = runner;
    this.retryPolicy = options?.retryPolicy ?? null;
    this.eventBus = options?.eventBus ?? null;
  }

  async run(spec: unknown): Promise<{ sprintResults: unknown[] }> {
    const definitions = this.extractSprintDefinitions(spec);
    const sprintResults: unknown[] = [];

    for (let index = 0; index < definitions.length; index++) {
      const sprintDef = definitions[index];
      this.eventBus?.emit({ type: "sprint:start", index, definition: sprintDef, timestamp: Date.now() });

      try {
        const result = await this.runWithOptionalRetry(sprintDef);
        sprintResults.push(result);
        this.eventBus?.emit({ type: "sprint:done", index, result, timestamp: Date.now() });
      } catch (error: any) {
        this.eventBus?.emit({
          type: "sprint:error",
          index,
          error: error.message ?? String(error),
          timestamp: Date.now(),
        });
        throw error;
      }
    }

    return { sprintResults };
  }

  private async runWithOptionalRetry(sprintDef: unknown): Promise<unknown> {
    if (!this.retryPolicy) {
      return this.runner.run(sprintDef);
    }

    const retryPolicy = this.retryPolicy;
    return executeWithRetry(
      () => this.runner.run(sprintDef),
      retryPolicy,
      (attempt) => {
        const agentName = (this.runner as any).name ?? "inner";
        this.eventBus?.emit({
          type: "retry",
          agent: agentName,
          attempt,
          maxAttempts: retryPolicy.maxRetries,
          timestamp: Date.now(),
        });
      },
    );
  }

  private extractSprintDefinitions(spec: unknown): unknown[] {
    if (spec == null || typeof spec !== "object") return [];
    return (spec as any).sprints ?? [];
  }
}
