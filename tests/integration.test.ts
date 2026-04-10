import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { Pipeline } from "../src/orchestration/pipeline.js";
import { Loop } from "../src/orchestration/loop.js";
import { Parallel } from "../src/orchestration/parallel.js";
import { Contract } from "../src/orchestration/contract.js";
import { pipe } from "../src/orchestration/index.js";
import { map } from "../src/orchestration/map.js";
import { EventBus } from "../src/events.js";
import { Session } from "../src/session.js";
import type { Runnable } from "../src/types.js";

describe("integration: nested orchestrators", () => {
  it("Pipeline containing Loop", async () => {
    const planner = {
      name: "planner",
      async run(input: unknown) {
        return { spec: input, features: ["auth", "dashboard"] };
      },
    };

    let genCalls = 0;
    const gen = {
      name: "generator",
      async run(input: unknown) {
        genCalls++;
        return { built: true, round: genCalls };
      },
    };

    let evalCalls = 0;
    const eval_ = {
      name: "evaluator",
      async run(input: unknown) {
        evalCalls++;
        return { passed: evalCalls >= 2, scores: { quality: evalCalls >= 2 ? 9 : 5 }, feedback: [] };
      },
    };

    const pipeline = new Pipeline(
      planner,
      new Loop(gen, eval_, { maxRounds: 5, stopWhen: (r: any) => r.passed }),
    );

    const result = await pipeline.run("Build an app");
    // Loop returns producer output on stopWhen success
    expect((result as any).built).toBe(true);
    expect(genCalls).toBe(2);
  });

  it("Parallel agents merge results", async () => {
    const frontend = {
      name: "frontend",
      async run() {
        await new Promise((r) => setTimeout(r, 10));
        return { component: "Header" };
      },
    };
    const backend = {
      name: "backend",
      async run() {
        await new Promise((r) => setTimeout(r, 10));
        return { endpoint: "/api/users" };
      },
    };

    const parallel = new Parallel(frontend, backend);
    const result = await parallel.run("spec");
    expect(result).toEqual({
      frontend: { status: "fulfilled", value: { component: "Header" } },
      backend: { status: "fulfilled", value: { endpoint: "/api/users" } },
    });
  });

  it("Contract + Loop composition", async () => {
    let proposerCalls = 0;
    const proposer = {
      name: "proposer",
      async run(_: unknown) {
        proposerCalls++;
        return { proposal: "Plan", criteria: ["test1"] };
      },
    };
    const reviewer = {
      name: "reviewer",
      async run(_: unknown) {
        return { accepted: true };
      },
    };
    const contract = new Contract(proposer, reviewer);

    let genCalls = 0;
    const gen = {
      name: "gen",
      async run(_: unknown) {
        genCalls++;
        return "built";
      },
    };
    const eval_ = {
      name: "eval",
      async run(_: unknown) {
        return { passed: true, feedback: [] };
      },
    };
    const loop = new Loop(gen, eval_, { maxRounds: 3, stopWhen: (r: any) => r.passed });

    const pipeline = new Pipeline(contract, loop);
    const result = await pipeline.run("spec");
    expect(proposerCalls).toBe(1);
    expect(genCalls).toBe(1);
    // Contract returns proposal on accepted, Loop returns producer output on stopWhen
    // Contract proposal goes into Loop as input; Loop returns producer output ("built")
    expect(result).toBe("built");
  });
});

describe("pipe + map integration", () => {
  it("transforms ParallelResult to string via map in pipeline", async () => {
    const agentA: Runnable<string, string> = {
      name: "a",
      lastMetrics: null,
      async run() {
        return "hello";
      },
    };
    const agentB: Runnable<string, string> = {
      name: "b",
      lastMetrics: null,
      async run() {
        return "world";
      },
    };
    const parallel = new Parallel(agentA, agentB, { throwOnError: false });

    const summarize = map((r: Record<string, any>) => {
      return Object.entries(r)
        .filter(([, v]) => v.status === "fulfilled")
        .map(([k, v]) => `${k}: ${v.value}`)
        .join(", ");
    });

    const consumer: Runnable<string, string> = {
      name: "consumer",
      lastMetrics: null,
      async run(input) {
        return `Got: ${input}`;
      },
    };

    const pipeline = pipe(parallel, summarize, consumer);
    const result = await pipeline.run("go");
    expect(result).toContain("Got:");
    expect(result).toContain("hello");
    expect(result).toContain("world");
  });
});

describe("graduated cost policy integration", () => {
  it("Session costPolicy triggers warning and softStop via EventBus", async () => {
    const session = new Session({
      outputDir: "/tmp/circe-test-" + Date.now(),
      maxCost: 1.0,
      costPolicy: { warn: 0.5, softStop: 0.8, hardStop: 1.0 },
    });
    const bus = new EventBus();
    const warnings: any[] = [];
    bus.on("cost:warning" as any, (e: any) => warnings.push(e));

    let step2Ran = false;
    const step1: Runnable<string, string> = {
      name: "step1",
      lastMetrics: { cost: 0.6, inputTokens: 100, outputTokens: 50 },
      async run() {
        bus.emit({
          type: "agent:done",
          agent: "step1",
          result: "",
          cost: 0.6,
          tokens: [100, 50],
          timestamp: Date.now(),
        });
        return "s1";
      },
    };
    const step2: Runnable<string, string> = {
      name: "step2",
      lastMetrics: null,
      async run() {
        step2Ran = true;
        return "s2";
      },
    };

    const pipeline = pipe(step1, step2, { eventBus: bus });

    const result = await session.run(() => pipeline.run("input"));

    // warn at 0.5 was crossed (0.6 pressure)
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    // softStop at 0.8 was not crossed (only 0.6)
    expect(session.shouldStop).toBe(false);
    // Both steps ran
    expect(step2Ran).toBe(true);
    expect(result).toBe("s2");
  });
});
