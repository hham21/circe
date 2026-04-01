import { BaseAgent } from "../agent.js";
import { QAReportSchema } from "../handoff.js";
import { Pipeline } from "../orchestration/pipeline.js";
import { Loop } from "../orchestration/loop.js";
import { Contract } from "../orchestration/contract.js";

interface FullstackOptions {
  model?: string;
  maxRounds?: number;
  evaluatorCriteria?: Record<string, number>;
  passThreshold?: number;
}

function isPassed(result: unknown): boolean {
  if (result != null && typeof result === "object" && "passed" in result) {
    return (result as any).passed === true;
  }
  return false;
}

export function fullstackApp(options?: FullstackOptions): Pipeline {
  const maxRounds = options?.maxRounds ?? 3;
  const passThreshold = options?.passThreshold ?? 7;
  const criteria = options?.evaluatorCriteria ?? {
    design_quality: 0.3,
    functionality: 0.4,
    code_quality: 0.2,
    originality: 0.1,
  };

  const criteriaStr = Object.entries(criteria)
    .map(([k, v]) => `${k} (weight ${v})`)
    .join(", ");

  const planner = new BaseAgent({
    name: "planner",
    prompt: `You are a senior product designer. Given a user's app idea, expand it into a detailed product specification.

Output a JSON object with this structure:
{
  "appName": "kebab-case-name",
  "features": [{"name": "...", "description": "..."}],
  "techStack": {"frontend": "React + Vite", "backend": "FastAPI", "database": "SQLite"},
  "designDirection": "..."
}

Be ambitious — include 10-15 features. Think about AI integration opportunities.
The tech stack is always: React + Vite (port 5173) frontend, FastAPI (port 8000) backend, SQLite database.`,
  });

  const proposer = new BaseAgent({
    name: "generator",
    prompt: `You are a senior full-stack engineer. Given a product spec, propose a detailed build contract.
Include: feature implementation order, testable acceptance criteria for each feature, architecture decisions.
Output as a structured proposal that a reviewer can evaluate.`,
  });

  const reviewer = new BaseAgent({
    name: "evaluator",
    prompt: `You are a senior QA engineer reviewing a build contract.
Check that every feature has testable acceptance criteria.
Check that the architecture is sound.
Output JSON: {"accepted": true/false, "feedback": "..."}`,
  });

  const generator = new BaseAgent({
    name: "generator",
    prompt: `You are a senior full-stack engineer. Build the application according to the spec.

Tech stack: React + Vite (port 5173), FastAPI (port 8000), SQLite.

If this is the first round, you receive a ProductSpec — build from scratch.
If this is a subsequent round, you receive a QAReport with feedback — fix the issues.

Always:
- Create all files in the current working directory
- Start dev servers (Vite on 5173, FastAPI on 8000)
- Write progress to _status.md
- Use relative paths only`,
    continueSession: true,
  });

  const evaluator = new BaseAgent({
    name: "evaluator",
    prompt: `You are a strict QA engineer. Test the running application thoroughly.

The app should be running at http://localhost:5173 (frontend) and http://localhost:8000 (backend).

Test by:
1. Making API calls with curl/fetch
2. Using Playwright MCP to navigate and interact with the UI
3. Checking for errors in console and network

Score each criterion (1-10): ${criteriaStr}
Fail if ANY criterion is below ${passThreshold}/10.

Output JSON:
{
  "passed": true/false,
  "scores": {"criterion": score, ...},
  "feedback": ["specific issue 1", "specific issue 2"]
}`,
    tools: ["Read", "Bash", "Glob", "Grep"],
    mcpServers: {
      playwright: { command: "npx", args: ["@playwright/mcp@latest"] },
    },
    outputSchema: QAReportSchema,
  });

  const contract = new Contract(proposer, reviewer, { maxRounds: 2 });
  const buildLoop = new Loop(generator, evaluator, { maxRounds, stopWhen: isPassed });

  return new Pipeline(planner, contract, buildLoop);
}
