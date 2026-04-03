import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW_FILE_EXT = ".json";

interface CreateOptions {
  agents: string;
  from?: string;
}

interface WorkflowData {
  name: string;
  agents: string[];
  basedOn: string | null;
}

function workflowsDir(): string {
  const home = process.env.CIRCE_HOME ?? join(process.env.HOME!, ".circe");
  const dir = join(home, "workflows");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function workflowFilePath(name: string): string {
  return join(workflowsDir(), `${name}${WORKFLOW_FILE_EXT}`);
}

function readWorkflow(filePath: string): WorkflowData {
  return JSON.parse(readFileSync(filePath, "utf-8")) as WorkflowData;
}

function requireWorkflowExists(name: string, filePath: string): void {
  if (!existsSync(filePath)) {
    console.error(`Workflow '${name}' not found.`);
    process.exit(1);
  }
}

export const workflowsCommand = new Command("workflows").description("Manage workflows");

workflowsCommand
  .command("create <name>")
  .requiredOption("--agents <agents>", "Comma-separated agent names")
  .option("--from <preset>", "Base preset")
  .action((name: string, opts: CreateOptions) => {
    const workflow: WorkflowData = {
      name,
      agents: opts.agents.split(",").map((agent) => agent.trim()),
      basedOn: opts.from ?? null,
    };
    writeFileSync(workflowFilePath(name), JSON.stringify(workflow, null, 2));
    console.log(`Workflow '${name}' created.`);
  });

workflowsCommand
  .command("list")
  .action(() => {
    const dir = workflowsDir();
    const workflowFiles = readdirSync(dir).filter((f) => f.endsWith(WORKFLOW_FILE_EXT));
    if (workflowFiles.length === 0) {
      console.log("No workflows found.");
      return;
    }
    for (const file of workflowFiles) {
      const workflow = readWorkflow(join(dir, file));
      console.log(`  ${workflow.name}`);
    }
  });

workflowsCommand
  .command("info <name>")
  .action((name: string) => {
    const filePath = workflowFilePath(name);
    requireWorkflowExists(name, filePath);
    const workflow = readWorkflow(filePath);
    console.log(JSON.stringify(workflow, null, 2));
  });

workflowsCommand
  .command("delete <name>")
  .action((name: string) => {
    const filePath = workflowFilePath(name);
    requireWorkflowExists(name, filePath);
    unlinkSync(filePath);
    console.log(`Workflow '${name}' deleted.`);
  });
