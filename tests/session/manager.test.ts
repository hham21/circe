import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "../../src/session/manager.js";

describe("SessionManager", () => {
  let baseDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "circe-sessions-"));
    manager = new SessionManager(baseDir);
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("creates a session", () => {
    const session = manager.create("fullstack", "Build a memo app");
    expect(session.id).toHaveLength(8);
    expect(session.workflow).toBe("fullstack");
    expect(session.input).toBe("Build a memo app");
    expect(session.status).toBe("running");
    expect(session.createdAt).toBeDefined();
  });

  it("lists sessions", () => {
    manager.create("fullstack", "App 1");
    manager.create("frontend", "App 2");
    const sessions = manager.list();
    expect(sessions).toHaveLength(2);
  });

  it("gets a session by id", () => {
    const created = manager.create("fullstack", "Test");
    const fetched = manager.get(created.id);
    expect(fetched.workflow).toBe("fullstack");
  });

  it("throws for unknown session id", () => {
    expect(() => manager.get("nonexistent")).toThrow();
  });

  it("updates session status", () => {
    const session = manager.create("fullstack", "Test");
    manager.updateStatus(session.id, "completed");
    const updated = manager.get(session.id);
    expect(updated.status).toBe("completed");
  });
});
