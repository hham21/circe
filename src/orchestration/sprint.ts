import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { runWithOptionalRetry, errorMessage } from "../events.js";
import { createMetrics, accumulateMetrics } from "../utils.js";

export interface SprintOptions {
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Sprint<TIn = unknown, TOut = unknown> implements Runnable<TIn, { sprintResults: TOut[] }> {
  name?: string;
  private runner: Runnable<any, TOut>;
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;
  private _lastMetrics: { cost: number; inputTokens: number; outputTokens: number } | null = null;

  constructor(runner: Runnable<any, TOut>, options?: SprintOptions) {
    this.runner = runner;
    this.retryPolicy = options?.retryPolicy ?? null;
    this.eventBus = options?.eventBus ?? null;
  }

  get lastMetrics() { return this._lastMetrics; }

  async run(spec: TIn): Promise<{ sprintResults: TOut[] }> {
    this._lastMetrics = null;

    const accumulated = createMetrics();
    const definitions = this.extractSprintDefinitions(spec);
    const sprintResults: TOut[] = [];

    try {
      for (let index = 0; index < definitions.length; index++) {
        const sprintDef = definitions[index];
        this.eventBus?.emit({ type: "sprint:start", index, definition: sprintDef, timestamp: Date.now() });

        try {
          const result = await runWithOptionalRetry(this.runner, sprintDef, this.retryPolicy, this.eventBus);
          sprintResults.push(result);

          const m = this.runner.lastMetrics;
          accumulateMetrics(accumulated, m);

          this.eventBus?.emit({ type: "sprint:done", index, result, cost: m?.cost, timestamp: Date.now() });
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

      this._lastMetrics = { ...accumulated };
      return { sprintResults };
    } finally {
      if (!this._lastMetrics) {
        this._lastMetrics = { ...accumulated };
      }
    }
  }

  private extractSprintDefinitions(spec: unknown): unknown[] {
    if (spec == null || typeof spec !== "object") return [];
    return (spec as Record<string, unknown>).sprints as unknown[] ?? [];
  }
}
