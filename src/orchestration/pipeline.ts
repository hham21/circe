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
      const agent = this.agents[i];
      const agentName = (agent as any).name ?? `step-${i}`;

      this.eventBus?.emit({ type: "step:start", step: i, agent: agentName, timestamp: Date.now() });

      try {
        if (this.retryPolicy) {
          const capturedResult = result;
          result = await executeWithRetry(
            () => agent.run(capturedResult),
            this.retryPolicy,
            (attempt, error) => {
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
          result = await agent.run(result);
        }

        const metrics = (agent as any).lastMetrics;
        this.eventBus?.emit({
          type: "step:done",
          step: i,
          agent: agentName,
          output: result,
          cost: metrics?.cost,
          tokens: metrics ? [metrics.inputTokens, metrics.outputTokens] : undefined,
          timestamp: Date.now(),
        });
      } catch (err: any) {
        this.eventBus?.emit({
          type: "step:error",
          step: i,
          agent: agentName,
          error: err.message ?? String(err),
          timestamp: Date.now(),
        });
        throw err;
      }
    }

    const summary = this.eventBus?.getCostSummary();
    if (this.eventBus && summary) {
      this.eventBus.emit({ type: "pipeline:done", totalCost: summary.total, timestamp: Date.now() });
    }

    return result;
  }

  resume(history: OrchestratorEvent[], input: unknown): Promise<unknown> {
    let lastCompletedStep = -1;
    let lastOutput: unknown = input;

    for (const event of history) {
      if (event.type === "step:done" && event.step > lastCompletedStep) {
        lastCompletedStep = event.step;
        lastOutput = event.output;
      }
    }

    if (lastCompletedStep < 0) {
      return this.run(input);
    }

    const remaining = this.agents.slice(lastCompletedStep + 1);
    if (remaining.length === 0) {
      return Promise.resolve(lastOutput);
    }

    const resumePipeline = new Pipeline(...remaining, {
      retryPolicy: this.retryPolicy ?? undefined,
      eventBus: this.eventBus ?? undefined,
    });
    return resumePipeline.run(lastOutput);
  }
}
