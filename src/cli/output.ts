import chalk from "chalk";
import { appendFileSync, writeFileSync } from "node:fs";

export type LogLevel = "info" | "debug" | "trace";

export type Kind = "start" | "call" | "result" | "done" | "thinking" | "info" | "final";

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
const KIND_LABEL_WIDTH = 11;
const RESULT_PREVIEW_MAX_LENGTH = 80;
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

function formatLocalTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function summarizeStructured(result: string): string | null {
  if (result.startsWith("ERROR:")) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(result);
  } catch {
    return null;
  }
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return null;

  const record = obj as Record<string, unknown>;
  const parts: string[] = [];

  if ("passed" in record && typeof record.passed === "boolean") {
    parts.push(`passed=${record.passed}`);
  }
  const scores = record.scores;
  if (scores && typeof scores === "object" && !Array.isArray(scores)) {
    const scoreRecord = scores as Record<string, unknown>;
    if ("quality" in scoreRecord && typeof scoreRecord.quality !== "object") {
      parts.push(`quality=${scoreRecord.quality}`);
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "passed" || key === "scores") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}=${value}`);
      break;
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export class OutputFormatter {
  readonly logLevel: LogLevel | undefined;
  private logPath: string | null = null;
  private logIOErrorReported = false;

  constructor(logLevel?: LogLevel) {
    this.logLevel = logLevel;
  }

  setLogFile(path: string): void {
    this.logPath = path;
    this.logIOErrorReported = false;
    writeFileSync(path, "");
  }

  close(): void {
    this.logPath = null;
  }

  agentStart(name: string, _description: string): void {
    const terminalLine = this.formatLine(formatLocalTime(), name, "start", "");
    const fileLine = this.formatLine(timestamp(), name, "start", "", undefined, { color: false });
    console.log(terminalLine);
    this.writeLog(fileLine);
  }

  agentDone(
    name: string,
    result = "",
    tokens?: [number, number] | null,
    cost?: number | null,
  ): void {
    const rawResult = result ?? "";
    const preview = summarizeStructured(rawResult) ?? this.buildResultPreview(rawResult);
    const meta = this.buildMetaParts(tokens, cost);
    const metaPlain = meta.plain.join("  ");
    const metaColored = meta.colored.join("  ");

    const terminalMain = this.formatLine(
      formatLocalTime(),
      name,
      "done",
      chalk.white(preview),
      metaColored || undefined,
    );
    const fileMain = this.formatLine(timestamp(), name, "done", preview, metaPlain || undefined, {
      color: false,
    });
    console.log(terminalMain);
    this.writeLog(fileMain);

    if (this.isEnabled("trace") && rawResult) {
      const oneLine = compactWhitespace(rawResult);
      const terminalExtra = this.formatLine(formatLocalTime(), name, "done", chalk.dim(oneLine));
      const fileExtra = this.formatLine(timestamp(), name, "done", oneLine, undefined, {
        color: false,
      });
      console.log(terminalExtra);
      this.writeLog(fileExtra);
    }
  }

  logInfo(message: string): void {
    const terminalLine = this.formatLine(formatLocalTime(), null, "info", chalk.gray(message));
    const fileLine = this.formatLine(timestamp(), null, "info", message, undefined, {
      color: false,
    });
    console.log(`\n${terminalLine}`);
    this.writeLog(fileLine);
  }

  logToolCall(agentName: string, toolName: string, input: Record<string, unknown>): void {
    if (!this.isEnabled("info")) return;

    let content: string;
    if (this.isEnabled("debug")) {
      const args = compactWhitespace(JSON.stringify(input));
      content = `${toolName} ${args}`;
    } else {
      content = this.summarizeToolInput(toolName, input);
    }

    const terminalLine = this.formatLine(
      formatLocalTime(),
      agentName,
      "call",
      chalk.dim(content),
    );
    const fileLine = this.formatLine(timestamp(), agentName, "call", content, undefined, {
      color: false,
    });
    console.log(terminalLine);
    this.writeLog(fileLine);
  }

  logToolResult(agentName: string, toolName: string, result: string): void {
    if (!this.isEnabled("debug")) return;

    let compactResult: string;
    if (toolName === "StructuredOutput") {
      compactResult = "ok";
    } else if (this.isEnabled("trace")) {
      compactResult = compactWhitespace(result);
    } else {
      compactResult = truncate(compactWhitespace(result), TOOL_RESULT_MAX_LENGTH, "...");
    }

    const content = `${toolName} ${compactResult}`;
    const terminalLine = this.formatLine(
      formatLocalTime(),
      agentName,
      "result",
      chalk.dim(content),
    );
    const fileLine = this.formatLine(timestamp(), agentName, "result", content, undefined, {
      color: false,
    });
    console.log(terminalLine);
    this.writeLog(fileLine);
  }

  logThinking(agentName: string, text: string): void {
    if (!this.isEnabled("trace")) return;

    const terminalLine = this.formatLine(
      formatLocalTime(),
      agentName,
      "thinking",
      chalk.dim(text),
    );
    const fileContent = compactWhitespace(text);
    const fileLine = this.formatLine(timestamp(), agentName, "thinking", fileContent, undefined, {
      color: false,
    });
    console.log(terminalLine);
    this.writeLog(fileLine);
  }

  logResult(result: string): void {
    const resultCompact = compactWhitespace(result);
    console.log(`\n${chalk.dim(formatLocalTime())} ${chalk.green(`Result: ${result}`)}`);
    const fileLine = this.formatLine(timestamp(), null, "final", resultCompact, undefined, {
      color: false,
    });
    this.writeLog(fileLine);
  }

  finalSummary(outputDir: string, totalDuration: number): void {
    const duration = this.formatDuration(totalDuration);
    console.log(chalk.bold(`\nOutput: ${outputDir}`));
    console.log(chalk.bold(`Duration: ${duration}`));
    const ts = timestamp();
    this.writeLog(
      this.formatLine(ts, null, "info", `Output: ${outputDir}`, undefined, { color: false }),
    );
    this.writeLog(
      this.formatLine(ts, null, "info", `Duration: ${duration}`, undefined, { color: false }),
    );
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
    return truncate(compactWhitespace(result), RESULT_PREVIEW_MAX_LENGTH, "…");
  }

  private buildMetaParts(
    tokens?: [number, number] | null,
    cost?: number | null,
  ): { plain: string[]; colored: string[] } {
    const plain: string[] = [];
    const colored: string[] = [];
    if (tokens) {
      const tokenStr = `${formatTokenCount(tokens[0])}/${formatTokenCount(tokens[1])}`;
      plain.push(tokenStr);
      colored.push(chalk.gray(tokenStr));
    }
    if (cost != null) {
      const costStr = `$${cost.toFixed(4)}`;
      plain.push(costStr);
      colored.push(chalk.yellow(costStr));
    }
    return { plain, colored };
  }

  private agentLabel(name: string, color = true): string {
    const padded = `[${name}]`.padEnd(AGENT_LABEL_WIDTH);
    if (!color) return padded;
    const colorFn = AGENT_COLORS[name] ?? AGENT_COLORS.default;
    return colorFn(padded);
  }

  private kindLabel(kind: Kind, color = true): string {
    const padded = `[${kind}]`.padEnd(KIND_LABEL_WIDTH);
    return color ? chalk.dim(padded) : padded;
  }

  private formatLine(
    ts: string,
    agentName: string | null,
    kind: Kind,
    content: string,
    meta?: string,
    opts: { color?: boolean } = { color: true },
  ): string {
    const color = opts.color !== false;
    const tsStr = color ? chalk.dim(ts) : ts;
    const labelPart = agentName ? `${this.agentLabel(agentName, color)} ` : "";
    const kindStr = this.kindLabel(kind, color);
    const metaSuffix = meta ? `  ${meta}` : "";
    return `${tsStr} ${labelPart}${kindStr} ${content}${metaSuffix}`;
  }

  private writeLog(line: string): void {
    if (!this.logPath) return;
    try {
      appendFileSync(this.logPath, `${line}\n`);
    } catch (err) {
      if (!this.logIOErrorReported) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[circe] Log file write failed (${message}). Further log writes will be silenced.\n`,
        );
        this.logIOErrorReported = true;
      }
    }
  }
}
