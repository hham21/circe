import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const SESSION_ID_LENGTH = 8;
const FILE_ENCODING = "utf-8" as const;

export interface Session {
  id: string;
  workflow: string;
  input: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export class SessionManager {
  private sessionsDir: string;

  constructor(baseDir: string) {
    this.sessionsDir = join(baseDir, "sessions");
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  create(workflow: string, input: string): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID().slice(0, SESSION_ID_LENGTH),
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
    const filenames = readdirSync(this.sessionsDir).filter((f) => f.endsWith(".json"));
    return filenames
      .map((filename) => this.readSessionFile(filename))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(sessionId: string): Session {
    const filePath = this.sessionFilePath(sessionId);
    if (!existsSync(filePath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return JSON.parse(readFileSync(filePath, FILE_ENCODING));
  }

  updateStatus(sessionId: string, status: string): void {
    const session = this.get(sessionId);
    session.status = status;
    session.updatedAt = new Date().toISOString();
    this.save(session);
  }

  private sessionFilePath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.json`);
  }

  private readSessionFile(filename: string): Session {
    return JSON.parse(readFileSync(join(this.sessionsDir, filename), FILE_ENCODING)) as Session;
  }

  private save(session: Session): void {
    writeFileSync(
      this.sessionFilePath(session.id),
      JSON.stringify(session, null, 2),
    );
  }
}
