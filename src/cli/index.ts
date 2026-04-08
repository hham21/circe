#!/usr/bin/env node
import { Command } from "commander";
import { executeWorkflow } from "./run.js";
import { skillsCommand } from "./skills-cmd.js";

interface RunOptions {
  input: string;
  output?: string;
  verbose?: boolean;
}

const program = new Command();

program
  .name("circe")
  .description("GAN-style multi-agent framework for application generation")
  .version("0.4.0");

program
  .command("run <workflow>")
  .description("Run a workflow file")
  .requiredOption("-i, --input <input>", "User input or path to spec file")
  .option("-o, --output <dir>", "Output directory")
  .option("-v, --verbose", "Verbose output")
  .action(async (workflow: string, options: RunOptions) => {
    await executeWorkflow({
      workflow,
      input: options.input,
      outputDir: options.output,
      verbose: options.verbose,
    });
  });

program.addCommand(skillsCommand);

program.parse();

export { program };
