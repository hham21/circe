// Skill system: prompt injection + on-demand loading
import { BaseAgent } from "../src/agent.js";
import { SkillRegistry } from "../src/tools/skills.js";
import { setSkillRegistry } from "../src/context.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const localSkillsDir = join(projectRoot, ".circe", "skills");
const globalSkillsDir = join(process.env.HOME!, ".circe", "skills");

// Create a sample skill in project-local .circe/skills/
const reviewDir = join(localSkillsDir, "code-review");
mkdirSync(reviewDir, { recursive: true });
writeFileSync(
  join(reviewDir, "SKILL.md"),
  `---
name: code-review
description: Review code for bugs, security issues, and improvements
---

# Code Review Methodology

1. Read all files in the working directory
2. Check for common issues:
   - Unused variables or imports
   - Missing error handling
   - Security vulnerabilities
   - Performance issues
3. Score each category (1-10):
   - correctness: Logic errors, edge cases
   - security: Vulnerabilities, input validation
   - quality: Naming, structure, readability
4. Output a summary with specific line references and suggestions
`
);

const registry = new SkillRegistry([localSkillsDir, globalSkillsDir]);
setSkillRegistry(registry);

try {
  // 1. Registry discovers skills
  console.log("=== Skill Registry ===");
  const skills = registry.listSkills();
  console.log(`Found ${skills.length} skill(s):`);
  for (const s of skills) {
    console.log(`  - ${s.name}: ${s.description}`);
  }

  // 2. Validation
  console.log("\n=== Validation ===");
  registry.validateSkills(["code-review"]);
  console.log("validateSkills(['code-review']): PASS");

  try {
    registry.validateSkills(["nonexistent"]);
  } catch (e: any) {
    console.log(`validateSkills(['nonexistent']): correctly threw`);
  }

  // 3. Prompt injection
  console.log("\n=== Prompt Injection ===");
  const agent = new BaseAgent({
    name: "reviewer",
    prompt: "You are a code reviewer.",
    skills: ["code-review"],
  });
  const prompt = agent.buildSystemPrompt();
  console.log("Skill summary injected:", prompt.includes("code-review"));
  console.log("use_skill hint injected:", prompt.includes("use_skill"));

  // 4. Agent run with on-demand skill loading
  console.log("\n=== Agent Run with Skill ===");
  const result = await agent.run(
    "List the skills available to you and briefly describe what the code-review skill does. Use use_skill to load it first. Reply in 2-3 sentences."
  );
  console.log("Result:", result);
} finally {
  setSkillRegistry(null);
  rmSync(reviewDir, { recursive: true, force: true });
}
