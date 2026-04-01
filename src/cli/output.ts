import chalk from "chalk";
import { appendFileSync, writeFileSync } from "node:fs";

const COLORS: Record<string, (s: string) => string> = {
  planner: chalk.cyan,
  generator: chalk.yellow,
  evaluator: chalk.red,
  writer: chalk.green,
  critic: chalk.magenta,
  proposer: chalk.cyan,
  reviewer: chalk.red,
  default: chalk.blue,
};

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
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

    const oneLine = result.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    const preview = oneLine.length > 50 ? oneLine.slice(0, 50) + "…" : oneLine;

    const meta: string[] = [];
    if (tokens) meta.push(chalk.gray(`${formatTokens(tokens[0])}/${formatTokens(tokens[1])}`));
    if (cost != null) meta.push(chalk.yellow(`$${cost.toFixed(4)}`));

    console.log(`${label}  ${chalk.white(preview)}  ${meta.join("  ")}`);
    this.writeLog(`[${name}] ${oneLine} | ${tokens?.[0]}/${tokens?.[1]} | $${cost?.toFixed(4)}`);
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

  logRoundResult(result: unknown): void {
    if (result == null || typeof result !== "object") return;
    const r = result as Record<string, unknown>;

    const parts: string[] = [];
    if ("passed" in r) {
      parts.push(r.passed ? chalk.green("PASS") : chalk.red("FAIL"));
    }
    if ("accepted" in r) {
      parts.push(r.accepted ? chalk.green("ACCEPTED") : chalk.red("REJECTED"));
    }
    if ("scores" in r && typeof r.scores === "object" && r.scores) {
      const scores = Object.entries(r.scores as Record<string, number>)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      parts.push(chalk.gray(scores));
    }
    if ("feedback" in r && Array.isArray(r.feedback) && r.feedback.length > 0) {
      const first = String(r.feedback[0]);
      const preview = first.length > 60 ? first.slice(0, 60) + "..." : first;
      parts.push(chalk.dim(preview));
    }

    if (parts.length > 0) {
      console.log(`  → ${parts.join("  ")}`);
      this.writeLog(`  → ${parts.join("  ")}`);
    }
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

  private agentLabel(name: string): string {
    const colorFn = COLORS[name] ?? COLORS.default;
    return colorFn(`[${name}]`.padEnd(14));
  }

  private writeLog(text: string): void {
    if (this.logPath) {
      appendFileSync(this.logPath, text + "\n");
    }
  }
}
