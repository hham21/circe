import type { Runnable } from "./types.js";

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

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
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
