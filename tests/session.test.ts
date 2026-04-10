import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Session, sessionStore } from "../src/session.js";
import { getWorkDir, getFormatter, getSkillRegistry, setWorkDir, setFormatter, setSkillRegistry } from "../src/context.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "circe-session-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  setWorkDir(null);
  setFormatter(null);
  setSkillRegistry(null);
});

describe("Session constructor", () => {
  it("uses outputDir as workDir", () => {
    const session = new Session({ outputDir: tempDir });
    expect(session.workDir).toBe(tempDir);
  });

  it("defaults workDir to cwd when no outputDir", () => {
    const session = new Session();
    expect(session.workDir).toBe(process.cwd());
  });

  it("creates outputDir if it does not exist", () => {
    const newDir = join(tempDir, "nested", "dir");
    const session = new Session({ outputDir: newDir });
    expect(existsSync(newDir)).toBe(true);
    expect(session.workDir).toBe(newDir);
  });

  it("creates OutputFormatter when verbose is true", () => {
    const session = new Session({ outputDir: tempDir, verbose: true });
    expect(session.formatter).not.toBeNull();
  });

  it("creates non-verbose formatter when verbose is false", () => {
    const session = new Session({ outputDir: tempDir, verbose: false });
    expect(session.formatter).not.toBeNull();
  });

  it("creates SkillRegistry with provided skill dirs", () => {
    const skillDir = join(tempDir, "skills");
    const session = new Session({ outputDir: tempDir, skills: [skillDir] });
    expect(session.skillRegistry).not.toBeNull();
  });

  it("creates default SkillRegistry when no skills option", () => {
    const session = new Session({ outputDir: tempDir });
    expect(session.skillRegistry).not.toBeNull();
  });
});

