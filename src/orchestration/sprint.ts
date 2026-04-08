import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { runWithOptionalRetry, errorMessage } from "../events.js";
import { createMetrics, accumulateMetrics } from "../utils.js";
import type { MetricsAccumulator } from "../utils.js";

export interface SprintOptions {
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Sprint<TIn = unknown, TOut = unknown> implements Runnable<TIn, { sprintResults: TOut[] }> {
  name?: string;
  private runner: Runnable<any, TOut>;
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;
  private _lastMetrics: MetricsAccumulator | null = null;

  constructor(runner: Runnable<any, TOut>, options?: SprintOptions) {
    this.runner = runner;
    this.retryPolicy = options?.retryPolicy ?? null;
    this.eventBus = options?.eventBus ?? null;
  }

  get lastMetrics() { return this._lastMetrics; }

  async run(input: TIn): Promise<{ sprintResults: TOut[] }> {
    this._lastMetrics = null;

    const accumulated = createMetrics();
    const definitions = this.extractSprintDefinitions(input);
    const sprintResults: TOut[] = [];

    try {
      for (let index = 0; index < definitions.length; index++) {
        const result = await this.runSprintItem(index, definitions[index], accumulated);
        sprintResults.push(result);
      }

      this._lastMetrics = { ...accumulated };
      return { sprintResults };
    } finally {
      if (!this._lastMetrics) {
        this._lastMetrics = { ...accumulated };
      }
    }
  }

  private async runSprintItem(
    index: number,
    definition: unknown,
    accumulated: MetricsAccumulator,
  ): Promise<TOut> {
    this.eventBus?.emit({ type: "sprint:start", index, definition, timestamp: Date.now() });

    try {
      const result = await runWithOptionalRetry(this.runner, definition, this.retryPolicy, this.eventBus);

      const metrics = this.runner.lastMetrics;
      accumulateMetrics(accumulated, metrics);

      this.eventBus?.emit({ type: "sprint:done", index, result, cost: metrics?.cost, timestamp: Date.now() });
      return result;
    } catch (error) {
      this.eventBus?.emit({ type: "sprint:error", index, error: errorMessage(error), timestamp: Date.now() });
      throw new Error(`[Sprint:item-${index}] ${errorMessage(error)}`);
    }
  }

  private extractSprintDefinitions(input: unknown): unknown[] {
    if (input == null || typeof input !== "object") return [];
    return (input as Record<string, unknown>).sprints as unknown[] ?? [];
  }
}
