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
  | { type: "step:done"; step: number; agent: string; output: unknown; /** USD */ cost?: number; tokens?: [number, number]; timestamp: number }
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
  | { type: "sprint:done"; index: number; result: unknown; timestamp: number }
  | { type: "sprint:error"; index: number; error: string; timestamp: number };

type EventHandler<T extends OrchestratorEvent["type"]> = (
  event: Extract<OrchestratorEvent, { type: T }>,
) => void;

interface HandlerEntry {
  type: string;
  handler: (event: any) => void;
}

export class EventBus {
  history: OrchestratorEvent[] = [];
  private handlers: HandlerEntry[] = [];

  on<T extends OrchestratorEvent["type"]>(
    type: T,
    handler: EventHandler<T>,
  ): void {
    this.handlers.push({ type, handler });
  }

  emit(event: OrchestratorEvent): void {
    this.history.push(event);
    for (const entry of this.handlers) {
      if (entry.type === event.type) {
        try {
          entry.handler(event);
        } catch (err) {
          console.error(`[EventBus] handler error for ${event.type}:`, err);
        }
      }
    }
  }

  getCostSummary(): { total: number; perAgent: Record<string, number> } {
    let total = 0;
    const perAgent: Record<string, number> = {};

    for (const event of this.history) {
      let cost: number | undefined;
      let agent: string | undefined;

      if (event.type === "agent:done") {
        cost = event.cost;
        agent = event.agent;
      } else if (event.type === "agent:error" && event.cost != null) {
        cost = event.cost;
        agent = event.agent;
      } else if (event.type === "step:done" && event.cost != null) {
        cost = event.cost;
        agent = event.agent;
      } else if (event.type === "branch:done" && event.cost != null) {
        cost = event.cost;
        agent = event.branch;
      }

      if (cost != null && agent != null) {
        total += cost;
        perAgent[agent] = (perAgent[agent] ?? 0) + cost;
      }
    }

    return { total, perAgent };
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

const MAX_BACKOFF_MS = 60_000;

export function defaultBackoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
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
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));

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
