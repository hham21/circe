import type { Runnable } from "../types.js";
import { getFormatter } from "../context.js";
import { findJsonString } from "../utils.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { executeWithRetry } from "../events.js";

const DEFAULT_MAX_ROUNDS = 3;

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
    this.maxRounds = options?.maxRounds ?? DEFAULT_MAX_ROUNDS;
    this.retryPolicy = options?.retryPolicy ?? null;
    this.eventBus = options?.eventBus ?? null;
  }

  async run(input: unknown): Promise<unknown> {
    const formatter = getFormatter() as any;
    let proposalInput = input;
    let review: unknown;

    for (let round = 0; round < this.maxRounds; round++) {
      formatter?.logInfo?.(`Contract round ${round + 1}/${this.maxRounds}`);

      this.eventBus?.emit({ type: "round:start", round, timestamp: Date.now() });

      try {
        review = await this.executeRound(round, proposalInput);
      } catch (err: any) {
        this.eventBus?.emit({
          type: "round:error",
          round,
          error: err.message ?? String(err),
          timestamp: Date.now(),
        });
        throw err;
      }

      formatter?.logRoundResult?.(review);

      if (this.isAccepted(review)) {
        return review;
      }

      proposalInput = review;
    }

    return review;
  }

  private async executeRound(round: number, proposalInput: unknown): Promise<unknown> {
    const proposal = await this.runAgentWithRetry(this.proposer, proposalInput);
    const proposerCost = extractAgentCost(this.proposer);

    const review = this.parseReview(await this.runAgentWithRetry(this.reviewer, proposal));
    const reviewerCost = extractAgentCost(this.reviewer);

    const roundCost = proposerCost + reviewerCost;
    this.eventBus?.emit({
      type: "round:done",
      round,
      result: review,
      cost: roundCost || undefined,
      timestamp: Date.now(),
    });

    return review;
  }

  private async runAgentWithRetry(agent: Runnable, agentInput: unknown): Promise<unknown> {
    if (!this.retryPolicy) {
      return agent.run(agentInput);
    }

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
    if (review == null || typeof review !== "object") return false;
    const accepted = (review as any).accepted;
    return typeof accepted === "boolean" && accepted;
  }
}

function extractAgentCost(agent: Runnable): number {
  return (agent as any).lastMetrics?.cost ?? 0;
}
