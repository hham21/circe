import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { fullstackApp } from "../../src/presets/fullstack.js";
import { frontendDesign } from "../../src/presets/frontend.js";
import { Pipeline } from "../../src/orchestration/pipeline.js";

describe("fullstackApp", () => {
  it("creates a Pipeline", () => {
    const app = fullstackApp();
    expect(app).toBeInstanceOf(Pipeline);
  });

  it("accepts custom max_rounds", () => {
    const app = fullstackApp({ maxRounds: 5 });
    expect(app).toBeInstanceOf(Pipeline);
  });

  it("accepts custom evaluator criteria", () => {
    const app = fullstackApp({
      evaluatorCriteria: { design_quality: 0.5, functionality: 0.5 },
    });
    expect(app).toBeInstanceOf(Pipeline);
  });
});

describe("frontendDesign", () => {
  it("creates a Pipeline", () => {
    const app = frontendDesign();
    expect(app).toBeInstanceOf(Pipeline);
  });

  it("accepts custom iterations", () => {
    const app = frontendDesign({ iterations: 5 });
    expect(app).toBeInstanceOf(Pipeline);
  });
});
