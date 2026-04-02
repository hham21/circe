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
    const settled = await Promise.allSettled(
      this.agents.map(async (agent) => {
        const name = (agent as any).name ?? String(agent);
        this.eventBus?.emit({ type: "branch:start", branch: name, timestamp: Date.now() });

        try {
          let result: unknown;
          if (this.retryPolicy) {
            result = await executeWithRetry(
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
          } else {
            result = await agent.run(input);
          }

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
      }),
    );

    const results: ParallelResult = {};
    let firstError: Error | null = null;

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      const name = (this.agents[i] as any).name ?? String(this.agents[i]);

      if (outcome.status === "fulfilled") {
        results[name] = { status: "fulfilled", value: outcome.value.result };
      } else {
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
