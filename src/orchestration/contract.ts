import type { Runnable } from "../types.js";
import { getFormatter } from "../context.js";
import { findJsonString } from "../utils.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { executeWithRetry } from "../events.js";

export interface ContractOptions {
  maxRounds?: number;
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Contract implements Runnable {
  private proposer: Runnable;
  private reviewer: Runnable;
  private maxRounds: number;
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;

  constructor(proposer: Runnable, reviewer: Runnable, options?: ContractOptions) {
    this.proposer = proposer;
    this.reviewer = reviewer;
    this.maxRounds = options?.maxRounds ?? 3;
    this.retryPolicy = options?.retryPolicy ?? null;
    this.eventBus = options?.eventBus ?? null;
  }

  async run(input: unknown): Promise<unknown> {
    const formatter = getFormatter() as any;
    let currentInput = input;
    let review: unknown = null;

    for (let i = 0; i < this.maxRounds; i++) {
      if (formatter?.logInfo) {
        formatter.logInfo(`Contract round ${i + 1}/${this.maxRounds}`);
      }

      this.eventBus?.emit({ type: "round:start", round: i, timestamp: Date.now() });

      try {
        const runAgent = async (agent: Runnable, agentInput: unknown) => {
          if (this.retryPolicy) {
            return executeWithRetry(
              () => agent.run(agentInput),
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
          }
          return agent.run(agentInput);
        };

        const proposal = await runAgent(this.proposer, currentInput);
        review = this.parseReview(await runAgent(this.reviewer, proposal));

        this.eventBus?.emit({
          type: "round:done",
          round: i,
          result: review,
          timestamp: Date.now(),
        });
      } catch (err: any) {
        this.eventBus?.emit({
          type: "round:error",
          round: i,
          error: err.message ?? String(err),
          timestamp: Date.now(),
        });
        throw err;
      }

      if (formatter?.logRoundResult) {
        formatter.logRoundResult(review);
      }

      if (this.isAccepted(review)) {
        return review;
      }

      currentInput = review;
    }

    return review;
  }

  private parseReview(review: unknown): unknown {
    if (typeof review !== "string") return review;
    const jsonStr = findJsonString(review);
    if (!jsonStr) return review;
    try {
      return JSON.parse(jsonStr);
    } catch {
      return review;
    }
  }

  private isAccepted(review: unknown): boolean {
    if (review != null && typeof review === "object") {
      const accepted = (review as any).accepted;
      if (typeof accepted === "boolean") return accepted;
    }

    return false;
  }
}
