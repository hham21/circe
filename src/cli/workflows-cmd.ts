import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

function workflowsDir(): string {
  const home = process.env.CIRCE_HOME ?? join(process.env.HOME!, ".circe");
  const dir = join(home, "workflows");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export const workflowsCommand = new Command("workflows").description("Manage workflows");

workflowsCommand
  .command("create <name>")
  .requiredOption("--agents <agents>", "Comma-separated agent names")
  .option("--from <preset>", "Base preset")
  .action((name: string, opts: any) => {
    const data = {
      name,
      agents: opts.agents.split(",").map((a: string) => a.trim()),
      basedOn: opts.from ?? null,
    };
    writeFileSync(join(workflowsDir(), `${name}.json`), JSON.stringify(data, null, 2));
    console.log(`Workflow '${name}' created.`);
  });

workflowsCommand
  .command("list")
  .action(() => {
    const dir = workflowsDir();
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
      console.log("No workflows found.");
      return;
    }
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      console.log(`  ${data.name}`);
    }
  });

workflowsCommand
  .command("info <name>")
  .action((name: string) => {
    const path = join(workflowsDir(), `${name}.json`);
    if (!existsSync(path)) {
      console.error(`Workflow '${name}' not found.`);
      process.exit(1);
    }
    const data = JSON.parse(readFileSync(path, "utf-8"));
    console.log(JSON.stringify(data, null, 2));
  });

workflowsCommand
  .command("delete <name>")
  .action((name: string) => {
    const path = join(workflowsDir(), `${name}.json`);
    if (!existsSync(path)) {
      console.error(`Workflow '${name}' not found.`);
      process.exit(1);
    }
    unlinkSync(path);
    console.log(`Workflow '${name}' deleted.`);
  });
