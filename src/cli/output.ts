import chalk from "chalk";
import { appendFileSync, writeFileSync } from "node:fs";

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
const TOKEN_COMPACT_THRESHOLD = 1000;

function formatTokenCount(n: number): string {
  if (n >= TOKEN_COMPACT_THRESHOLD) return `${(n / TOKEN_COMPACT_THRESHOLD).toFixed(1)}k`;
  return String(n);
}

function truncate(text: string, maxLength: number, ellipsis: string): string {
  return text.length > maxLength ? text.slice(0, maxLength) + ellipsis : text;
}

export class OutputFormatter {
  private verbose: boolean;
  private logPath: string | null = null;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  setLogFile(path: string): void {
    this.logPath = path;
    writeFileSync(path, "");
  }

  close(): void {
    this.logPath = null;
  }

  agentStart(name: string, _description: string): void {
    this.writeLog(`[${name}] start`);
  }

  agentDone(
    name: string,
    result = "",
    tokens?: [number, number] | null,
    cost?: number | null,
  ): void {
    const label = this.agentLabel(name);
    const preview = this.buildResultPreview(result);
    const metaParts = this.buildMetaParts(tokens, cost);

    console.log(`${label}  ${chalk.white(preview)}  ${metaParts.join("  ")}`);
    this.writeLog(`[${name}] ${preview} | ${tokens?.[0]}/${tokens?.[1]} | $${cost?.toFixed(4)}`);
  }

  logInfo(message: string): void {
    console.log(chalk.gray(`\n── ${message} ──`));
    this.writeLog(`[info] ${message}`);
  }

  logActivity(agentName: string, message: string): void {
    if (!this.verbose) return;
    const label = this.agentLabel(agentName);
    console.log(chalk.dim(`${label}  ${message}`));
    this.writeLog(`[${agentName}] ${message}`);
  }

  logResult(result: string): void {
    console.log(chalk.green(`\nResult: ${result}`));
    this.writeLog(`[result] ${result}`);
  }

  finalSummary(outputDir: string, totalDuration: number): void {
    const duration = this.formatDuration(totalDuration);
    console.log(chalk.bold(`\nOutput: ${outputDir}`));
    console.log(chalk.bold(`Duration: ${duration}`));
    this.writeLog(`\nOutput: ${outputDir}\nDuration: ${duration}`);
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(" ");
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

  private writeLog(text: string): void {
    if (this.logPath) {
      appendFileSync(this.logPath, text + "\n");
    }
  }
}
