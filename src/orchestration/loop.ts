import type { Runnable } from "../types.js";
import { getFormatter } from "../context.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { executeWithRetry } from "../events.js";
import { parseTrailingOptions } from "../utils.js";

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
    this.maxRounds = options.maxRounds ?? 3;
    this.stopWhen = options.stopWhen ?? null;
    this.retryPolicy = options.retryPolicy ?? null;
    this.eventBus = options.eventBus ?? null;
  }

  async run(input: unknown): Promise<unknown> {
    const formatter = getFormatter() as any;
    let currentInput = input;
    let roundResult: unknown = input;

    for (let round = 0; round < this.maxRounds; round++) {
      if (formatter?.logInfo) {
        formatter.logInfo(`Loop round ${round + 1}/${this.maxRounds}`);
      }

      this.eventBus?.emit({ type: "round:start", round, timestamp: Date.now() });

      try {
        roundResult = currentInput;
        for (const agent of this.agents) {
          if (this.retryPolicy) {
            const capturedInput = roundResult;
            roundResult = await executeWithRetry(
              () => agent.run(capturedInput),
              this.retryPolicy,
              (attempt) => {
                const agentName = (agent as any).name ?? "unknown";
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
            roundResult = await agent.run(roundResult);
          }
        }

        this.eventBus?.emit({
          type: "round:done",
          round,
          result: roundResult,
          cost: this.eventBus?.getCostSummary().total,
          timestamp: Date.now(),
        });
      } catch (err: any) {
        this.eventBus?.emit({
          type: "round:error",
          round,
          error: err.message ?? String(err),
          timestamp: Date.now(),
        });
        throw err;
      }

      if (formatter?.logRoundResult) {
        formatter.logRoundResult(roundResult);
      }

      if (this.stopWhen?.(roundResult)) {
        if (formatter?.logInfo) {
          formatter.logInfo("Loop stopped: condition met");
        }
        break;
      }

      currentInput = roundResult;
    }

    return roundResult;
  }
}
