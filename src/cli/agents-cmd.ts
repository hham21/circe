import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { circeHome } from "../utils.js";

const AGENT_FILE_EXTENSION = ".json";

interface CreateAgentOptions {
  prompt: string;
  tools?: string;
  skills?: string;
}

interface AgentData {
  name: string;
  prompt: string;
  tools: string[] | null;
  skills: string[];
}

export const agentsCommand = new Command("agents").description("Manage agents");

agentsCommand
  .command("create <name>")
  .requiredOption("--prompt <prompt>", "Agent system prompt")
  .option("--tools <tools>", "Comma-separated tools")
  .option("--skills <skills>", "Comma-separated skills")
  .action((name: string, opts: CreateAgentOptions) => {
    const agentData = buildAgentData(name, opts);
    saveAgentFile(name, agentData);
    console.log(`Agent '${name}' created.`);
  });

agentsCommand
  .command("list")
  .action(() => {
    const agents = listAgentFiles();
    if (agents.length === 0) {
      console.log("No agents found.");
      return;
    }
    for (const agent of agents) {
      console.log(`  ${agent.name}`);
    }
  });

agentsCommand
  .command("info <name>")
  .action((name: string) => {
    const agent = requireAgent(name);
    console.log(JSON.stringify(agent, null, 2));
  });

agentsCommand
  .command("delete <name>")
  .action((name: string) => {
    requireAgent(name);
    unlinkSync(resolveAgentFilePath(name));
    console.log(`Agent '${name}' deleted.`);
  });

function resolveAgentsDir(): string {
  const dir = join(circeHome(), "agents");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveAgentFilePath(name: string): string {
  return join(resolveAgentsDir(), `${name}${AGENT_FILE_EXTENSION}`);
}

function requireAgent(name: string): AgentData {
  const filePath = resolveAgentFilePath(name);
  if (!existsSync(filePath)) {
    console.error(`Agent '${name}' not found.`);
    process.exit(1);
  }
  return readAgentFile(filePath);
}

function listAgentFiles(): AgentData[] {
  const dir = resolveAgentsDir();
  return readdirSync(dir)
    .filter((file) => file.endsWith(AGENT_FILE_EXTENSION))
    .map((file) => readAgentFile(join(dir, file)));
}

function buildAgentData(name: string, opts: CreateAgentOptions): AgentData {
  return {
    name,
    prompt: opts.prompt,
    tools: opts.tools?.split(",").map((t) => t.trim()) ?? null,
    skills: opts.skills?.split(",").map((s) => s.trim()) ?? [],
  };
}

function saveAgentFile(name: string, data: AgentData): void {
  writeFileSync(resolveAgentFilePath(name), JSON.stringify(data, null, 2));
}

function readAgentFile(filePath: string): AgentData {
  return JSON.parse(readFileSync(filePath, "utf-8")) as AgentData;
}
