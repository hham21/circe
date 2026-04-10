import { describe, it, expect } from "vitest";
import { sessionStore, isStopped } from "../src/store.js";

describe("isStopped", () => {
  it("returns false when no Session is active", () => {
    expect(isStopped()).toBe(false);
  });

  it("returns false when shouldStop is not set", () => {
    const fakeSession = { shouldStop: false } as any;
    sessionStore.run(fakeSession, () => {
      expect(isStopped()).toBe(false);
    });
  });

  it("returns true when shouldStop is true", () => {
    const fakeSession = { shouldStop: true } as any;
    sessionStore.run(fakeSession, () => {
      expect(isStopped()).toBe(true);
    });
  });
});
