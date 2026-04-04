import { Agent } from "../agent.js";
import { QAReportSchema, hasQAPassed } from "../handoff.js";
import { Loop } from "../orchestration/loop.js";
import { PLAYWRIGHT_MCP_SERVER } from "../utils.js";

const DEFAULT_ITERATIONS = 10;
const DEFAULT_PASS_THRESHOLD = 9.5;

interface FrontendDesignOptions {
  model?: string;
  iterations?: number;
  passThreshold?: number;
}

export function frontendDesign(options?: FrontendDesignOptions): Loop {
  const iterations = options?.iterations ?? DEFAULT_ITERATIONS;
  const passThreshold = options?.passThreshold ?? DEFAULT_PASS_THRESHOLD;

  const generator = createGenerator(passThreshold);
  const evaluator = createEvaluator(passThreshold);

  return new Loop(generator, evaluator, {
    maxRounds: iterations,
    stopWhen: hasQAPassed,
  });
}

function createGenerator(passThreshold: number): Agent {
  return new Agent({
    name: "generator",
    prompt: `You are an elite frontend craftsperson. Build pure HTML/CSS/JS (no frameworks).

Rules:
- Create index.html in the working directory
- Commit each round to git
- If _scores.md exists, read it to track progress. If it doesn't exist, this is the first round — just build.
- If scores plateau, pivot your aesthetic approach entirely — try a completely different visual direction
- If scores drop, git checkout to restore the best version
- Do NOT start a web server. The evaluator handles that.
- Do NOT wait for scores or poll for files. Just build and finish.

Priority order:
1. Fix any bugs tagged CRITICAL or BUG in _scores.md BEFORE adding new features
2. Address specific feedback items from the evaluator
3. Add new features or improvements

Strategic decisions:
- After each evaluation, decide: refine the current direction if scores are trending well, or pivot to an entirely different aesthetic if the approach is not working
- The best designs are museum quality — pursue a distinct mood and identity, not safe defaults

Images:
- Download real images using curl and save to an img/ directory in the working directory
- Use public domain sources: Wikimedia Commons, Met Museum Open Access, Rijksmuseum API
- Example: curl -sL -o img/painting.jpg "https://upload.wikimedia.org/wikipedia/commons/thumb/..."
- NEVER use external URLs in <img src> — always reference local files (e.g., src="img/painting.jpg")
- NEVER substitute real images with SVG shapes or gradient placeholders

Target: ALL criteria must score ${passThreshold}/10 or higher.`,
  });
}

function createEvaluator(passThreshold: number): Agent {
  return new Agent({
    name: "evaluator",
    prompt: `You are a ruthless design critic with no memory of previous rounds. Load the design-critique skill via use_skill("design-critique") for detailed methodology, anti-patterns, and scoring guide.

First, kill any existing serve process and start fresh:
  pkill -f "serve -l 8080" 2>/dev/null; sleep 1; npx serve -l 8080 . &
Then wait 3 seconds and evaluate the design at http://localhost:8080.

CRITICAL RULES:
- Do NOT read _scores.md. Ever. It is not for you.
- Do NOT reference, check, or verify "previous feedback" — you have none.
- You are seeing this site for the FIRST TIME. Evaluate absolute quality, not improvement.
- Do NOT read any file except index.html and CSS/JS files linked from it.

Determine the current round number by counting existing screenshot folders:
  ROUND=$(( $(ls -d ./screenshots/round-* 2>/dev/null | wc -l) + 1 ))
  mkdir -p ./screenshots/round-$ROUND

Use Playwright MCP to navigate the live page directly — click through it, scroll, interact with elements, test responsiveness at different viewports. Do not score from a static screenshot alone.

Score each criterion (1-10):
- design_quality (weight 0.35): Does the design feel like a coherent whole rather than a collection of parts? Strong work means colors, typography, layout, imagery combine to create a distinct mood and identity.
- originality (weight 0.35): Is there evidence of custom creative decisions, or is this template layouts, library defaults, and AI-generated patterns? Unmodified stock components or telltale AI slop (purple gradients over white cards) fail here.
- craft (weight 0.15): Typography hierarchy, spacing consistency, color harmony, contrast ratios. A competence check — most reasonable implementations do fine; failing means broken fundamentals.
- functionality (weight 0.15): Usability independent of aesthetics. Can users understand the interface, find primary actions, and complete tasks without guessing?

SCORING CALIBRATION:
- 9-10: Exceptional. A professional designer would be impressed. Distinct identity that could not be mistaken for another site.
- 7-8: Good. Competent and polished, but you've seen this layout before. Lacks a signature element.
- 5-6: Generic. Template-quality. AI slop patterns. Safe choices everywhere.
- 3-4: Poor. Broken fundamentals, clashing styles, or amateur execution.
A score of 9+ means you would genuinely bookmark this site. Do not give 9 just because it is "good enough."

Pass only if ALL criteria >= ${passThreshold}/10.
APPEND scores to ./_scores.md using Bash (do NOT overwrite — the generator tracks score trends across rounds):
  cat >> ./_scores.md << EOF
  ## Round $ROUND
  | design_quality | originality | craft | functionality | passed |
  |---|---|---|---|---|
  | X | X | X | X | YES/NO |
  EOF

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
    tools: ["Bash", "Glob"],
    contextStrategy: "reset",
    mcpServers: {
      playwright: PLAYWRIGHT_MCP_SERVER,
    },
    outputSchema: QAReportSchema,
  });
}

