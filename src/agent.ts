import { query, createSdkMcpServer, tool as sdkTool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ZodSchema } from "zod";
import { getFormatter, getWorkDir, getSkillRegistry } from "./context.js";
import type { Runnable } from "./types.js";

export interface AgentConfig {
  name: string;
  prompt: string;
  tools?: string[] | null;
  skills?: string[];
  mcpServers?: Record<string, unknown>;
  contextStrategy?: "compaction" | "reset";
  permissionMode?: string;
  continueSession?: boolean;
  inputSchema?: ZodSchema;
  outputSchema?: ZodSchema;
}

interface ResultMetrics {
  resultText: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
}

const INPUT_COST_PER_M = 15;
const OUTPUT_COST_PER_M = 75;

export class BaseAgent implements Runnable {
  name: string;
  prompt: string;
  tools: string[] | null;
  skills: string[];
  mcpServers: Record<string, unknown>;
  contextStrategy: "compaction" | "reset";
  permissionMode: string;
  continueSession: boolean;
  inputSchema: ZodSchema | null;
  outputSchema: ZodSchema | null;
  private sessionId: string | null = null;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.prompt = config.prompt;
    this.tools = config.tools ?? null;
    this.skills = config.skills ?? [];
    this.mcpServers = config.mcpServers ?? {};
    this.contextStrategy = config.contextStrategy ?? "compaction";
    this.permissionMode = config.permissionMode ?? "bypassPermissions";
    this.continueSession = config.continueSession ?? false;
    this.inputSchema = config.inputSchema ?? null;
    this.outputSchema = config.outputSchema ?? null;
  }

  // --- Public API ---

  buildSystemPrompt(): string {
    const registry = getSkillRegistry();
    if (!registry || this.skills.length === 0) return this.prompt;

    const summary = registry.promptSummary(this.skills);
    return summary ? `${this.prompt}\n\n${summary}` : this.prompt;
  }

  async run(input: unknown): Promise<unknown> {
    this.validateInput(input);
    this.validateSkills();

    const formatter = getFormatter() as any;
    const workDir = getWorkDir();
    formatter?.agentStart?.(this.name, this.prompt.slice(0, 60));

    const userPrompt = this.buildUserPrompt(input);
    const options = this.buildSdkOptions(workDir);
    let metrics: ResultMetrics = { resultText: "", cost: 0, inputTokens: 0, outputTokens: 0 };

    try {
      for await (const message of query({ prompt: userPrompt, options })) {
        this.handleSessionInit(message);
        this.handleAssistantMessage(message, formatter);
        if (message.type === "result") {
          metrics = this.extractResultMetrics(message);
        }
      }
    } catch (err: any) {
      const { inputTokens, outputTokens, cost } = metrics;
      formatter?.agentDone?.(this.name, `ERROR: ${err.message}`, [inputTokens, outputTokens], cost);
      throw new Error(`[${this.name}] ${err.message}`);
    }

    return this.finalize(metrics, formatter);
  }

  buildUserPrompt(input: unknown): string {
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
    const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) return codeBlockMatch[1].trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];

    return null;
  }

  parseResult(raw: string): unknown {
    if (!this.outputSchema) return raw;

    const jsonStr = this.extractJson(raw);
    if (!jsonStr) return raw;

    try {
      const parsed = JSON.parse(jsonStr);
      return this.outputSchema.parse(parsed);
    } catch {
      return raw;
    }
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * INPUT_COST_PER_M + outputTokens * OUTPUT_COST_PER_M) / 1_000_000;
  }

  // --- run() helpers ---

  private validateInput(input: unknown): void {
    if (!this.inputSchema) return;

    const result = this.inputSchema.safeParse(input);
    if (result.success) return;

    const received =
      typeof input === "string"
        ? `string: "${input.slice(0, 80)}${input.length > 80 ? "…" : ""}"`
        : typeof input;
    const issues = result.error.issues.map((i: any) => i.message).join(", ");
    throw new Error(`[${this.name}] input validation failed — ${issues} (received ${received})`);
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

    let inputTokens = 0;
    let outputTokens = 0;
    if (message.usage) {
      inputTokens =
        (message.usage.input_tokens ?? 0) +
        (message.usage.cache_creation_input_tokens ?? 0) +
        (message.usage.cache_read_input_tokens ?? 0);
      outputTokens = message.usage.output_tokens ?? 0;
    }

    const cost = message.total_cost_usd ?? this.estimateCost(inputTokens, outputTokens);
    return { resultText, cost, inputTokens, outputTokens };
  }

  private finalize(metrics: ResultMetrics, formatter: any): unknown {
    const { resultText, cost, inputTokens, outputTokens } = metrics;
    const parsed = this.parseResult(resultText);

    if (formatter?.agentDone) {
      const display = typeof parsed === "string" ? this.stripCodeBlock(parsed) : JSON.stringify(parsed);
      formatter.agentDone(this.name, display, [inputTokens, outputTokens], cost);
    }

    return parsed;
  }

  // --- SDK option builders ---

  private buildSdkOptions(workDir: string | null): Record<string, unknown> {
    const options: Record<string, unknown> = {
      systemPrompt: this.buildSystemPrompt(),
      permissionMode: this.permissionMode,
    };

    if (this.permissionMode === "bypassPermissions") {
      options.allowDangerouslySkipPermissions = true;
    }
    if (this.tools) {
      options.allowedTools = this.tools;
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

    const skillServer = this.skills.length > 0 ? this.buildSkillMcpServer() : null;
    if (skillServer) {
      const existingServers = (options.mcpServers as Record<string, unknown>) ?? {};
      options.mcpServers = { ...existingServers, "circe-skills": skillServer };
    }

    return options;
  }

  private buildSkillMcpServer() {
    const registry = getSkillRegistry();
    if (!registry) return null;

    return createSdkMcpServer({
      name: "circe-skills",
      tools: [
        sdkTool(
          "use_skill",
          "Load a skill's full content by name. Use this to access detailed methodology.",
          { name: z.string().describe("Name of the skill to load") },
          async (args) => {
            const content = registry.getSkill(args.name);
            if (content) {
              console.error(`[skill] Loaded: ${args.name}`);
              return { content: [{ type: "text" as const, text: content }] };
            }
            console.error(`[skill] Not found: ${args.name}`);
            return {
              content: [
                { type: "text" as const, text: `Skill '${args.name}' not found. Continuing without it.` },
              ],
            };
          }
        ),
      ],
    });
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

export function agent(config: AgentConfig): BaseAgent {
  return new BaseAgent(config);
}

export async function loadAgent(name: string): Promise<BaseAgent> {
  const home = process.env.CIRCE_HOME ?? `${process.env.HOME}/.circe`;
  const agentPath = `${home}/agents/${name}.json`;
  const { readFileSync } = await import("node:fs");
  const data = JSON.parse(readFileSync(agentPath, "utf-8"));
  return new BaseAgent(data);
}
