import chalk from "chalk";
import { appendFileSync, writeFileSync } from "node:fs";

export type LogLevel = "info" | "debug" | "trace";

const LEVEL_RANK: Record<LogLevel, number> = { info: 1, debug: 2, trace: 3 };

const AGENT_COLORS: Record<string, (s: string) => string> = {
  planner: chalk.cyan,
  generator: chalk.yellow,
  evaluator: chalk.red,
  writer: chalk.green,
  critic: chalk.magenta,
  proposer: chalk.cyan,
  reviewer: chalk.red,
  default: chalk.blue,
};

const AGENT_LABEL_WIDTH = 14;
const RESULT_PREVIEW_MAX_LENGTH = 50;
const TOOL_RESULT_MAX_LENGTH = 500;
const TOKEN_COMPACT_THRESHOLD = 1000;

function formatTokenCount(n: number): string {
  if (n >= TOKEN_COMPACT_THRESHOLD) return `${(n / TOKEN_COMPACT_THRESHOLD).toFixed(1)}k`;
  return String(n);
}

function truncate(text: string, maxLength: number, ellipsis: string): string {
  return text.length > maxLength ? text.slice(0, maxLength) + ellipsis : text;
}

function timestamp(): string {
  return new Date().toISOString();
}

export class OutputFormatter {
  readonly logLevel: LogLevel | undefined;
  private logPath: string | null = null;

  constructor(logLevel?: LogLevel) {
    this.logLevel = logLevel;
  }

  setLogFile(path: string): void {
    this.logPath = path;
    writeFileSync(path, "");
  }

  close(): void {
    this.logPath = null;
  }

  agentStart(name: string, _description: string): void {
    const ts = timestamp();
    const label = this.agentLabel(name);
    console.log(`${chalk.dim(ts)} ${label}  ${chalk.dim("start")}`);
    this.writeLog(`[${name}] start`, ts);
  }

  agentDone(
    name: string,
    result = "",
    tokens?: [number, number] | null,
    cost?: number | null,
  ): void {
    const ts = timestamp();
    const label = this.agentLabel(name);
    const preview = this.buildResultPreview(result);
    const metaParts = this.buildMetaParts(tokens, cost);

    console.log(`${chalk.dim(ts)} ${label}  ${chalk.white(preview)}  ${metaParts.join("  ")}`);
    this.writeLog(`[${name}] ${preview} | ${tokens?.[0]}/${tokens?.[1]} | $${cost?.toFixed(4)}`, ts);
  }

  logInfo(message: string): void {
    const ts = timestamp();
    console.log(chalk.gray(`\n${ts} ── ${message} ──`));
    this.writeLog(`[info] ${message}`, ts);
  }

  logToolCall(agentName: string, toolName: string, input: Record<string, unknown>): void {
    if (!this.isEnabled("info")) return;

    const ts = timestamp();
    const label = this.agentLabel(agentName);

    if (this.isEnabled("debug")) {
      const args = JSON.stringify(input);
      console.log(chalk.dim(`${ts} ${label}  ${toolName} ${args}`));
      this.writeLog(`[${agentName}] ${toolName} ${args}`, ts);
    } else {
      const summary = this.summarizeToolInput(toolName, input);
      console.log(chalk.dim(`${ts} ${label}  ${summary}`));
      this.writeLog(`[${agentName}] ${summary}`, ts);
    }
  }

  logToolResult(agentName: string, toolName: string, result: string): void {
    if (!this.isEnabled("debug")) return;

    const ts = timestamp();
    const label = this.agentLabel(agentName);
    const display = this.isEnabled("trace")
      ? result
      : truncate(result, TOOL_RESULT_MAX_LENGTH, "...");

    console.log(chalk.dim(`${ts} ${label}  <- ${toolName} ${display}`));
    this.writeLog(`[${agentName}] <- ${toolName} ${display}`, ts);
  }

  logThinking(agentName: string, text: string): void {
    if (!this.isEnabled("trace")) return;

    const ts = timestamp();
    const label = this.agentLabel(agentName);
    console.log(chalk.dim(`${ts} ${label}  [thinking] ${text}`));
    this.writeLog(`[${agentName}] [thinking] ${text}`, ts);
  }

  logResult(result: string): void {
    const ts = timestamp();
    console.log(chalk.green(`\n${ts} Result: ${result}`));
    this.writeLog(`[result] ${result}`, ts);
  }

  finalSummary(outputDir: string, totalDuration: number): void {
    const duration = this.formatDuration(totalDuration);
    console.log(chalk.bold(`\nOutput: ${outputDir}`));
    console.log(chalk.bold(`Duration: ${duration}`));
    this.writeLog(`\nOutput: ${outputDir}\nDuration: ${duration}`);
  }

  formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(" ");
  }

  private isEnabled(level: LogLevel): boolean {
    if (!this.logLevel) return false;
    return LEVEL_RANK[this.logLevel] >= LEVEL_RANK[level];
  }

  private summarizeToolInput(toolName: string, input: Record<string, unknown>): string {
    if (toolName === "Bash" && input.command) return `$ ${input.command}`;
    if (toolName === "Read" && input.file_path) return `Read ${input.file_path}`;
    if (toolName === "Write" && input.file_path) return `Write ${input.file_path}`;
    if (toolName === "Edit" && input.file_path) return `Edit ${input.file_path}`;
    return toolName;
  }

  private buildResultPreview(result: string): string {
    const singleLine = result.replace(/\s+/g, " ").trim();
    return truncate(singleLine, RESULT_PREVIEW_MAX_LENGTH, "…");
  }

  private buildMetaParts(tokens?: [number, number] | null, cost?: number | null): string[] {
    const parts: string[] = [];
    if (tokens) {
      parts.push(chalk.gray(`${formatTokenCount(tokens[0])}/${formatTokenCount(tokens[1])}`));
    }
    if (cost != null) {
      parts.push(chalk.yellow(`$${cost.toFixed(4)}`));
    }
    return parts;
  }

  private agentLabel(name: string): string {
    const colorFn = AGENT_COLORS[name] ?? AGENT_COLORS.default;
    return colorFn(`[${name}]`.padEnd(AGENT_LABEL_WIDTH));
  }

  private writeLog(text: string, ts?: string): void {
    if (this.logPath) {
      appendFileSync(this.logPath, `${ts ?? timestamp()} ${text}\n`);
    }
  }
}
