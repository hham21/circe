import { z } from "zod";

export const FeatureSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const TechStackSchema = z.object({
  frontend: z.string(),
  backend: z.string(),
  database: z.string(),
});

export const ProductSpecSchema = z.object({
  appName: z.string(),
  features: z.array(FeatureSchema),
  techStack: TechStackSchema,
  designDirection: z.string(),
});

export const BuildResultSchema = z.object({
  appDir: z.string(),
  runCommand: z.string(),
  port: z.number(),
  selfAssessment: z.string(),
});

export const QAReportSchema = z.object({
  passed: z.boolean(),
  scores: z.record(z.string(), z.number()),
  feedback: z.array(z.string()),
});

export type Feature = z.infer<typeof FeatureSchema>;
export type TechStack = z.infer<typeof TechStackSchema>;
export type ProductSpec = z.infer<typeof ProductSpecSchema>;
export type BuildResult = z.infer<typeof BuildResultSchema>;
export type QAReport = z.infer<typeof QAReportSchema>;

export const Feature = { parse: (d: unknown) => FeatureSchema.parse(d) };
export const TechStack = { parse: (d: unknown) => TechStackSchema.parse(d) };
export const ProductSpec = { parse: (d: unknown) => ProductSpecSchema.parse(d) };
export const BuildResult = { parse: (d: unknown) => BuildResultSchema.parse(d) };
export const QAReport = { parse: (d: unknown) => QAReportSchema.parse(d) };
