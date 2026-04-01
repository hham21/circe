import type { Runnable } from "../types.js";

export class Parallel implements Runnable {
  private agents: Runnable[];

  constructor(...agents: Runnable[]) {
    if (agents.length === 0) {
      throw new Error("Parallel requires at least one agent");
    }
    this.agents = agents;
  }

  async run(input: unknown): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};

    await Promise.all(
      this.agents.map(async (agent) => {
        const result = await agent.run(input);
        const name = (agent as any).name ?? String(agent);
        results[name] = result;
      }),
    );

    return results;
  }
}
