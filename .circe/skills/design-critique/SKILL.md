---
name: design-critique
description: Evaluate frontend design quality as a ruthless design critic. Scores design identity, originality, craft, and functionality. Returns structured feedback for the Generator to improve.
---

# Design Critique: Evaluate → Score → Feedback

Evaluate frontend designs as a ruthless design critic. Judge the overall design coherence, originality, craft quality, and usability. Do NOT modify code — return structured feedback for the Generator.

## Setup

Start the static server if not already running:

```bash
pkill -f "serve -l 8080" 2>/dev/null
sleep 1
npx serve -l 8080 . &
sleep 3
```

Evaluate at http://localhost:8080.

## Screenshots

Save all screenshots to `./screenshots/round-N/` (where N is the current round number). Determine the round number from `_scores.md` — count existing entries + 1. If `_scores.md` doesn't exist, this is round 1.

## Phase 1: Visual Audit

Take full-page screenshots (save to `./screenshots/round-N/`) and examine:

1. **First impression** — Does the page have a distinct identity or look generic/template-like?
2. **Color harmony** — Are colors intentional and cohesive? Any clashing combinations?
3. **Typography** — Font choices, hierarchy, scale, readability, spacing
4. **Layout** — Spatial composition, whitespace usage, visual rhythm
5. **Imagery** — Real images vs placeholders? Broken images? Consistent style?
6. **Responsiveness** — Check at mobile (375px), tablet (768px), desktop (1280px)

## Phase 2: Interaction Check

Test all interactive elements:

1. **Navigation** — Do links work? Is the current page indicated?
2. **Buttons** — Click every button. Do they respond?
3. **Hover/focus states** — Are they distinct and consistent?
4. **Animations/transitions** — Smooth? Jarring? Missing where expected?
5. **Scroll behavior** — Any parallax, sticky headers, scroll-triggered elements?
6. **Console** — Any JS errors?

## Phase 3: Score

Score each criterion (1-10):

| Criterion | Weight | What to evaluate |
|-----------|--------|------------------|
| design_quality | 0.35 | Coherent whole, distinct identity, not generic |
| originality | 0.35 | Custom creative choices, unique personality, avoids template look |
| craft | 0.15 | Typography precision, spacing consistency, color harmony |
| functionality | 0.15 | Usability, findability, interactions work correctly |

**Weighted score** = sum of (score × weight) for each criterion.

### Anti-patterns to flag

- Purple gradients as default aesthetic
- Generic hero sections with stock placeholder text
- Cookie-cutter card layouts with no variation
- SVG shapes or gradient placeholders instead of real images
- Overly safe, committee-designed look with no distinctive choices

### What makes a 9-10

- Clear visual identity you could recognize without the logo
- Typography that creates hierarchy and mood, not just information
- Color palette that feels intentional, not default
- Layout with deliberate rhythm and breathing room
- Real imagery that supports the design narrative
- Interactions that feel polished, not afterthoughts

## Phase 4: Feedback

Do NOT read `_scores.md` or any previous evaluation results. Evaluate blindly every round — judge absolute visual quality as if seeing the site for the first time. This prevents anchoring bias and score inflation.

Write scores to `./_scores.md` after evaluation, for the Generator to read (not for you).

For each issue, be specific about what to change, not just what's wrong:

- Bad: "The typography needs work"
- Good: "The h1 uses the same weight as body text — increase to 700 and bump to 3.5rem to create contrast with the 1rem body"

Tag critical bugs as "CRITICAL BUG:" so the Generator fixes them first.

For broken/missing images: tell the Generator to download real images using curl from Wikimedia Commons or other public domain sources. Never suggest SVG replacements.

## Output

```json
{
  "passed": true/false,
  "scores": {
    "design_quality": N,
    "originality": N,
    "craft": N,
    "functionality": N
  },
  "feedback": [
    "CRITICAL BUG: Hero image returns 404 — download from Wikimedia Commons",
    "Typography lacks hierarchy — h1 and h2 are visually identical, increase h1 to 3.5rem/700",
    "Color palette is safe — replace the gray background with the warm gallery white (#F8F6F1) for personality"
  ]
}
```

`passed` is true only when ALL criteria meet the threshold set by the orchestrator.

## Rules

1. Every critique needs screenshot evidence.
2. Be specific — reference exact elements, colors, sizes, font weights.
3. Suggest concrete fixes, not vague directions.
4. Score honestly — a generic-looking site is a 5-6, not a 7-8.
5. Do NOT modify source code. Evaluation only.
