// Example 13: Skills (Prompt Injection & On-Demand Loading)
// Primitives: SkillRegistry, BaseAgent
// Difficulty: Advanced
// Estimated cost: ~$0.09
//
// Create a SKILL.md, register it, inject into agent prompt, agent loads full content on demand.
// The MCP server is created internally by BaseAgent — no external setup required.
// Self-contained: creates skill dir, runs agent, cleans up.
// Skills enhance any agent — combine with any primitive above.

import { BaseAgent, SkillRegistry, setSkillRegistry } from "../src/index.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Create a temporary skill directory with a sample skill
const skillsDir = join(tmpdir(), `circe-skills-${Date.now()}`);
const reviewDir = join(skillsDir, "code-review");
mkdirSync(reviewDir, { recursive: true });
writeFileSync(
  join(reviewDir, "SKILL.md"),
  `---
name: code-review
description: Review code for bugs, security issues, and improvements
---

# Code Review Methodology

1. Read the code carefully
2. Check for common issues:
   - Unused variables or imports
   - Missing error handling
   - Security vulnerabilities (injection, auth bypass)
   - Performance issues (N+1 queries, memory leaks)
3. Score each category (1-10):
   - correctness: Logic errors, edge cases
   - security: Vulnerabilities, input validation
   - quality: Naming, structure, readability
4. Output a summary with specific line references
`,
);

const registry = new SkillRegistry([skillsDir]);
setSkillRegistry(registry);

try {
  // 1. Show discovered skills
  console.log("=== Example 13: Skills ===\n");
  console.log("--- Skill Discovery ---");
  const skills = registry.listSkills();
  console.log(`Found ${skills.length} skill(s):`);
  for (const s of skills) {
    console.log(`  - ${s.name}: ${s.description}`);
  }

  // 2. Show prompt injection
  console.log("\n--- Prompt Injection ---");
  const agent = new BaseAgent({
    name: "reviewer",
    prompt: "You are a code reviewer.",
    skills: ["code-review"],
    disallowedTools: ["Bash", "Read", "Write", "Edit"],
  });
  const prompt = agent.buildSystemPrompt();
  console.log("Skill summary in prompt:", prompt.includes("code-review"));
  console.log("use_skill tool hint:", prompt.includes("use_skill"));

  // 3. Run agent with skill
  console.log("\n--- Agent Run ---");
  const result = await agent.run(
    "List the skills available to you, then use use_skill to load code-review. Describe what the skill teaches in 2 sentences.",
  );
  console.log("Result:", result);

  console.log("\n--- Metrics ---");
  const m = agent.lastMetrics!;
  console.log(`Tokens: ${m.inputTokens} in / ${m.outputTokens} out`);
  console.log(`Cost: $${m.cost.toFixed(4)}`);
} finally {
  setSkillRegistry(null);
  rmSync(skillsDir, { recursive: true, force: true });
}
