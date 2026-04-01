import type { Runnable } from "../types.js";
import { getFormatter } from "../context.js";

interface LoopOptions {
  maxRounds?: number;
  stopWhen?: (result: unknown) => boolean;
}

export class Loop implements Runnable {
  private agents: Runnable[];
  private maxRounds: number;
  private stopWhen: ((result: unknown) => boolean) | null;

  constructor(...args: [...Runnable[], LoopOptions] | Runnable[]) {
    const last = args[args.length - 1];
    let options: LoopOptions = {};
    let agents: Runnable[];

    if (last && typeof last === "object" && !("run" in last)) {
      options = last as LoopOptions;
      agents = args.slice(0, -1) as Runnable[];
    } else {
      agents = args as Runnable[];
    }

    if (agents.length < 2) {
      throw new Error("Loop requires at least two agents");
    }

    this.agents = agents;
    this.maxRounds = options.maxRounds ?? 3;
    this.stopWhen = options.stopWhen ?? null;
  }

  async run(input: unknown): Promise<unknown> {
    const formatter = getFormatter() as any;
    let currentInput = input;
    let roundResult: unknown = input;

    for (let round = 0; round < this.maxRounds; round++) {
      if (formatter?.logInfo) {
        formatter.logInfo(`Loop round ${round + 1}/${this.maxRounds}`);
      }

      roundResult = currentInput;
      for (const agent of this.agents) {
        roundResult = await agent.run(roundResult);
      }

      if (formatter?.logRoundResult) {
        formatter.logRoundResult(roundResult);
      }

      if (this.stopWhen?.(roundResult)) {
        if (formatter?.logInfo) {
          formatter.logInfo("Loop stopped: condition met");
        }
        break;
      }

      currentInput = roundResult;
    }

    return roundResult;
  }
}
