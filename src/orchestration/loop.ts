import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { runWithOptionalRetry, errorMessage } from "../events.js";
import { parseTrailingOptions } from "../utils.js";

const DEFAULT_MAX_ROUNDS = 3;

export interface LoopOptions {
  maxRounds?: number;
  stopWhen?: (result: unknown) => boolean;
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Loop implements Runnable {
  name?: string;
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
    let result: unknown = input;

    for (let round = 0; round < this.maxRounds; round++) {
      this.eventBus?.emit({ type: "round:start", round, timestamp: Date.now() });

      result = await this.executeRound(round, result);

      if (this.stopWhen?.(result)) {
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
        const agentCost = agent.lastMetrics?.cost;
        if (agentCost) roundCost += agentCost;
      }

      this.eventBus?.emit({ type: "round:done", round, result, cost: roundCost || undefined, timestamp: Date.now() });
      return result;
    } catch (err) {
      this.eventBus?.emit({ type: "round:error", round, error: errorMessage(err), timestamp: Date.now() });
      throw new Error(`[Loop:round-${round + 1}] ${errorMessage(err)}`);
    }
  }

  private async runAgent(agent: Runnable, input: unknown): Promise<unknown> {
    return runWithOptionalRetry(agent, input, this.retryPolicy, this.eventBus);
  }
}
