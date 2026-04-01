import { BaseAgent } from "../agent.js";
import { QAReportSchema } from "../handoff.js";
import { Pipeline } from "../orchestration/pipeline.js";
import { Loop } from "../orchestration/loop.js";

interface FrontendDesignOptions {
  model?: string;
  iterations?: number;
  passThreshold?: number;
}

function isPassed(result: unknown): boolean {
  if (result != null && typeof result === "object" && "passed" in result) {
    return (result as any).passed === true;
  }
  return false;
}

export function frontendDesign(options?: FrontendDesignOptions): Pipeline {
  const iterations = options?.iterations ?? 10;
  const passThreshold = options?.passThreshold ?? 9.5;

  const planner = new BaseAgent({
    name: "planner",
    prompt: `You are a world-class design director. Given a design brief, create a detailed design specification.

Include:
- Color palette (specific hex codes)
- Typography (Google Fonts choices, scale)
- Spatial composition and layout strategy
- Motion and interaction specs
- Visual features and unique design elements
- Image strategy: list specific real images to use with Wikimedia Commons URLs or other public domain sources

Anti-patterns to avoid: purple gradients, generic hero sections, cookie-cutter card layouts, placeholder gradients instead of real images.

Output a detailed design brief as structured text.`,
  });

  const generator = new BaseAgent({
    name: "generator",
    prompt: `You are an elite frontend craftsperson. Build pure HTML/CSS/JS (no frameworks).

Rules:
- Create index.html in the working directory
- Commit each round to git
- If _scores.md exists, read it to track progress. If it doesn't exist, this is the first round — just build.
- If scores plateau, pivot your aesthetic approach
- If scores drop, git checkout to restore the best version
- Do NOT start a web server. The evaluator handles that.
- Do NOT wait for scores or poll for files. Just build and finish.

Priority order:
1. Fix any bugs tagged CRITICAL or BUG in _scores.md BEFORE adding new features
2. Address specific feedback items from the evaluator
3. Add new features or improvements

Images:
- Download real images using curl and save to an img/ directory in the working directory
- Use public domain sources: Wikimedia Commons, Met Museum Open Access, Rijksmuseum API
- Example: curl -sL -o img/painting.jpg "https://upload.wikimedia.org/wikipedia/commons/thumb/..."
- NEVER use external URLs in <img src> — always reference local files (e.g., src="img/painting.jpg")
- NEVER substitute real images with SVG shapes or gradient placeholders

Target: ALL criteria must score ${passThreshold}/10 or higher.`,
  });

  const evaluator = new BaseAgent({
    name: "evaluator",
    prompt: `You are a ruthless design critic. Load the design-critique skill via use_skill("design-critique") for detailed methodology, anti-patterns, and scoring guide.

First, kill any existing serve process and start fresh:
  pkill -f "serve -l 8080" 2>/dev/null; sleep 1; npx serve -l 8080 . &
Then wait 3 seconds and evaluate the design at http://localhost:8080.

Use Playwright MCP to take screenshots, test interactions, and check responsiveness.
Save screenshots to ./screenshots/round-N/.

Score each criterion (1-10):
- design_quality (weight 0.35): Coherent whole, distinct identity, not generic
- originality (weight 0.35): Custom creative choices, unique personality
- craft (weight 0.15): Typography precision, spacing consistency, color harmony
- functionality (weight 0.15): Usability, findability, interactions work

A generic-looking site is a 5-6, not a 7-8. Score honestly.
Evaluate absolute visual quality, not spec compliance. Judge as if seeing the site for the first time — do NOT read _scores.md or reference previous rounds.
Pass only if ALL criteria >= ${passThreshold}/10.
Write scores to ./_scores.md after evaluation (for the generator to read, not for you).

When giving feedback:
- Tag critical bugs as "CRITICAL BUG:"
- Be specific: exact elements, colors, sizes, font weights
- Suggest concrete fixes, not vague directions

Output JSON:
{
  "passed": true/false,
  "scores": {"design_quality": N, "originality": N, "craft": N, "functionality": N},
  "feedback": ["specific feedback 1", ...]
}`,
    skills: ["design-critique"],
    tools: ["Read", "Write", "Bash", "Glob", "Grep"],
    mcpServers: {
      playwright: { command: "npx", args: ["@playwright/mcp@latest"] },
    },
    outputSchema: QAReportSchema,
  });

  const designLoop = new Loop(generator, evaluator, {
    maxRounds: iterations,
    stopWhen: isPassed,
  });

  return new Pipeline(planner, designLoop);
}
