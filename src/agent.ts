import { query, createSdkMcpServer, tool as sdkTool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ZodSchema } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getFormatter, getWorkDir, getSkillRegistry } from "./context.js";
import type { Runnable } from "./types.js";
import { findJsonString, circeHome } from "./utils.js";

export interface AgentConfig {
  name: string;
  prompt: string;
  /** Auto-approve list, NOT a restriction. Unlisted tools fall through to permissionMode. */
  tools?: string[] | null;
  /** Tools to always deny. Checked before allowedTools and permissionMode. */
  disallowedTools?: string[];
  skills?: string[];
  mcpServers?: Record<string, unknown>;
  contextStrategy?: "compaction" | "reset";
  permissionMode?: string;
  continueSession?: boolean;
  inputSchema?: ZodSchema;
  outputSchema?: ZodSchema;
  model?: string;
  costPerMTokens?: { input: number; output: number };
  timeout?: number;
}

export interface ResultMetrics {
  resultText: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
}

const DEFAULT_COST_PER_M_TOKENS = { input: 15, output: 75 };
const BYPASS_PERMISSIONS_MODE = "bypassPermissions";
const SKILL_SERVER_NAME = "circe-skills";
const INPUT_PREVIEW_MAX_LENGTH = 80;

export class Agent<TIn = string, TOut = string> implements Runnable<TIn, TOut> {
  name: string;
  prompt: string;
  tools: string[] | null;
  disallowedTools: string[];
  skills: string[];
  mcpServers: Record<string, unknown>;
  contextStrategy: "compaction" | "reset";
  permissionMode: string;
  continueSession: boolean;
  inputSchema: ZodSchema | null;
  outputSchema: ZodSchema | null;
  model: string | undefined;
  private costPerMTokens: { input: number; output: number };
  private timeout: number;
  private sessionId: string | null = null;
  private _lastMetrics: ResultMetrics | null = null;
  private _jsonSchema: Record<string, unknown> | null = null;

  get lastMetrics(): ResultMetrics | null {
    return this._lastMetrics;
  }

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.prompt = config.prompt;
    this.tools = config.tools ?? null;
    this.disallowedTools = config.disallowedTools ?? [];
    this.skills = config.skills ?? [];
    this.mcpServers = config.mcpServers ?? {};
    this.contextStrategy = config.contextStrategy ?? "compaction";
    this.permissionMode = config.permissionMode ?? BYPASS_PERMISSIONS_MODE;
    this.continueSession = config.continueSession ?? false;
    this.inputSchema = config.inputSchema ?? null;
    this.outputSchema = config.outputSchema ?? null;
    this.model = config.model;
    this.costPerMTokens = config.costPerMTokens ?? DEFAULT_COST_PER_M_TOKENS;
    this.timeout = config.timeout ?? 0;

