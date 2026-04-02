import type { Runnable } from "./types.js";

function extractBalancedBraces(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/**
 * Extract the first JSON string from text.
 * Checks for fenced code blocks first, then bare JSON objects.
 * Returns the raw JSON string (not parsed).
 */
export function findJsonString(text: string): string | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const start = text.indexOf("{");
  if (start !== -1) {
    const extracted = extractBalancedBraces(text, start);
    if (extracted) return extracted;
  }

  return null;
}

function isRunnable(value: unknown): value is Runnable {
  return value != null && typeof value === "object" && "run" in value;
}

/**
 * Parse a variadic constructor signature where the last arg may be an options object.
 * Used by Pipeline, Parallel, and Loop.
 */
export function parseTrailingOptions<T>(
  args: unknown[],
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
