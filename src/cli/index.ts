#!/usr/bin/env node
import { Command } from "commander";
import { executeWorkflow } from "./run.js";
import { skillsCommand } from "./skills-cmd.js";

interface RunOptions {
  input: string;
  output?: string;
  preset?: boolean;
  maxRounds?: number;
  verbose?: boolean;
}

const BUILT_IN_PRESETS: [name: string, description: string][] = [
  ["fullstack", "Planner + Generator/Evaluator loop for full-stack apps"],
  ["frontend-design", "Generator/Evaluator loop for frontend design iteration"],
];

const PRESET_NAME_COLUMN_WIDTH = 20;

const program = new Command();

program
  .name("circe")
  .description("GAN-style multi-agent framework for application generation")
  .version("0.1.0");

program
  .command("run <workflow>")
  .description("Run a workflow or preset")
  .requiredOption("-i, --input <input>", "User input or path to spec file")
  .option("-o, --output <dir>", "Output directory")
  .option("--preset", "Use a built-in preset")
  .option("-r, --max-rounds <n>", "Maximum rounds", parseInt)
  .option("-v, --verbose", "Verbose output")
  .action(async (workflow: string, opts: RunOptions) => {
    await executeWorkflow({
      workflow,
      input: opts.input,
      outputDir: opts.output,
      preset: opts.preset,
      maxRounds: opts.maxRounds,
      verbose: opts.verbose,
    });
  });

program
  .command("presets")
  .description("List available presets")
  .action(() => {
    for (const [name, desc] of BUILT_IN_PRESETS) {
      console.log(`  ${name.padEnd(PRESET_NAME_COLUMN_WIDTH)} ${desc}`);
    }
  });

program.addCommand(skillsCommand);

export { program };

program.parse();
