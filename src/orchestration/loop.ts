import type { Runnable } from "../types.js";
import { getFormatter } from "../context.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { executeWithRetry } from "../events.js";
import { parseTrailingOptions } from "../utils.js";

const DEFAULT_MAX_ROUNDS = 3;

export interface LoopOptions {
  maxRounds?: number;
  stopWhen?: (result: unknown) => boolean;
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Loop implements Runnable {
  private agents: Runnable[];
  private maxRounds: number;
  private stopWhen: ((result: unknown) => boolean) | null;
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;

  constructor(...args: [...Runnable[], LoopOptions] | Runnable[]) {
    const { agents, options } = parseTrailingOptions<LoopOptions>(args);

    if (agents.length < 2) {
      throw new Error("Loop requires at least two agents");
    }

    this.agents = agents;
    this.maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
    this.stopWhen = options.stopWhen ?? null;
    this.retryPolicy = options.retryPolicy ?? null;
    this.eventBus = options.eventBus ?? null;
  }

  async run(input: unknown): Promise<unknown> {
    const formatter = getFormatter() as any;
    let result: unknown = input;

    for (let round = 0; round < this.maxRounds; round++) {
      formatter?.logInfo?.(`Loop round ${round + 1}/${this.maxRounds}`);
      this.emitEvent({ type: "round:start", round });

      result = await this.executeRound(round, result);

      formatter?.logRoundResult?.(result);

      if (this.stopWhen?.(result)) {
        formatter?.logInfo?.("Loop stopped: condition met");
        break;
      }
    }

    return result;
  }

  private async executeRound(round: number, input: unknown): Promise<unknown> {
    try {
      let result = input;
      let roundCost = 0;

      for (const agent of this.agents) {
        result = await this.runAgent(agent, result);
        const agentCost = (agent as any).lastMetrics?.cost;
        if (agentCost) roundCost += agentCost;
      }

      this.emitEvent({ type: "round:done", round, result, cost: roundCost || undefined });
      return result;
    } catch (err: any) {
      this.emitEvent({ type: "round:error", round, error: err.message ?? String(err) });
      throw err;
    }
  }

  private async runAgent(agent: Runnable, input: unknown): Promise<unknown> {
    if (!this.retryPolicy) {
      return agent.run(input);
    }

    return executeWithRetry(
      () => agent.run(input),
      this.retryPolicy,
      (attempt) => {
        const agentName = (agent as any).name ?? "unknown";
        this.emitEvent({
          type: "retry",
          agent: agentName,
          attempt,
          maxAttempts: this.retryPolicy!.maxRetries,
        });
      },
    );
  }

  private emitEvent(payload: Record<string, unknown>): void {
    this.eventBus?.emit({ ...payload, timestamp: Date.now() } as any);
  }
}
