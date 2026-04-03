import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { executeWithRetry } from "../events.js";
import { parseTrailingOptions } from "../utils.js";

export interface ParallelOptions {
  throwOnError?: boolean;
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export type ParallelResult = Record<
  string,
  | { status: "fulfilled"; value: unknown }
  | { status: "rejected"; error: string }
>;

function agentName(agent: Runnable): string {
  return (agent as any).name ?? String(agent);
}

export class Parallel implements Runnable {
  private agents: Runnable[];
  private throwOnError: boolean;
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;

  constructor(...args: [...Runnable[], ParallelOptions] | Runnable[]) {
    const { agents, options } = parseTrailingOptions<ParallelOptions>(args);

    if (agents.length === 0) {
      throw new Error("Parallel requires at least one agent");
    }

    this.agents = agents;
    this.throwOnError = options.throwOnError ?? true;
    this.retryPolicy = options.retryPolicy ?? null;
    this.eventBus = options.eventBus ?? null;
  }

  async run(input: unknown): Promise<ParallelResult> {
    const settledOutcomes = await Promise.allSettled(
      this.agents.map((agent) => this.runAgent(agent, input)),
    );

    return this.collectResults(settledOutcomes);
  }

  private async runAgent(agent: Runnable, input: unknown): Promise<{ name: string; result: unknown }> {
    const name = agentName(agent);
    this.eventBus?.emit({ type: "branch:start", branch: name, timestamp: Date.now() });

    try {
      const result = await this.runWithOptionalRetry(agent, name, input);

      const metrics = (agent as any).lastMetrics;
      this.eventBus?.emit({
        type: "branch:done",
        branch: name,
        result,
        cost: metrics?.cost,
        timestamp: Date.now(),
      });

      return { name, result };
    } catch (err: any) {
      this.eventBus?.emit({
        type: "branch:error",
        branch: name,
        error: err.message ?? String(err),
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  private async runWithOptionalRetry(agent: Runnable, name: string, input: unknown): Promise<unknown> {
    if (!this.retryPolicy) {
      return agent.run(input);
    }

    return executeWithRetry(
      () => agent.run(input),
      this.retryPolicy,
      (attempt) => {
        this.eventBus?.emit({
          type: "retry",
          agent: name,
          attempt,
          maxAttempts: this.retryPolicy!.maxRetries,
          timestamp: Date.now(),
        });
      },
    );
  }

  private collectResults(
    settledOutcomes: PromiseSettledResult<{ name: string; result: unknown }>[],
  ): ParallelResult {
    const results: ParallelResult = {};
    let firstError: Error | null = null;

    for (const [i, outcome] of settledOutcomes.entries()) {
      if (outcome.status === "fulfilled") {
        const { name, result } = outcome.value;
        results[name] = { status: "fulfilled", value: result };
      } else {
        // When an agent throws, its name must be resolved from the original agent list
        const name = agentName(this.agents[i]);
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
