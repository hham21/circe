---
name: qa
description: Systematically QA test a web application. Explores pages, documents bugs with screenshots, computes health score, and returns structured feedback for the Generator to fix.
---

# QA: Test → Score → Feedback

Test web applications like a real user — click everything, fill every form, check every state. Document bugs with evidence and return structured feedback. Do NOT fix bugs — that's the Generator's job.

## Setup

**Parameters (from orchestrator input or defaults):**

| Parameter | Default |
|-----------|---------|
| Target URL | auto-detect from localhost ports |
| Tier | Standard |
| Output dir | ./qa-reports/ |

**Tiers determine which issues to report:**
- **Quick:** critical + high only
- **Standard:** + medium (default)
- **Exhaustive:** + low/cosmetic

**Detect running app — check common local dev ports:**

Try localhost:3000, :4000, :5173, :8080 in order. Use the first that responds.

If no app found, throw error: "No running application detected. Start the dev server before running QA."

**Create output directories:**

```bash
mkdir -p qa-reports/screenshots
```

## Phase 1: Orient

Navigate to the target URL. Take an initial screenshot. Map the navigation structure. Check console for errors on landing.

**Detect framework** (note in report):
- `__next` in HTML → Next.js
- `csrf-token` meta tag → Rails
- `wp-content` in URLs → WordPress
- Client-side routing → SPA

## Phase 2: Authenticate (if needed)

If login credentials were provided, use them to authenticate.

If 2FA/OTP or CAPTCHA is required, throw error: "Authentication requires human interaction (2FA/CAPTCHA). Provide pre-authenticated cookies or skip auth-gated pages."

## Phase 3: Explore

Visit pages systematically. At each page:

1. Take annotated screenshot
2. Check console for errors
3. Test interactive elements (buttons, links, controls)
4. Test forms (empty, invalid, edge cases)
5. Check navigation paths in and out
6. Test states (empty, loading, error, overflow)
7. Check responsiveness at mobile viewport (375x812)

Spend more time on core features (homepage, dashboard, checkout) and less on secondary pages (about, terms).

**Quick mode:** Only homepage + top 5 navigation targets. Check: loads? Console errors? Broken links?

## Phase 4: Document

Document each issue immediately when found.

**Interactive bugs** (broken flows, dead buttons):
1. Screenshot before action
2. Perform action
3. Screenshot showing result
4. Write repro steps

**Static bugs** (typos, layout issues):
1. Single annotated screenshot
2. Describe what's wrong

## Phase 5: Score

Compute health score using weighted categories:

| Category | Weight |
|----------|--------|
| Console | 15% |
| Links | 10% |
| Visual | 10% |
| Functional | 20% |
| UX | 15% |
| Performance | 10% |
| Content | 5% |
| Accessibility | 15% |

**Per-category scoring** starts at 100, deduct per finding:
- Critical: -25
- High: -15
- Medium: -8
- Low: -3

Final score = weighted average of all categories.

## Phase 6: Report

Sort issues by severity. Tag each with category and severity.

For each issue, provide actionable feedback the Generator can act on:
- What's broken (specific element, page, interaction)
- Where it is (URL, screenshot reference)
- How to reproduce (step by step)
- Suggested fix direction (e.g., "button click handler missing", "CSS overflow not hidden")

Tag critical bugs as "CRITICAL BUG:" so the Generator prioritizes them.

## Output

Return structured JSON:

```json
{
  "passed": true/false,
  "scores": {
    "console": N, "links": N, "visual": N, "functional": N,
    "ux": N, "performance": N, "content": N, "accessibility": N
  },
  "healthScore": N,
  "issuesFound": N,
  "feedback": [
    "CRITICAL BUG: Login form submit button does nothing — click handler missing on @e5",
    "Navigation menu overlaps content on mobile (375px) — hamburger menu z-index issue",
    "Console error: 'Cannot read property of undefined' on /dashboard after login"
  ]
}
```

`passed` is true only when ALL category scores meet the threshold defined by the orchestrator (typically 7+/10 or 70+/100).

## Rules

1. Every issue needs at least one screenshot. No exceptions.
2. Verify before documenting — retry once to confirm reproducibility.
3. Never include credentials in reports. Use [REDACTED].
4. Write incrementally. Append each issue as found.
5. Test as a user, not a developer. Don't read source code during testing.
6. Check console after every interaction.
7. Depth over breadth. 5-10 well-documented issues > 20 vague descriptions.
8. Do NOT modify source code. Do NOT commit. Evaluation only.
