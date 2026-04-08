import { join } from "node:path";
import type { MetricsSnapshot, Runnable } from "./types.js";

export function circeHome(): string {
  return process.env.CIRCE_HOME ?? join(process.env.HOME!, ".circe");
}

export const PLAYWRIGHT_MCP_SERVER = { command: "npx", args: ["@playwright/mcp@latest"] } as const;

// --- JSON extraction ---

const FENCED_CODE_BLOCK_PATTERN = /```(?:json)?\s*\n([\s\S]*?)\n```/;

/**
 * Extracts the first JSON string from text.
 * Prefers fenced code blocks; falls back to the first bare JSON object.
 * Returns the raw JSON string without parsing it.
 */
export function findJsonString(text: string): string | null {
  const codeBlockMatch = text.match(FENCED_CODE_BLOCK_PATTERN);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const start = text.indexOf("{");
  if (start !== -1) {
    return extractBalancedBraces(text, start);
  }

  return null;
}

function extractBalancedBraces(text: string, start: number): string | null {
  let depth = 0;
  let isInsideString = false;
  let isEscaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (isEscaped) { isEscaped = false; continue; }
    if (char === "\\") { isEscaped = true; continue; }
    if (char === '"') { isInsideString = !isInsideString; continue; }
    if (isInsideString) continue;

    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

// --- Variadic constructor helpers ---

/**
 * Parses a variadic constructor signature where the last argument may be an
 * options object. Used by Pipeline, Parallel, and Loop.
 */
export function parseTrailingOptions<T>(
  args: any[],
): { agents: Runnable[]; options: T } {
  if (args.length === 0) {
    return { agents: [], options: {} as T };
  }

  const last = args[args.length - 1];
  if (last && !isRunnable(last)) {
    return {
      agents: args.slice(0, -1) as Runnable[],
      options: last as T,
    };
  }

  return { agents: args as Runnable[], options: {} as T };
}

function isRunnable(value: unknown): value is Runnable {
  return value != null && typeof value === "object" && "run" in value;
}

// --- Metrics helpers ---

export type MetricsAccumulator = MetricsSnapshot;

export function createMetrics(): MetricsAccumulator {
  return { cost: 0, inputTokens: 0, outputTokens: 0 };
}

export function accumulateMetrics(
  acc: MetricsAccumulator,
  metrics: MetricsSnapshot | null | undefined,
): void {
  if (!metrics) return;
  acc.cost += metrics.cost;
  acc.inputTokens += metrics.inputTokens;
  acc.outputTokens += metrics.outputTokens;
}
