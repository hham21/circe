import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Agent, agent } from "../../src/agent.js";
import { Loop, Contract, Pipeline, pipe, Parallel, Sprint } from "../../src/orchestration/index.js";
import type { Runnable } from "../../src/types.js";

// Fake typed agents for compile-time verification
const fakeRunnable = <TIn, TOut>(name: string): Runnable<TIn, TOut> => ({
  name,
  async run(_input: TIn): Promise<TOut> {
    return {} as TOut;
  },
});

describe("Runnable generics", () => {
  it("Runnable<TIn, TOut> constrains run() signature", () => {
    const r: Runnable<string, number> = {
      name: "test",
      async run(input: string): Promise<number> {
        return input.length;
      },
    };
    expect(r.name).toBe("test");
  });

  it("Agent defaults to <string, string>", () => {
    const a = new Agent({ name: "test", prompt: "" });
    // Type: Agent<string, string>
    type AssertIn = typeof a extends Runnable<string, any> ? true : false;
    const check: AssertIn = true;
    expect(check).toBe(true);
  });
});

describe("Loop generics", () => {
  it("infers TProducer and TEval from agents", () => {
    type Poem = { text: string };
    type Score = { passed: boolean; score: number };
    const writer = fakeRunnable<string, Poem>("writer");
    const critic = fakeRunnable<Poem, Score>("critic");

    const loop = new Loop<string, Poem, Score>(writer, critic, {
      stopWhen: (result: Score) => result.passed,
    });

    expect(loop).toBeDefined();
    // loop.run returns Promise<Poem> (producer output)
    // loop.lastEvaluatorResult returns Score | null
  });
});

describe("Contract generics", () => {
  it("typed Contract with custom isAccepted", () => {
    type Proposal = { budget: number };
    type Review = { accepted: boolean; feedback: string };
    const proposer = fakeRunnable<string, Proposal>("proposer");
    const reviewer = fakeRunnable<Proposal, Review>("reviewer");

    const contract = new Contract<string, Proposal, Review>(proposer, reviewer, {
      isAccepted: (review) => review.accepted,
    });

    expect(contract).toBeDefined();
    // contract.run returns Promise<Proposal>
    // contract.lastEvaluatorResult returns Review | null
  });
});

describe("pipe() type safety", () => {
  it("chains types through pipe()", () => {
    const a = fakeRunnable<string, number>("a");
    const b = fakeRunnable<number, boolean>("b");

    const p = pipe(a, b);
    expect(p).toBeInstanceOf(Pipeline);
    // p: Pipeline<string, boolean>
  });

  it("supports 3-step pipe", () => {
    const a = fakeRunnable<string, number>("a");
    const b = fakeRunnable<number, boolean>("b");
    const c = fakeRunnable<boolean, string>("c");

    const p = pipe(a, b, c);
    expect(p).toBeInstanceOf(Pipeline);
    // p: Pipeline<string, string>
  });

  it("supports 4-step pipe", () => {
    const a = fakeRunnable<string, number>("a");
    const b = fakeRunnable<number, boolean>("b");
    const c = fakeRunnable<boolean, string>("c");
    const d = fakeRunnable<string, number[]>("d");

    const p = pipe(a, b, c, d);
    expect(p).toBeInstanceOf(Pipeline);
    // p: Pipeline<string, number[]>
  });

  // Uncomment to verify compile error:
  // it("rejects type mismatch", () => {
  //   const a = fakeRunnable<string, number>("a");
  //   const b = fakeRunnable<string, boolean>("b"); // expects string, not number
  //   // @ts-expect-error — b expects string input but a outputs number
  //   const p = pipe(a, b);
  // });
});

describe("Parallel generics", () => {
  it("ParallelResult is typed", () => {
    const a = fakeRunnable<string, number>("a");
    const b = fakeRunnable<string, number>("b");
    const parallel = new Parallel<string, number>(a, b);
    expect(parallel).toBeDefined();
    // parallel.run returns Promise<ParallelResult<number>>
  });
});

describe("Sprint generics", () => {
  it("Sprint wraps result in { sprintResults: TOut[] }", () => {
    const runner = fakeRunnable<string, string>("runner");
    const sprint = new Sprint<unknown, string>(runner);
    expect(sprint).toBeDefined();
    // sprint.run returns Promise<{ sprintResults: string[] }>
  });
});