describe("Session.run() lifecycle", () => {
  it("runs the function and returns its result", async () => {
    const session = new Session({ outputDir: tempDir });
    const result = await session.run(async () => "hello");
    expect(result).toBe("hello");
  });

  it("runs teardown even when fn throws", async () => {
    const session = new Session({ outputDir: tempDir, verbose: true });
    const formatter = session.formatter!;
    const closeSpy = vi.spyOn(formatter, "close");

    await expect(
      session.run(async () => { throw new Error("boom"); })
    ).rejects.toThrow("boom");

    expect(closeSpy).toHaveBeenCalled();
  });

  it("swallows teardown errors and logs to stderr", async () => {
    const session = new Session({ outputDir: tempDir, verbose: true });
    vi.spyOn(session.formatter!, "close").mockImplementation(() => {
      throw new Error("teardown failed");
    });
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await session.run(async () => "ok");

    expect(result).toBe("ok");
    expect(stderrSpy).toHaveBeenCalledWith(
      "[session] teardown error:",
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });

  it("inner session takes precedence in nested runs", async () => {
    const outerDir = join(tempDir, "outer");
    const innerDir = join(tempDir, "inner");
    const outer = new Session({ outputDir: outerDir });
    const inner = new Session({ outputDir: innerDir });

    let capturedDir: string | null = null;

    await outer.run(async () => {
      await inner.run(async () => {
        capturedDir = getWorkDir();
      });
    });

    expect(capturedDir).toBe(innerDir);
  });
});

describe("Session.duration", () => {
  it("returns 0 before run is called", () => {
    const session = new Session({ outputDir: tempDir });
    expect(session.duration).toBe(0);
  });

  it("tracks elapsed time after run completes", async () => {
    const session = new Session({ outputDir: tempDir });
    await session.run(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(session.duration).toBeGreaterThan(0.04);
    expect(session.duration).toBeLessThan(2);
  });
});

describe("AsyncLocalStorage propagation", () => {
  it("getWorkDir returns session workDir inside session.run", async () => {
    const session = new Session({ outputDir: tempDir });
    let captured: string | null = null;

    await session.run(async () => {
      captured = getWorkDir();
    });

    expect(captured).toBe(tempDir);
  });

  it("getFormatter returns session formatter inside session.run", async () => {
    const session = new Session({ outputDir: tempDir, verbose: true });
    let captured: unknown = "not set";

    await session.run(async () => {
      captured = getFormatter();
    });

    expect(captured).toBe(session.formatter);
  });

  it("getSkillRegistry returns session registry inside session.run", async () => {
    const session = new Session({ outputDir: tempDir });
    let captured: unknown = "not set";

    await session.run(async () => {
      captured = getSkillRegistry();
    });

    expect(captured).toBe(session.skillRegistry);
  });

  it("propagates through Promise.all (parallel simulation)", async () => {
    const session = new Session({ outputDir: tempDir });
    let dir1: string | null = null;
    let dir2: string | null = null;

    await session.run(async () => {
      await Promise.all([
        (async () => { dir1 = getWorkDir(); })(),
        (async () => { dir2 = getWorkDir(); })(),
      ]);
    });

    expect(dir1).toBe(tempDir);
    expect(dir2).toBe(tempDir);
  });

  it("concurrent sessions are isolated", async () => {
    const dirA = join(tempDir, "a");
    const dirB = join(tempDir, "b");
    const sessionA = new Session({ outputDir: dirA });
    const sessionB = new Session({ outputDir: dirB });

    let capturedA: string | null = null;
    let capturedB: string | null = null;

    await Promise.all([
      sessionA.run(async () => {
        await new Promise((r) => setTimeout(r, 10));
        capturedA = getWorkDir();
      }),
      sessionB.run(async () => {
        await new Promise((r) => setTimeout(r, 10));
        capturedB = getWorkDir();
      }),
    ]);

    expect(capturedA).toBe(dirA);
    expect(capturedB).toBe(dirB);
  });
});

describe("Session cost policy", () => {
  it("stores maxCost option", () => {
    const session = new Session({ maxCost: 10.0 });
    expect(session.maxCost).toBe(10.0);
  });

  it("stores custom costPolicy thresholds", () => {
    const session = new Session({
      maxCost: 10.0,
      costPolicy: { warn: 0.5, softStop: 0.8, hardStop: 0.95 },
    });
    expect(session.costPolicy).toEqual({ warn: 0.5, softStop: 0.8, hardStop: 0.95 });
  });

  it("applies default costPolicy thresholds", () => {
    const session = new Session({ maxCost: 10.0 });
    expect(session.costPolicy).toEqual({ warn: 0.7, softStop: 0.9, hardStop: 1.0 });
  });

  it("shouldStop is initially false", () => {
    const session = new Session({ maxCost: 10.0 });
    expect(session.shouldStop).toBe(false);
  });

  it("shouldStop can be set to true", () => {
    const session = new Session({ maxCost: 10.0 });
    session.shouldStop = true;
    expect(session.shouldStop).toBe(true);
  });
});

describe("Session logLevel", () => {
  it("passes logLevel to formatter", () => {
    const session = new Session({ outputDir: tempDir, logLevel: "trace" });
    expect(session.formatter.logLevel).toBe("trace");
  });

  it("maps verbose: true to debug logLevel", () => {
    const session = new Session({ outputDir: tempDir, verbose: true });
    expect(session.formatter.logLevel).toBe("debug");
  });

  it("logLevel takes precedence over verbose", () => {
    const session = new Session({ outputDir: tempDir, verbose: true, logLevel: "info" });
    expect(session.formatter.logLevel).toBe("info");
  });

  it("defaults to no logLevel when neither set", () => {
    const session = new Session({ outputDir: tempDir });
    expect(session.formatter.logLevel).toBeUndefined();
  });
});

describe("context.ts fallback", () => {
  it("getWorkDir falls back to global when no session", () => {
    setWorkDir("/global/path");
    expect(getWorkDir()).toBe("/global/path");
  });

  it("getFormatter falls back to global when no session", () => {
    setFormatter(null);
    expect(getFormatter()).toBeNull();
  });

  it("getSkillRegistry falls back to global when no session", () => {
    setSkillRegistry(null);
    expect(getSkillRegistry()).toBeNull();
  });
});
