import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy } from "../events.js";
import { runWithOptionalRetry, errorMessage } from "../events.js";
import { parseTrailingOptions, createMetrics, accumulateMetrics } from "../utils.js";
import type { MetricsAccumulator } from "../utils.js";
import { isStopped } from "../store.js";

const DEFAULT_MAX_ROUNDS = 3;

export interface LoopOptions<TEval = unknown> {
  maxRounds?: number;
  stopWhen?: (result: TEval) => boolean;
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Loop<TIn = unknown, TProducer = unknown, TEval = unknown> implements Runnable<TIn, TProducer> {
  name?: string;
  private agents: Runnable<any, any>[];
  private maxRounds: number;
  private stopWhen: ((result: TEval) => boolean) | null;
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;
  private _lastMetrics: MetricsAccumulator | null = null;
  private _lastProducerResult: TProducer | null = null;
  private _lastEvaluatorResult: TEval | null = null;

  constructor(...args: [...Runnable<any, any>[], LoopOptions<TEval>] | Runnable<any, any>[]) {
    const { agents, options } = parseTrailingOptions<LoopOptions<TEval>>(args);

    if (agents.length < 2) {
      throw new Error("Loop requires at least two agents");
    }

    this.agents = agents;
    this.maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
    this.stopWhen = options.stopWhen ?? null;
    this.retryPolicy = options.retryPolicy ?? null;
    this.eventBus = options.eventBus ?? null;
  }

  get lastMetrics(): MetricsAccumulator | null { return this._lastMetrics; }
  get lastEvaluatorResult(): TEval | null { return this._lastEvaluatorResult; }

  async run(input: TIn): Promise<TProducer> {
    this._lastMetrics = null;
    this._lastProducerResult = null;
    this._lastEvaluatorResult = null;

    const accumulated = createMetrics();
    let result: unknown = input;

    try {
      for (let round = 0; round < this.maxRounds; round++) {
        if (isStopped()) break;
        this.eventBus?.emit({ type: "round:start", round, timestamp: Date.now() });

        result = await this.executeRound(round, result, accumulated);

        if (this.stopWhen?.(result as TEval)) {
          this._lastMetrics = { ...accumulated };
          return this._lastProducerResult as TProducer;
        }
      }

      this._lastMetrics = { ...accumulated };
      return this._lastProducerResult as TProducer;
    } finally {
      if (!this._lastMetrics) {
        this._lastMetrics = { ...accumulated };
      }
    }
  }

  private async executeRound(
    round: number,
    input: unknown,
    accumulated: MetricsAccumulator,
  ): Promise<unknown> {
    try {
      let result = input;
      let roundCost = 0;

      for (let agentIndex = 0; agentIndex < this.agents.length; agentIndex++) {
        const agent = this.agents[agentIndex];
        result = await this.runAgent(agent, result);

        const agentMetrics = agent.lastMetrics;
        accumulateMetrics(accumulated, agentMetrics);
        if (agentMetrics) roundCost += agentMetrics.cost;

        this.captureRoundOutputs(agentIndex, result);
      }

      this.eventBus?.emit({
        type: "round:done",
        round,
        result,
        cost: roundCost || undefined,
        costByAgent: this.eventBus ? { ...this.eventBus.getCostSummary().perAgent } : undefined,
        timestamp: Date.now(),
      });
      return result;
    } catch (err) {
      this.eventBus?.emit({ type: "round:error", round, error: errorMessage(err), timestamp: Date.now() });
      throw new Error(`[Loop:round-${round + 1}] ${errorMessage(err)}`);
    }
  }

  private captureRoundOutputs(agentIndex: number, result: unknown): void {
    const isProducer = agentIndex === 0;
    const isEvaluator = agentIndex === this.agents.length - 1;

    if (isProducer) {
      this._lastProducerResult = result as TProducer;
    }
    if (isEvaluator) {
      this._lastEvaluatorResult = result as TEval;
    }
  }

  private async runAgent(agent: Runnable<any, any>, input: unknown): Promise<unknown> {
    return runWithOptionalRetry(agent, input, this.retryPolicy, this.eventBus);
  }
}
