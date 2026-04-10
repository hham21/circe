import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { runWithOptionalRetry, errorMessage } from "../events.js";
import { parseTrailingOptions, createMetrics, accumulateMetrics } from "../utils.js";
import type { MetricsAccumulator } from "../utils.js";
import { isStopped } from "../store.js";

function resolveAgentName(agent: Runnable, index: number): string {
  return agent.name ?? `agent-${index}`;
}

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

    if (isStopped()) {
      this._lastMetrics = createMetrics();
      return {} as ParallelResult<TOut>;
    }

    const settledResults = await Promise.allSettled(
      this.agents.map((agent, index) => this.runAgent(agent, input, index)),
    );

    this._lastMetrics = this.accumulateAgentMetrics();

    return this.collectResults(settledResults);
  }

  private accumulateAgentMetrics(): MetricsAccumulator {
    const metrics = createMetrics();
    for (const agent of this.agents) accumulateMetrics(metrics, agent.lastMetrics);
    return metrics;
  }

  private async runAgent(
    agent: Runnable<TIn, TOut>,
    input: TIn,
    index: number,
  ): Promise<{ name: string; result: TOut }> {
    const agentName = resolveAgentName(agent, index);
    this.eventBus?.emit({ type: "branch:start", branch: agentName, timestamp: Date.now() });

    try {
      const result = await runWithOptionalRetry(agent, input, this.retryPolicy, this.eventBus);

      this.eventBus?.emit({
        type: "branch:done",
        branch: agentName,
        result,
        cost: agent.lastMetrics?.cost,
        timestamp: Date.now(),
      });

      return { name: agentName, result };
    } catch (err) {
      this.eventBus?.emit({
        type: "branch:error",
        branch: agentName,
        error: errorMessage(err),
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  private collectResults(
    settledResults: PromiseSettledResult<{ name: string; result: TOut }>[],
  ): ParallelResult<TOut> {
    const results: ParallelResult<TOut> = {};
    let firstRejection: Error | null = null;

    for (const [i, outcome] of settledResults.entries()) {
      if (outcome.status === "fulfilled") {
        const { name, result } = outcome.value;
        results[name] = { status: "fulfilled", value: result };
      } else {
        const agentName = resolveAgentName(this.agents[i], i);
        const errorMsg = outcome.reason?.message ?? String(outcome.reason);
        results[agentName] = { status: "rejected", error: errorMsg };
        firstRejection ??= outcome.reason instanceof Error ? outcome.reason : new Error(errorMsg);
      }
    }

    if (this.throwOnError && firstRejection) {
      throw firstRejection;
    }

    return results;
  }
}
