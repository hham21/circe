import { z } from "zod";

export type MetricsSnapshot = { cost: number; inputTokens: number; outputTokens: number };

export interface Runnable<TIn = unknown, TOut = unknown> {
  name?: string;
  lastMetrics?: MetricsSnapshot | null;
  run(input: TIn): Promise<TOut>;
}

const DEFAULT_MODEL = "claude-opus-4-6";

export const RunContextSchema = z.object({
  workDir: z.string(),
  sessionId: z.string().nullable().default(null),
  model: z.string().default(DEFAULT_MODEL),
  verbose: z.boolean().default(false),
});

export type RunContext = z.infer<typeof RunContextSchema>;

export const RunContext = {
  parse: (data: unknown) => RunContextSchema.parse(data),
};