    if (this.outputSchema) {
      this._jsonSchema = zodToJsonSchema(this.outputSchema) as Record<string, unknown>;
    }
  }

  // --- Public methods ---

  buildSystemPrompt(): string {
    const registry = getSkillRegistry();
    if (!registry || this.skills.length === 0) return this.prompt;

    const summary = registry.promptSummary(this.skills);
    return summary ? `${this.prompt}\n\n${summary}` : this.prompt;
  }

  async run(input: TIn): Promise<TOut> {
    this.validateInput(input);
    this.validateSkills();

    if (this.timeout <= 0) return this.executeQuery(input);

    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), this.timeout);

    try {
      return await this.executeQuery(input, abortController);
    } catch (err: any) {
      if (abortController.signal.aborted) {
        throw new Error(`[${this.name}] timed out after ${this.timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async executeQuery(input: TIn, abortController?: AbortController): Promise<TOut> {
    const formatter = getFormatter() as any;
    const workDir = getWorkDir();
    formatter?.agentStart?.(this.name, this.prompt.slice(0, 60));

    const userPrompt = this.buildUserPrompt(input);
    const options = this.buildSdkOptions(workDir, abortController);
    let metrics: ResultMetrics = { resultText: "", cost: 0, inputTokens: 0, outputTokens: 0 };
    let structuredOutput: unknown = undefined;

    try {
      for await (const message of query({ prompt: userPrompt, options })) {
        this.handleSessionInit(message);
        this.handleAssistantMessage(message, formatter);
        if (message.type === "result") {
          metrics = this.extractResultMetrics(message);
          structuredOutput = (message as any).structured_output;
        }
      }
    } catch (err: any) {
      const { inputTokens, outputTokens, cost } = metrics;
      formatter?.agentDone?.(this.name, `ERROR: ${err.message}`, [inputTokens, outputTokens], cost);
      throw new Error(`[${this.name}] ${err.message}`);
    }

    return this.finalize(metrics, structuredOutput, formatter);
  }

  buildUserPrompt(input: TIn): string {
    const workDir = getWorkDir();
    const workDirRule = workDir
      ? `IMPORTANT: Your working directory is ${workDir}. All file operations MUST use this directory. Do NOT cd to other directories.`
      : "IMPORTANT: Use relative paths from the working directory.";
    const rules = [workDirRule, "Never create files inside an 'output/' subdirectory."].join("\n");

    if (input == null) return rules;

    const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);
    return `${rules}\n\n${inputStr}`;
  }

  extractJson(text: string): string | null {
    return findJsonString(text);
  }

  parseResult(raw: string): unknown {
    if (!this.outputSchema) return raw;

    const jsonStr = this.extractJson(raw);
    if (!jsonStr) return raw;

    try {
      return this.tryParseWithSchema(JSON.parse(jsonStr));
    } catch {
      return raw;
    }
  }

  private tryParseWithSchema(data: unknown): unknown {
    if (!this.outputSchema) return data;
    try {
      return this.outputSchema.parse(data);
    } catch {
      return data;
    }
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * this.costPerMTokens.input + outputTokens * this.costPerMTokens.output) / 1_000_000;
  }

  // --- run() implementation details ---

  private validateInput(input: TIn): void {
    if (!this.inputSchema) return;

    const result = this.inputSchema.safeParse(input);
    if (result.success) return;

    const received = this.describeInputForError(input);
    const issues = result.error.issues.map((i: any) => i.message).join(", ");
    throw new Error(`[${this.name}] input validation failed — ${issues} (received ${received})`);
  }

  private describeInputForError(input: unknown): string {
    if (typeof input !== "string") return typeof input;
    const preview = input.slice(0, INPUT_PREVIEW_MAX_LENGTH);
    const truncated = input.length > INPUT_PREVIEW_MAX_LENGTH ? "…" : "";
    return `string: "${preview}${truncated}"`;
  }

  private validateSkills(): void {
    const registry = getSkillRegistry();
    if (registry && this.skills.length > 0) {
      registry.validateSkills(this.skills);
    }
  }

  private handleSessionInit(message: any): void {
    if (message.type === "system" && message.subtype === "init" && this.continueSession) {
      this.sessionId = message.session_id ?? null;
    }
  }

  private handleAssistantMessage(message: any, formatter: any): void {
    if (message.type !== "assistant") return;
    if (!formatter?.logActivity || !message.message?.content) return;

    for (const block of message.message.content) {
      if (block.type === "tool_use") {
        formatter.logActivity(this.name, this.summarizeToolCall(block));
      }
    }
  }

  private extractResultMetrics(message: any): ResultMetrics {
    if (message.is_error) {
      throw new Error(`[${this.name}] SDK error: ${message.result ?? "unknown"}`);
    }

    const resultText =
      typeof message.result === "string" ? message.result : JSON.stringify(message.result);

    const { inputTokens, outputTokens } = this.extractTokenCounts(message.usage);
    const cost = message.total_cost_usd ?? this.estimateCost(inputTokens, outputTokens);
    return { resultText, cost, inputTokens, outputTokens };
  }

  private extractTokenCounts(usage: any): { inputTokens: number; outputTokens: number } {
    if (!usage) return { inputTokens: 0, outputTokens: 0 };

    const inputTokens =
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    const outputTokens = usage.output_tokens ?? 0;
    return { inputTokens, outputTokens };
  }

  private finalize(metrics: ResultMetrics, structuredOutput: unknown, formatter: any): TOut {
    this._lastMetrics = metrics;
    const { resultText, cost, inputTokens, outputTokens } = metrics;
    const parsed = structuredOutput !== undefined ? this.tryParseWithSchema(structuredOutput) : this.parseResult(resultText);

    if (formatter?.agentDone) {
      const formattedOutput = typeof parsed === "string" ? this.stripCodeBlock(parsed) : JSON.stringify(parsed);
      formatter.agentDone(this.name, formattedOutput, [inputTokens, outputTokens], cost);
    }

    return parsed as TOut;
  }

  // --- SDK option builders ---

  private buildSdkOptions(workDir: string | null, abortController?: AbortController): Record<string, unknown> {
    const options: Record<string, unknown> = {
      systemPrompt: this.buildSystemPrompt(),
      permissionMode: this.permissionMode,
    };

    if (this.model) {
      options.model = this.model;
    }
    if (abortController) {
      options.abortController = abortController;
    }

    if (this.permissionMode === BYPASS_PERMISSIONS_MODE) {
      options.allowDangerouslySkipPermissions = true;
    }
    if (this.tools) {
      options.allowedTools = this.tools;
    }
    if (this.disallowedTools.length > 0) {
      options.disallowedTools = this.disallowedTools;
    }
    if (Object.keys(this.mcpServers).length > 0) {
      options.mcpServers = this.mcpServers;
    }
    if (workDir) {
      options.cwd = workDir;
    }
    if (this.continueSession && this.sessionId) {
      options.resume = this.sessionId;
    }
    if (this._jsonSchema) {
      options.outputFormat = { type: "json_schema", schema: this._jsonSchema };
    }

    const skillServer = this.skills.length > 0 ? this.buildSkillMcpServer() : null;
    if (skillServer) {
      const existingServers = (options.mcpServers as Record<string, unknown>) ?? {};
      options.mcpServers = { ...existingServers, [SKILL_SERVER_NAME]: skillServer };
    }

    return options;
  }

  private buildSkillMcpServer() {
    const registry = getSkillRegistry();
    if (!registry) return null;

    return createSdkMcpServer({
      name: SKILL_SERVER_NAME,
      tools: [
        sdkTool(
          "use_skill",
          "Load a skill's full content by name. Use this to access detailed methodology.",
          { name: z.string().describe("Name of the skill to load") },
          async (args) => this.loadSkillContent(registry, args.name)
        ),
      ],
    });
  }

  private loadSkillContent(
    registry: NonNullable<ReturnType<typeof getSkillRegistry>>,
    skillName: string
  ): { content: Array<{ type: "text"; text: string }> } {
    const content = registry.getSkill(skillName);
    if (content) {
      console.error(`[skill] Loaded: ${skillName}`);
      return { content: [{ type: "text" as const, text: content }] };
    }
    console.error(`[skill] Not found: ${skillName}`);
    return {
      content: [{ type: "text" as const, text: `Skill '${skillName}' not found. Continuing without it.` }],
    };
  }

  // --- Output formatting helpers ---

  private stripCodeBlock(text: string): string {
    const match = text.match(/```(?:\w*)\s*\n([\s\S]*?)\n```/);
    return match ? match[1].trim() : text;
  }

  private summarizeToolCall(block: any): string {
    const name = block.name ?? "unknown";
    const input = block.input ?? {};
    if (name === "Bash" && input.command) return `$ ${input.command}`;
    if (name === "Read" && input.file_path) return `Read ${input.file_path}`;
    if (name === "Write" && input.file_path) return `Write ${input.file_path}`;
    if (name === "Edit" && input.file_path) return `Edit ${input.file_path}`;
    return name;
  }
}

export function agent<TOut = string>(config: AgentConfig): Agent<string, TOut> {
  return new Agent<string, TOut>(config);
}

const AgentConfigFileSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  tools: z.array(z.string()).nullable().optional(),
  disallowedTools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.record(z.unknown()).optional(),
  contextStrategy: z.enum(["compaction", "reset"]).optional(),
  permissionMode: z.string().optional(),
  continueSession: z.boolean().optional(),
  model: z.string().optional(),
  costPerMTokens: z.object({ input: z.number(), output: z.number() }).optional(),
  timeout: z.number().optional(),
});

export async function loadAgent(name: string): Promise<Agent> {
  const home = circeHome();
  const agentPath = `${home}/agents/${name}.json`;
  const { readFileSync } = await import("node:fs");

  let raw: string;
  try {
    raw = readFileSync(agentPath, "utf-8");
  } catch {
    throw new Error(`Agent file not found: ${agentPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in agent file: ${agentPath}`);
  }

  const result = AgentConfigFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid agent config in ${agentPath}: ${issues}`);
  }

  return new Agent(result.data);
}
