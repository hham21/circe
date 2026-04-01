import { z } from "zod";

export interface Runnable {
  run(input: unknown): Promise<unknown>;
}

export const RunContextSchema = z.object({
  workDir: z.string(),
  sessionId: z.string().nullable().default(null),
  model: z.string().default("claude-opus-4-6"),
  verbose: z.boolean().default(false),
});

export type RunContext = z.infer<typeof RunContextSchema>;

export const RunContext = {
  parse: (data: unknown) => RunContextSchema.parse(data),
};
