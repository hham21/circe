import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface Session {
  id: string;
  workflow: string;
  input: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export class SessionManager {
  private dir: string;

  constructor(baseDir: string) {
    this.dir = join(baseDir, "sessions");
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  create(workflow: string, input: string): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID().slice(0, 8),
      workflow,
      input,
      status: "running",
      createdAt: now,
      updatedAt: now,
    };
    this.save(session);
    return session;
  }

  list(): Session[] {
    if (!existsSync(this.dir)) return [];
    const files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => JSON.parse(readFileSync(join(this.dir, f), "utf-8")) as Session)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(sessionId: string): Session {
    const path = join(this.dir, `${sessionId}.json`);
    if (!existsSync(path)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  updateStatus(sessionId: string, status: string): void {
    const session = this.get(sessionId);
    session.status = status;
    session.updatedAt = new Date().toISOString();
    this.save(session);
  }

  private save(session: Session): void {
    writeFileSync(
      join(this.dir, `${session.id}.json`),
      JSON.stringify(session, null, 2),
    );
  }
}
