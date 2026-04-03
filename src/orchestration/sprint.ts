import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { runWithOptionalRetry, errorMessage } from "../events.js";

export interface SprintOptions {
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Sprint implements Runnable {
  name?: string;
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
        const result = await runWithOptionalRetry(this.runner, sprintDef, this.retryPolicy, this.eventBus);
        sprintResults.push(result);
        this.eventBus?.emit({ type: "sprint:done", index, result, timestamp: Date.now() });
      } catch (error) {
        this.eventBus?.emit({
          type: "sprint:error",
          index,
          error: errorMessage(error),
          timestamp: Date.now(),
        });
        throw new Error(`[Sprint:item-${index}] ${errorMessage(error)}`);
      }
    }

    return { sprintResults };
  }

  private extractSprintDefinitions(spec: unknown): unknown[] {
    if (spec == null || typeof spec !== "object") return [];
    return (spec as Record<string, unknown>).sprints as unknown[] ?? [];
  }
}
