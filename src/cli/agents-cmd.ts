import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

function agentsDir(): string {
  const home = process.env.CIRCE_HOME ?? join(process.env.HOME!, ".circe");
  const dir = join(home, "agents");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export const agentsCommand = new Command("agents").description("Manage agents");

agentsCommand
  .command("create <name>")
  .requiredOption("--prompt <prompt>", "Agent system prompt")
  .option("--tools <tools>", "Comma-separated tools")
  .option("--skills <skills>", "Comma-separated skills")
  .action((name: string, opts: any) => {
    const data = {
      name,
      prompt: opts.prompt,
      tools: opts.tools?.split(",").map((t: string) => t.trim()) ?? null,
      skills: opts.skills?.split(",").map((s: string) => s.trim()) ?? [],
    };
    writeFileSync(join(agentsDir(), `${name}.json`), JSON.stringify(data, null, 2));
    console.log(`Agent '${name}' created.`);
  });

agentsCommand
  .command("list")
  .action(() => {
    const dir = agentsDir();
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
      console.log("No agents found.");
      return;
    }
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      console.log(`  ${data.name}`);
    }
  });

agentsCommand
  .command("info <name>")
  .action((name: string) => {
    const path = join(agentsDir(), `${name}.json`);
    if (!existsSync(path)) {
      console.error(`Agent '${name}' not found.`);
      process.exit(1);
    }
    const data = JSON.parse(readFileSync(path, "utf-8"));
    console.log(JSON.stringify(data, null, 2));
  });

agentsCommand
  .command("delete <name>")
  .action((name: string) => {
    const path = join(agentsDir(), `${name}.json`);
    if (!existsSync(path)) {
      console.error(`Agent '${name}' not found.`);
      process.exit(1);
    }
    unlinkSync(path);
    console.log(`Agent '${name}' deleted.`);
  });
