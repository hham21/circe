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
  | { type: "round:done"; round: number; result: unknown; /** USD */ cost?: number; timestamp: number }
  | { type: "round:error"; round: number; error: string; timestamp: number }
  | { type: "branch:start"; branch: string; timestamp: number }
  | { type: "branch:done"; branch: string; result: unknown; /** USD */ cost?: number; timestamp: number }
  | { type: "branch:error"; branch: string; error: string; timestamp: number }
  | { type: "retry"; agent: string; attempt: number; maxAttempts: number; timestamp: number }
  | { type: "pipeline:done"; /** USD */ totalCost: number; timestamp: number }
  | { type: "sprint:start"; index: number; definition: unknown; timestamp: number }
  | { type: "sprint:done"; index: number; result: unknown; /** USD */ cost?: number; timestamp: number }
  | { type: "sprint:error"; index: number; error: string; timestamp: number };

type EventHandler<T extends OrchestratorEvent["type"]> = (
  event: Extract<OrchestratorEvent, { type: T }>,
) => void;

interface CostEntry {
  cost: number;
  agent: string;
}

function extractCostEntry(event: OrchestratorEvent): CostEntry | null {
  if (event.type === "agent:done") {
    return { cost: event.cost, agent: event.agent };
  }
  if (event.type === "agent:error" && event.cost != null) {
    return { cost: event.cost, agent: event.agent };
  }
  if (event.type === "step:done" && event.cost != null) {
    return { cost: event.cost, agent: event.agent };
  }
  if (event.type === "round:done" && event.cost != null) {
    return { cost: event.cost, agent: `round-${event.round}` };
  }
  if (event.type === "sprint:done" && event.cost != null) {
    return { cost: event.cost, agent: `sprint-${event.index}` };
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
  private handlerMap: Map<string, Array<(event: any) => void>> = new Map();
  private maxCost: number | null;
  private runningCost = 0;
  private perAgentCost: Record<string, number> = {};

  constructor(options?: EventBusOptions) {
    this.maxCost = options?.maxCost ?? null;
  }

  on<T extends OrchestratorEvent["type"]>(
    type: T,
    handler: EventHandler<T>,
  ): void {
    const list = this.handlerMap.get(type) ?? [];
    list.push(handler);
    this.handlerMap.set(type, list);
  }

  emit(event: OrchestratorEvent): void {
    this.history.push(event);

    const costEntry = extractCostEntry(event);
    if (costEntry) {
      this.runningCost += costEntry.cost;
      this.perAgentCost[costEntry.agent] = (this.perAgentCost[costEntry.agent] ?? 0) + costEntry.cost;
    }

    if (this.maxCost != null && this.runningCost > this.maxCost) {
      throw new Error(
        `Cost limit exceeded: $${this.runningCost.toFixed(2)} spent, limit is $${this.maxCost.toFixed(2)}`,
      );
    }

    const handlers = this.handlerMap.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[EventBus] handler error for ${event.type}:`, err);
        }
      }
    }
  }

  getCostSummary(): { total: number; perAgent: Record<string, number> } {
    return { total: this.runningCost, perAgent: { ...this.perAgentCost } };
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
 * Run a Runnable with optional retry + EventBus retry event emission.
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
  let lastError: Error | null = null;

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

  throw lastError!;
}
