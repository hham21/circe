import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { executeWithRetry } from "../events.js";

export interface SprintOptions {
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Sprint implements Runnable {
  private inner: Runnable;
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;

  constructor(inner: Runnable, options?: SprintOptions) {
    this.inner = inner;
    this.retryPolicy = options?.retryPolicy ?? null;
    this.eventBus = options?.eventBus ?? null;
  }

  async run(spec: unknown): Promise<{ sprintResults: unknown[] }> {
    const definitions = this.extractSprintDefinitions(spec);
    const sprintResults: unknown[] = [];

    for (let i = 0; i < definitions.length; i++) {
      const def = definitions[i];
      this.eventBus?.emit({ type: "sprint:start", index: i, definition: def, timestamp: Date.now() });

      try {
        let result: unknown;
        if (this.retryPolicy) {
          result = await executeWithRetry(
            () => this.inner.run(def),
            this.retryPolicy,
            (attempt) => {
              const agentName = (this.inner as any).name ?? "inner";
              this.eventBus?.emit({
                type: "retry",
                agent: agentName,
                attempt,
                maxAttempts: this.retryPolicy!.maxRetries,
                timestamp: Date.now(),
              });
            },
          );
        } else {
          result = await this.inner.run(def);
        }

        sprintResults.push(result);
        this.eventBus?.emit({ type: "sprint:done", index: i, result, timestamp: Date.now() });
      } catch (err: any) {
        this.eventBus?.emit({
          type: "sprint:error",
          index: i,
          error: err.message ?? String(err),
          timestamp: Date.now(),
        });
        throw err;
      }
    }

    return { sprintResults };
  }

  private extractSprintDefinitions(spec: unknown): unknown[] {
    if (spec == null || typeof spec !== "object") return [];
    return (spec as any).sprints ?? [];
  }
}
