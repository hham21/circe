import { sessionStore } from "./store.js";
import type { CostPolicy } from "./session.js";

export type OrchestratorEvent =
  | { type: "agent:start"; agent: string; timestamp: number }
  | {
      type: "agent:done";
      agent: string;
      result: unknown;
      /** USD */ cost: number;
      tokens: [number, number];
      timestamp: number;
    }
  | {
      type: "agent:error";
      agent: string;
      error: string;
      attempt: number;
      /** USD */ cost?: number;
      tokens?: [number, number];
      timestamp: number;
    }
  | { type: "step:start"; step: number; agent: string; timestamp: number }
  | {
      type: "step:done";
      step: number;
      agent: string;
      output: unknown;
      /** USD */ cost?: number;
      tokens?: [number, number];
      timestamp: number;
    }
  | { type: "step:error"; step: number; agent: string; error: string; timestamp: number }
  | { type: "round:start"; round: number; timestamp: number }
  | { type: "round:done"; round: number; result: unknown; /** USD */ cost?: number; costByAgent?: Record<string, number>; timestamp: number }
  | { type: "round:error"; round: number; error: string; timestamp: number }
  | { type: "branch:start"; branch: string; timestamp: number }
  | { type: "branch:done"; branch: string; result: unknown; /** USD */ cost?: number; timestamp: number }
  | { type: "branch:error"; branch: string; error: string; timestamp: number }
  | { type: "retry"; agent: string; attempt: number; maxAttempts: number; timestamp: number }
  | { type: "pipeline:done"; /** USD */ totalCost: number; timestamp: number }
  | { type: "sprint:start"; index: number; definition: unknown; timestamp: number }
  | { type: "sprint:done"; index: number; result: unknown; /** USD */ cost?: number; timestamp: number }
  | { type: "sprint:error"; index: number; error: string; timestamp: number }
  | { type: "cost:warning"; costPressure: number; runningCost: number; maxCost: number; timestamp: number }
  | { type: "cost:pressure"; costPressure: number; runningCost: number; timestamp: number }
  | { type: "cost:agent-limit"; agent: string; agentCost: number; limit: number; timestamp: number };

type EventHandler<T extends OrchestratorEvent["type"]> = (
  event: Extract<OrchestratorEvent, { type: T }>,
) => void;

interface CostEntry {
  cost: number;
  agent: string;
}

function extractCostEntry(event: OrchestratorEvent): CostEntry | null {
  // Only count leaf-level cost events that represent actual LLM calls.
  // Skip step:done, round:done, sprint:done — these are orchestrator wrappers
  // that report the same cost already counted at the agent level.
  if (event.type === "agent:done") {
    return { cost: event.cost, agent: event.agent };
  }
  if (event.type === "agent:error" && event.cost != null) {
    return { cost: event.cost, agent: event.agent };
  }
  if (event.type === "branch:done" && event.cost != null) {
    return { cost: event.cost, agent: event.branch };
  }
  return null;
}

export interface EventBusOptions {
  maxCost?: number;
}

export class EventBus {
  history: OrchestratorEvent[] = [];
  private handlersByType: Map<string, Array<(event: any) => void>> = new Map();
  private maxCost: number | null;
  private runningCost = 0;
  private costByAgent: Record<string, number> = {};
  private warned = false;
  private softStopped = false;

  constructor(options?: EventBusOptions) {
    this.maxCost = options?.maxCost ?? null;
  }

  on<T extends OrchestratorEvent["type"]>(
    type: T,
    handler: EventHandler<T>,
  ): void {
    const existing = this.handlersByType.get(type) ?? [];
    this.handlersByType.set(type, [...existing, handler]);
  }

  emit(event: OrchestratorEvent): void {
    this.history.push(event);
    this.trackCost(event);
    this.dispatchToHandlers(event);
  }

  getCostSummary(): { total: number; perAgent: Record<string, number> } {
    return { total: this.runningCost, perAgent: { ...this.costByAgent } };
  }

  getCostPressure(): number {
    const maxCost = this.resolveMaxCost();
    if (maxCost == null || maxCost === 0) return 0;
    return this.runningCost / maxCost;
  }

  private resolveMaxCost(): number | null {
    return sessionStore.getStore()?.maxCost ?? this.maxCost;
  }

  private resolveCostPolicy(): CostPolicy | null {
    return sessionStore.getStore()?.costPolicy ?? null;
  }

