import type { Runnable } from "../types.js";

export class Pipeline implements Runnable {
  private agents: Runnable[];

  constructor(...agents: Runnable[]) {
    if (agents.length === 0) {
      throw new Error("Pipeline requires at least one agent");
    }
    this.agents = agents;
  }

  async run(input: unknown): Promise<unknown> {
    let result = input;
    for (const agent of this.agents) {
      result = await agent.run(result);
    }
    return result;
  }
}
