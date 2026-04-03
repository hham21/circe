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

function makeParser<T>(schema: { parse: (d: unknown) => T }) {
  return { parse: (d: unknown) => schema.parse(d) };
}

export const Feature = makeParser(FeatureSchema);
export const TechStack = makeParser(TechStackSchema);
export const ProductSpec = makeParser(ProductSpecSchema);
export const BuildResult = makeParser(BuildResultSchema);
export const QAReport = makeParser(QAReportSchema);
