import { describe, it, expect } from "vitest";
import { Sprint } from "../../src/orchestration/sprint.js";
import { EventBus } from "../../src/events.js";

describe("Sprint with EventBus", () => {
  it("emits sprint:start and sprint:done events", async () => {
    const bus = new EventBus();
    const inner = { name: "inner", async run(input: unknown) { return `done:${JSON.stringify(input)}`; } };
    const sprint = new Sprint(inner, { eventBus: bus });

    await sprint.run({ sprints: [{ name: "auth" }, { name: "dashboard" }] });

    const starts = bus.history.filter((e) => e.type === "sprint:start");
    const dones = bus.history.filter((e) => e.type === "sprint:done");
    expect(starts).toHaveLength(2);
    expect(dones).toHaveLength(2);
    expect((starts[0] as any).definition).toEqual({ name: "auth" });
  });

  it("emits sprint:error on failure", async () => {
    const bus = new EventBus();
    const inner = { name: "inner", async run() { throw new Error("crash"); } };
    const sprint = new Sprint(inner, { eventBus: bus });

    await expect(sprint.run({ sprints: [{ name: "fail" }] })).rejects.toThrow("crash");

    const errors = bus.history.filter((e) => e.type === "sprint:error");
    expect(errors).toHaveLength(1);
  });
});

describe("Sprint with RetryPolicy", () => {
  it("retries failing sprint definition", async () => {
    let calls = 0;
    const inner = {
      name: "inner",
      async run() {
        calls++;
        if (calls < 2) throw new Error("transient");
        return "ok";
      },
    };

    const bus = new EventBus();
    const result = await new Sprint(inner, {
      retryPolicy: { maxRetries: 2, backoff: () => 0 },
      eventBus: bus,
    }).run({ sprints: [{ name: "auth" }] });

    expect((result as any).sprintResults).toEqual(["ok"]);
    expect(calls).toBe(2);
  });
});
