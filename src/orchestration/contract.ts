import type { Runnable } from "../types.js";
import { findJsonString } from "../utils.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { runWithOptionalRetry, errorMessage } from "../events.js";

const DEFAULT_MAX_ROUNDS = 3;

export interface ContractOptions {
  maxRounds?: number;
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Contract implements Runnable {
  name?: string;
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
    let proposalInput = input;
    let review: unknown;

    for (let round = 0; round < this.maxRounds; round++) {
      this.eventBus?.emit({ type: "round:start", round, timestamp: Date.now() });

      try {
        review = await this.executeRound(round, proposalInput);
      } catch (err: any) {
        this.eventBus?.emit({
          type: "round:error",
          round,
          error: errorMessage(err),
          timestamp: Date.now(),
        });
        throw new Error(`[Contract:round-${round + 1}] ${errorMessage(err)}`);
      }

      if (this.isAccepted(review)) {
        return review;
      }

      proposalInput = review;
    }

    return review;
  }

  private async executeRound(round: number, proposalInput: unknown): Promise<unknown> {
    const proposal = await this.runAgentWithRetry(this.proposer, proposalInput);
    const proposerCost = this.proposer.lastMetrics?.cost ?? 0;

    const review = this.parseReview(await this.runAgentWithRetry(this.reviewer, proposal));
    const reviewerCost = this.reviewer.lastMetrics?.cost ?? 0;

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
    return runWithOptionalRetry(agent, agentInput, this.retryPolicy, this.eventBus);
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
    const accepted = (review as Record<string, unknown>).accepted;
    return typeof accepted === "boolean" && accepted;
  }
}
