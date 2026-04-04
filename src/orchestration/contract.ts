import type { Runnable } from "../types.js";
import { findJsonString } from "../utils.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { runWithOptionalRetry, errorMessage } from "../events.js";
import { createMetrics, accumulateMetrics } from "../utils.js";
import type { MetricsAccumulator } from "../utils.js";

const DEFAULT_MAX_ROUNDS = 3;

export interface ContractOptions<TReview = unknown> {
  maxRounds?: number;
  isAccepted?: (review: TReview) => boolean;
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Contract<TIn = unknown, TProposal = unknown, TReview = unknown> implements Runnable<TIn, TProposal> {
  name?: string;
  private proposer: Runnable<TIn | TReview, TProposal>;
  private reviewer: Runnable<TProposal, TReview>;
  private maxRounds: number;
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;
  private customIsAccepted: ((review: TReview) => boolean) | null = null;
  private _lastMetrics: MetricsAccumulator | null = null;
  private _lastProposal: TProposal | null = null;
  private _lastEvaluatorResult: TReview | null = null;

  constructor(proposer: Runnable<TIn | TReview, TProposal>, reviewer: Runnable<TProposal, TReview>, options?: ContractOptions<TReview>) {
    this.proposer = proposer;
    this.reviewer = reviewer;
    this.maxRounds = options?.maxRounds ?? DEFAULT_MAX_ROUNDS;
    this.customIsAccepted = options?.isAccepted ?? null;
    this.retryPolicy = options?.retryPolicy ?? null;
    this.eventBus = options?.eventBus ?? null;
  }

  get lastMetrics() { return this._lastMetrics; }
  get lastEvaluatorResult(): TReview | null { return this._lastEvaluatorResult; }

  async run(input: TIn): Promise<TProposal> {
    this._lastMetrics = null;
    this._lastProposal = null;
    this._lastEvaluatorResult = null;

    const accumulated = createMetrics();
    let proposalInput: TIn | TReview = input;
    let review: TReview | undefined;

    try {
      for (let round = 0; round < this.maxRounds; round++) {
        this.eventBus?.emit({ type: "round:start", round, timestamp: Date.now() });

        try {
          review = await this.executeRound(round, proposalInput, accumulated);
        } catch (err: any) {
          this.eventBus?.emit({
            type: "round:error",
            round,
            error: errorMessage(err),
            timestamp: Date.now(),
          });
          throw new Error(`[Contract:round-${round + 1}] ${errorMessage(err)}`);
        }

        if (this.isAccepted(review!)) {
          this._lastMetrics = { ...accumulated };
          return this._lastProposal as TProposal;
        }

        proposalInput = review;
      }

      this._lastMetrics = { ...accumulated };
      return review as TProposal;
    } finally {
      if (!this._lastMetrics) {
        this._lastMetrics = { ...accumulated };
      }
    }
  }

  private async executeRound(
    round: number,
    proposalInput: TIn | TReview,
    accumulated: MetricsAccumulator,
  ): Promise<TReview> {
    const proposal = await runWithOptionalRetry(this.proposer, proposalInput, this.retryPolicy, this.eventBus);
    this._lastProposal = proposal;

    const pm = this.proposer.lastMetrics;
    accumulateMetrics(accumulated, pm);

    const review = this.parseReview(await runWithOptionalRetry(this.reviewer, proposal, this.retryPolicy, this.eventBus));
    this._lastEvaluatorResult = review;

    const rm = this.reviewer.lastMetrics;
    accumulateMetrics(accumulated, rm);

    const roundCost = (pm?.cost ?? 0) + (rm?.cost ?? 0);
    this.eventBus?.emit({
      type: "round:done",
      round,
      result: review,
      cost: roundCost || undefined,
      timestamp: Date.now(),
    });

    return review;
  }

  private parseReview(review: unknown): TReview {
    if (typeof review !== "string") return review as TReview;
    const jsonStr = findJsonString(review);
    if (!jsonStr) return review as TReview;
    try {
      return JSON.parse(jsonStr) as TReview;
    } catch {
      return review as TReview;
    }
  }

  private isAccepted(review: TReview): boolean {
    if (this.customIsAccepted) return this.customIsAccepted(review);
    if (review == null || typeof review !== "object") return false;
    const accepted = (review as Record<string, unknown>).accepted;
    return typeof accepted === "boolean" && accepted;
  }
}
