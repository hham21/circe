import type { Runnable } from "../types.js";
import type { EventBus, RetryPolicy, OrchestratorEvent } from "../events.js";
import { executeWithRetry } from "../events.js";
import { parseTrailingOptions } from "../utils.js";

export interface PipelineOptions {
  retryPolicy?: RetryPolicy;
  eventBus?: EventBus;
}

export class Pipeline implements Runnable {
  private agents: Runnable[];
  private retryPolicy: RetryPolicy | null;
  private eventBus: EventBus | null;

  constructor(...args: [...Runnable[], PipelineOptions] | Runnable[]) {
    const { agents, options } = parseTrailingOptions<PipelineOptions>(args);

    if (agents.length === 0) {
      throw new Error("Pipeline requires at least one agent");
    }

    this.agents = agents;
    this.retryPolicy = options.retryPolicy ?? null;
    this.eventBus = options.eventBus ?? null;
  }

  async run(input: unknown): Promise<unknown> {
    let result = input;

    for (let i = 0; i < this.agents.length; i++) {
      result = await this.runStep(this.agents[i], i, result);
    }

    this.emitPipelineDone();

    return result;
  }

  resume(history: OrchestratorEvent[], input: unknown): Promise<unknown> {
    const { lastCompletedStep, lastOutput } = this.findLastCompletedStep(history, input);

    if (lastCompletedStep < 0) {
      return this.run(input);
    }

    const remainingAgents = this.agents.slice(lastCompletedStep + 1);
    if (remainingAgents.length === 0) {
      return Promise.resolve(lastOutput);
    }

    const resumePipeline = new Pipeline(...remainingAgents, {
      retryPolicy: this.retryPolicy ?? undefined,
      eventBus: this.eventBus ?? undefined,
    });
    return resumePipeline.run(lastOutput);
  }

  private async runStep(agent: Runnable, stepIndex: number, input: unknown): Promise<unknown> {
    const agentName = (agent as any).name ?? `step-${stepIndex}`;

    this.eventBus?.emit({ type: "step:start", step: stepIndex, agent: agentName, timestamp: Date.now() });

    try {
      const output = await this.executeAgent(agent, agentName, input);

      const metrics = (agent as any).lastMetrics;
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
    } catch (err: any) {
      this.eventBus?.emit({
        type: "step:error",
        step: stepIndex,
        agent: agentName,
        error: err.message ?? String(err),
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  private async executeAgent(agent: Runnable, agentName: string, input: unknown): Promise<unknown> {
    if (!this.retryPolicy) {
      return agent.run(input);
    }

    return executeWithRetry(
      () => agent.run(input),
      this.retryPolicy,
      (attempt) => {
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

  private findLastCompletedStep(
    history: OrchestratorEvent[],
    input: unknown,
  ): { lastCompletedStep: number; lastOutput: unknown } {
    let lastCompletedStep = -1;
    let lastOutput: unknown = input;

    for (const event of history) {
      if (event.type === "step:done" && event.step > lastCompletedStep) {
        lastCompletedStep = event.step;
        lastOutput = event.output;
      }
    }

    return { lastCompletedStep, lastOutput };
  }

  private emitPipelineDone(): void {
    const summary = this.eventBus?.getCostSummary();
    if (this.eventBus && summary) {
      this.eventBus.emit({ type: "pipeline:done", totalCost: summary.total, timestamp: Date.now() });
    }
  }
}
