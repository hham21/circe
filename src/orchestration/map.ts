import type { Runnable } from "../types.js";

export function map<TIn, TOut>(
  fn: (input: TIn) => TOut | Promise<TOut>,
): Runnable<TIn, TOut> {
  return {
    name: "map",
    lastMetrics: null,
    async run(input: TIn): Promise<TOut> {
      return fn(input);
    },
  };
}
