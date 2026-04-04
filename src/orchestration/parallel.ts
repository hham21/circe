import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { runWithOptionalRetry, errorMessage } from "../events.js";
import { parseTrailingOptions, createMetrics, accumulateMetrics } from "../utils.js";
import type { MetricsAccumulator } from "../utils.js";

export interface ParallelOptions {
  throwOnError?: boolean;
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export type ParallelResult<T = unknown> = Record<
  string,
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; error: string }
>;

export class Parallel<TIn = unknown, TOut = unknown> implements Runnable<TIn, ParallelResult<TOut>> {
  name?: string;
  private agents: Runnable<TIn, TOut>[];
  private throwOnError: boolean;
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;
  private _lastMetrics: MetricsAccumulator | null = null;

  constructor(...args: [...Runnable<TIn, TOut>[], ParallelOptions] | Runnable<TIn, TOut>[]) {
    const { agents, options } = parseTrailingOptions<ParallelOptions>(args);

    if (agents.length === 0) {
      throw new Error("Parallel requires at least one agent");
    }

    this.agents = agents as Runnable<TIn, TOut>[];
    this.throwOnError = options.throwOnError ?? true;
    this.retryPolicy = options.retryPolicy ?? null;
    this.eventBus = options.eventBus ?? null;
  }

  get lastMetrics() { return this._lastMetrics; }

  async run(input: TIn): Promise<ParallelResult<TOut>> {
    this._lastMetrics = null;

    const settledOutcomes = await Promise.allSettled(
      this.agents.map((agent, index) => this.runAgent(agent, input, index)),
    );

    const accumulated = createMetrics();
    for (const a of this.agents) accumulateMetrics(accumulated, a.lastMetrics);
    this._lastMetrics = accumulated;

    return this.collectResults(settledOutcomes);
  }

  private async runAgent(agent: Runnable<TIn, TOut>, input: TIn, index: number): Promise<{ name: string; result: TOut }> {
    const name = agent.name ?? `agent-${index}`;
    this.eventBus?.emit({ type: "branch:start", branch: name, timestamp: Date.now() });

    try {
      const result = await runWithOptionalRetry(agent, input, this.retryPolicy, this.eventBus);

      const metrics = agent.lastMetrics;
      this.eventBus?.emit({
        type: "branch:done",
        branch: name,
        result,
        cost: metrics?.cost,
        timestamp: Date.now(),
      });

      return { name, result };
    } catch (err) {
      this.eventBus?.emit({
        type: "branch:error",
        branch: name,
        error: errorMessage(err),
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  private collectResults(
    settledOutcomes: PromiseSettledResult<{ name: string; result: TOut }>[],
  ): ParallelResult<TOut> {
    const results: ParallelResult<TOut> = {};
    let firstError: Error | null = null;

    for (const [i, outcome] of settledOutcomes.entries()) {
      if (outcome.status === "fulfilled") {
        const { name, result } = outcome.value;
        results[name] = { status: "fulfilled", value: result };
      } else {
        const name = this.agents[i].name ?? `agent-${i}`;
        const errorMsg = outcome.reason?.message ?? String(outcome.reason);
        results[name] = { status: "rejected", error: errorMsg };
        if (!firstError) {
          firstError = outcome.reason instanceof Error ? outcome.reason : new Error(errorMsg);
        }
      }
    }

    if (this.throwOnError && firstError) {
      throw firstError;
    }

    return results;
  }
}
