import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { OutputFormatter } from "./output.js";
import { setFormatter, setWorkDir, setSkillRegistry } from "../context.js";
import { SkillRegistry } from "../tools/skills.js";

type RunnerFn = { run: (input: unknown) => Promise<unknown> };

const SLUG_MAX_LENGTH = 50;

export async function executeWorkflow(options: {
  workflow: string;
  input: string;
  outputDir?: string;
  maxRounds?: number;
  verbose?: boolean;
}): Promise<void> {
  const { workflow, input: rawInput, outputDir, maxRounds, verbose } = options;

  const userInput = resolveInput(rawInput);
  const workDir = resolveWorkDir(userInput, outputDir);
  const formatter = initializeContext(workDir, verbose);

  const startTime = Date.now();

  try {
    const runner = await loadWorkflowFile(workflow);

    const result = await runner.run(userInput);
    formatter.logResult(serializeResult(result));
  } finally {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    formatter.finalSummary(workDir, elapsedSeconds);
    formatter.close();
    teardownContext();
  }
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
  const target = join(base, slug);
  if (!existsSync(target)) return target;

  let counter = 1;
  while (existsSync(join(base, `${slug}-${counter}`))) {
    counter++;
  }
  return join(base, `${slug}-${counter}`);
}

function resolveWorkDir(userInput: string, outputDir?: string): string {
  const slug = slugify(userInput);
  const baseOutput = outputDir ?? resolve("output");
  const workDir = findUniqueOutputDir(baseOutput, slug);
  mkdirSync(workDir, { recursive: true });
  return workDir;
}

function initializeContext(workDir: string, verbose?: boolean): OutputFormatter {
  const formatter = new OutputFormatter(verbose);
  formatter.setLogFile(join(workDir, "circe.log"));
  setFormatter(formatter);
  setWorkDir(workDir);
  setSkillRegistry(createSkillRegistry(workDir));
  return formatter;
}

function createSkillRegistry(workDir: string): SkillRegistry {
  const skillDirs = [
    join(workDir, ".circe", "skills"),
    join(process.env.HOME!, ".circe", "skills"),
  ];
  return new SkillRegistry(skillDirs);
}

function teardownContext(): void {
  setFormatter(null);
  setWorkDir(null);
  setSkillRegistry(null);
}

async function loadWorkflowFile(path: string): Promise<RunnerFn> {
  const mod = await import(resolve(path));
  if (typeof mod.default?.run === "function") return mod.default;
  if (typeof mod.app?.run === "function") return mod.app;
  throw new Error(`Workflow file must export 'default' or 'app' with a run() method: ${path}`);
}

function serializeResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}
