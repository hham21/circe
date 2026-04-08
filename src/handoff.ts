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

export function hasQAPassed(result: unknown): result is { passed: true } {
  if (result != null && typeof result === "object" && "passed" in result) {
    return (result as { passed: unknown }).passed === true;
  }
  return false;
}

export const Feature = FeatureSchema;
export const TechStack = TechStackSchema;
export const ProductSpec = ProductSpecSchema;
export const BuildResult = BuildResultSchema;
export const QAReport = QAReportSchema;
