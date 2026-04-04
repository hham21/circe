import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy, OrchestratorEvent } from "../events.js";
import { runWithOptionalRetry, errorMessage } from "../events.js";
import { parseTrailingOptions, createMetrics, accumulateMetrics } from "../utils.js";
import type { MetricsAccumulator } from "../utils.js";

export interface PipelineOptions {
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Pipeline<TIn = unknown, TOut = unknown> implements Runnable<TIn, TOut> {
  private agents: Runnable<any, any>[];
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;
  private _lastMetrics: MetricsAccumulator | null = null;

  constructor(...args: [...Runnable<any, any>[], PipelineOptions] | Runnable<any, any>[]) {
    const { agents, options } = parseTrailingOptions<PipelineOptions>(args);

    if (agents.length === 0) {
      throw new Error("Pipeline requires at least one agent");
    }

    this.agents = agents;
    this.retryPolicy = options.retryPolicy ?? null;
    this.eventBus = options.eventBus ?? null;
  }

  get lastMetrics() { return this._lastMetrics; }

  async run(input: TIn): Promise<TOut> {
    this._lastMetrics = null;
    const accumulated = createMetrics();
    let result: unknown = input;

    try {
      for (let i = 0; i < this.agents.length; i++) {
        result = await this.runStep(this.agents[i], i, result);
        accumulateMetrics(accumulated, this.agents[i].lastMetrics);
      }

      this._lastMetrics = { ...accumulated };
      this.emitPipelineDone();

      return result as TOut;
    } finally {
      if (!this._lastMetrics) {
        this._lastMetrics = { ...accumulated };
      }
    }
  }

  resume(history: OrchestratorEvent[], input: TIn): Promise<TOut> {
    const { lastCompletedStep, lastOutput } = this.findLastCompletedStep(history, input);

    if (lastCompletedStep < 0) {
      return this.run(input);
    }

    const remainingAgents = this.agents.slice(lastCompletedStep + 1);
    if (remainingAgents.length === 0) {
      return Promise.resolve(lastOutput as TOut);
    }

    const resumePipeline = new Pipeline<unknown, TOut>(...remainingAgents, {
      retryPolicy: this.retryPolicy ?? undefined,
      eventBus: this.eventBus ?? undefined,
    });
    return resumePipeline.run(lastOutput);
  }

  private async runStep(agent: Runnable<any, any>, stepIndex: number, input: unknown): Promise<unknown> {
    const agentName = agent.name ?? `step-${stepIndex}`;

    this.eventBus?.emit({ type: "step:start", step: stepIndex, agent: agentName, timestamp: Date.now() });

    try {
      const output = await runWithOptionalRetry(agent, input, this.retryPolicy, this.eventBus);

      const metrics = agent.lastMetrics;
      this.eventBus?.emit({
        type: "step:done",
        step: stepIndex,
        agent: agentName,
        output,
        cost: metrics?.cost,
        tokens: metrics ? [metrics.inputTokens, metrics.outputTokens] : undefined,
        timestamp: Date.now(),
      });

      return output;
    } catch (err) {
      this.eventBus?.emit({
        type: "step:error",
        step: stepIndex,
        agent: agentName,
        error: errorMessage(err),
        timestamp: Date.now(),
      });
      throw new Error(`[Pipeline:step-${stepIndex}/${agentName}] ${errorMessage(err)}`);
    }
  }

  private findLastCompletedStep(
    history: OrchestratorEvent[],
    input: unknown,
  ): { lastCompletedStep: number; lastOutput: unknown } {
    for (let i = history.length - 1; i >= 0; i--) {
      const event = history[i];
      if (event.type === "step:done") {
        return { lastCompletedStep: event.step, lastOutput: event.output };
      }
    }

    return { lastCompletedStep: -1, lastOutput: input };
  }

  private emitPipelineDone(): void {
    const summary = this.eventBus?.getCostSummary();
    if (this.eventBus && summary) {
      this.eventBus.emit({ type: "pipeline:done", totalCost: summary.total, timestamp: Date.now() });
    }
  }
}

export function pipe<A, B>(s1: Runnable<A, B>, options?: PipelineOptions): Pipeline<A, B>;
export function pipe<A, B, C>(s1: Runnable<A, B>, s2: Runnable<B, C>, options?: PipelineOptions): Pipeline<A, C>;
export function pipe<A, B, C, D>(s1: Runnable<A, B>, s2: Runnable<B, C>, s3: Runnable<C, D>, options?: PipelineOptions): Pipeline<A, D>;
export function pipe<A, B, C, D, E>(s1: Runnable<A, B>, s2: Runnable<B, C>, s3: Runnable<C, D>, s4: Runnable<D, E>, options?: PipelineOptions): Pipeline<A, E>;
export function pipe(...args: any[]): Pipeline<any, any> {
  const { agents, options } = parseTrailingOptions<PipelineOptions>(args);
  return new Pipeline(...agents, options);
}
