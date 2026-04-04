import { describe, it, expect } from "vitest";
import { Contract } from "../../src/orchestration/contract.js";
import { EventBus } from "../../src/events.js";

describe("Contract with EventBus", () => {
  it("emits round:start and round:done events", async () => {
    const bus = new EventBus();
    const proposer = { name: "proposer", async run() { return "plan"; } };
    const reviewer = { name: "reviewer", async run() { return { accepted: true }; } };

    await new Contract(proposer, reviewer, { eventBus: bus }).run("spec");

    const starts = bus.history.filter((e) => e.type === "round:start");
    const dones = bus.history.filter((e) => e.type === "round:done");
    expect(starts).toHaveLength(1);
    expect(dones).toHaveLength(1);
  });

  it("emits round:error on failure", async () => {
    const bus = new EventBus();
    const proposer = { name: "proposer", async run() { throw new Error("crash"); } };
    const reviewer = { name: "reviewer", async run() { return { accepted: true }; } };

    await expect(
      new Contract(proposer, reviewer, { eventBus: bus }).run("spec"),
    ).rejects.toThrow("crash");

    const errors = bus.history.filter((e) => e.type === "round:error");
    expect(errors).toHaveLength(1);
  });
});

describe("Contract with RetryPolicy", () => {
  it("retries failing proposer", async () => {
    let calls = 0;
    const proposer = {
      name: "proposer",
      async run() {
        calls++;
        if (calls < 2) throw new Error("transient");
        return "plan";
      },
    };
    const reviewer = { name: "reviewer", async run() { return { accepted: true }; } };

    const bus = new EventBus();
    const result = await new Contract(proposer, reviewer, {
      retryPolicy: { maxRetries: 2, backoff: () => 0 },
      eventBus: bus,
    }).run("spec");

    // Contract returns proposal on accepted
    expect(result).toBe("plan");
    expect(calls).toBe(2);
  });
});
