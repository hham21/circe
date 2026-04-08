import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Session } from "../session.js";

type WorkflowRunner = { run: (input: unknown) => Promise<unknown> };

const SLUG_MAX_LENGTH = 50;

export async function executeWorkflow(options: {
  workflow: string;
  input: string;
  outputDir?: string;
  verbose?: boolean;
}): Promise<void> {
  const { workflow, input: rawInput, outputDir, verbose } = options;

  const userInput = resolveInput(rawInput);
  const slug = slugify(userInput);
  const baseOutput = outputDir ?? resolve("output");
  const outDir = findUniqueOutputDir(baseOutput, slug);

  const session = new Session({ outputDir: outDir, verbose });

  await session.run(async () => {
    try {
      const runner = await loadWorkflowFile(workflow);
      const result = await runner.run(userInput);
      session.formatter.logResult(serializeResult(result));
    } finally {
      session.formatter.finalSummary(outDir, session.duration);
    }
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}

export function resolveInput(input: string): string {
  if (existsSync(input)) {
    return readFileSync(input, "utf-8");
  }
  return input;
}

export function findUniqueOutputDir(base: string, slug: string): string {
  const preferred = join(base, slug);
  if (!existsSync(preferred)) return preferred;

  let counter = 1;
  while (existsSync(join(base, `${slug}-${counter}`))) {
    counter++;
  }
  return join(base, `${slug}-${counter}`);
}

async function loadWorkflowFile(path: string): Promise<WorkflowRunner> {
  const mod = await import(resolve(path));
  if (typeof mod.default?.run === "function") return mod.default;
  if (typeof mod.app?.run === "function") return mod.app;
  throw new Error(
    `Workflow file must export 'default' or 'app' with a run() method: ${path}`,
  );
}

function serializeResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}