  private trackCost(event: OrchestratorEvent): void {
    const costEntry = extractCostEntry(event);
    if (!costEntry) {
      return;
    }

    this.runningCost += costEntry.cost;
    this.costByAgent[costEntry.agent] = (this.costByAgent[costEntry.agent] ?? 0) + costEntry.cost;

    const maxCost = this.resolveMaxCost();
    const policy = this.resolveCostPolicy();

    if (policy && maxCost != null) {
      // Graduated policy path (Session present)
      const costPressure = this.runningCost / maxCost;

      // Emit cost:pressure on every cost update
      this.emitInternal({
        type: "cost:pressure",
        costPressure,
        runningCost: this.runningCost,
        timestamp: Date.now(),
      });

      // Check per-agent limits
      this.checkAgentLimit(costEntry);

      // Graduated thresholds: warn → softStop → hardStop
      if (policy.warn != null && costPressure >= policy.warn && !this.warned) {
        this.warned = true;
        this.emitInternal({
          type: "cost:warning",
          costPressure,
          runningCost: this.runningCost,
          maxCost,
          timestamp: Date.now(),
        });
      }

      if (policy.softStop != null && costPressure >= policy.softStop && !this.softStopped) {
        this.softStopped = true;
        const session = sessionStore.getStore();
        if (session) {
          session.shouldStop = true;
        }
      }

      if (policy.hardStop != null && costPressure >= policy.hardStop) {
        throw new Error(
          `Cost limit exceeded: $${this.runningCost.toFixed(2)} spent, limit is $${maxCost.toFixed(2)}`,
        );
      }
    } else if (maxCost != null && this.runningCost > maxCost) {
      // Fallback: no Session, use EventBusOptions.maxCost hard-stop (backward compat)
      throw new Error(
        `Cost limit exceeded: $${this.runningCost.toFixed(2)} spent, limit is $${maxCost.toFixed(2)}`,
      );
    }
  }

  private checkAgentLimit(entry: CostEntry): void {
    const session = sessionStore.getStore();
    if (!session) return;

    const limit = session.agentCostLimits[entry.agent];
    if (limit == null) return;

    const agentCost = this.costByAgent[entry.agent] ?? 0;
    if (agentCost > limit) {
      this.emitInternal({
        type: "cost:agent-limit",
        agent: entry.agent,
        agentCost,
        limit,
        timestamp: Date.now(),
      });
      throw new Error(
        `Agent cost limit exceeded: agent "${entry.agent}" spent $${agentCost.toFixed(2)}, limit is $${limit.toFixed(2)}`,
      );
    }
  }

  /** Emit an event without re-entering trackCost (avoids infinite recursion for cost events). */
  private emitInternal(event: OrchestratorEvent): void {
    this.history.push(event);
    this.dispatchToHandlers(event);
  }

  private dispatchToHandlers(event: OrchestratorEvent): void {
    const handlers = this.handlersByType.get(event.type);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[EventBus] handler error for ${event.type}:`, err);
      }
    }
  }
}

export interface RetryPolicy {
  maxRetries: number;
  backoff?: (attempt: number) => number;
  shouldRetry?: (error: Error) => boolean;
}

const NON_RETRYABLE_PATTERNS = [
  /\b400\b/,
  /\b401\b/,
  /\b403\b/,
  /bad request/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid.*model/i,
  /invalid.*api.?key/i,
];

export function defaultShouldRetry(error: Error): boolean {
  const msg = error.message;
  return !NON_RETRYABLE_PATTERNS.some((p) => p.test(msg));
}

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

export function defaultBackoff(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export function errorMessage(err: unknown): string {
  return toError(err).message;
}

/**
 * Run an agent with optional retry and EventBus retry event emission.
 * Shared by all orchestrators to eliminate duplicated retry wrappers.
 */
export async function runWithOptionalRetry<TIn, TOut>(
  agent: { name?: string; run(input: TIn): Promise<TOut> },
  input: TIn,
  retryPolicy: RetryPolicy | null,
  eventBus: EventBus | null,
): Promise<TOut> {
  if (!retryPolicy) {
    return agent.run(input);
  }

  return executeWithRetry(
    () => agent.run(input),
    retryPolicy,
    (attempt) => {
      eventBus?.emit({
        type: "retry",
        agent: agent.name ?? "unknown",
        attempt,
        maxAttempts: retryPolicy.maxRetries,
        timestamp: Date.now(),
      });
    },
  );
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  onRetry?: (attempt: number, error: Error) => void,
): Promise<T> {
  const shouldRetry = policy.shouldRetry ?? defaultShouldRetry;
  const backoff = policy.backoff ?? defaultBackoff;
  let lastError!: Error;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = toError(err);

      if (attempt >= policy.maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      onRetry?.(attempt + 1, lastError);
      const delay = backoff(attempt);
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
