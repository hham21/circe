import { describe, it, expect } from "vitest";
import { Loop } from "../../src/orchestration/loop.js";

class FakeGenerator {
  name = "generator";
  callCount = 0;
  async run(input: unknown) {
    this.callCount++;
    return { built: true, round: this.callCount };
  }
}

class FakeEvaluator {
  name = "evaluator";
  passOnRound: number;
  callCount = 0;
  constructor(passOnRound: number) { this.passOnRound = passOnRound; }
  async run(input: unknown) {
    this.callCount++;
    const passed = this.callCount >= this.passOnRound;
    return { passed, feedback: passed ? [] : ["Fix bugs"] };
  }
}

describe("Loop", () => {
  it("stops when condition met", async () => {
    const gen = new FakeGenerator();
    const eval_ = new FakeEvaluator(2);
    const loop = new Loop(gen, eval_, { maxRounds: 5, stopWhen: (r: any) => r.passed === true });
    const result = (await loop.run("spec")) as any;
    expect(result.passed).toBe(true);
    expect(gen.callCount).toBe(2);
    expect(eval_.callCount).toBe(2);
  });

  it("runs max rounds when condition never met", async () => {
    const gen = new FakeGenerator();
    const eval_ = new FakeEvaluator(999);
    const loop = new Loop(gen, eval_, { maxRounds: 3, stopWhen: (r: any) => r.passed === true });
    const result = (await loop.run("spec")) as any;
    expect(result.passed).toBe(false);
    expect(gen.callCount).toBe(3);
  });

  it("feeds evaluator output back to generator", async () => {
    const inputs: unknown[] = [];
    const gen = {
      name: "gen",
      async run(input: unknown) { inputs.push(input); return "built"; },
    };
    let evalCount = 0;
    const eval_ = {
      name: "eval",
      async run(_: unknown) {
        evalCount++;
        return { passed: evalCount >= 2, feedback: ["fix it"] };
      },
    };
    const loop = new Loop(gen, eval_, { maxRounds: 3, stopWhen: (r: any) => r.passed });
    await loop.run("initial");
    expect(inputs[0]).toBe("initial");
    expect((inputs[1] as any).feedback).toEqual(["fix it"]);
  });

  it("throws with fewer than 2 agents", () => {
    const a = { name: "a", run: async () => {} };
    expect(() => new Loop(a)).toThrow("Loop requires at least two agents");
  });
});
