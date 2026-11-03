import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VIEW_COOKIE_MAX_AGE } from "./auth.js";
import type { Clock, WindowLock } from "./view-door.js";

export const VIEW_SESSIONS_FILE = "view-sessions.json";
const MAX_SESSIONS = 64;

/** Random cookie value. Disk holds only its HMAC under the view key digest. */
export type ViewSessionId = string & { readonly __brand: "ViewSessionId" };

type StoredSession = { sha256: string; expires_at: number };

const systemClock: Clock = { now: () => Date.now() };

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

/**
 * Sessions the Unlock door has issued. Keyed to the view key, so rotating
 * `FOUNDATION_VIEW_KEY` ends every session, and a closed window resolves none.
 */
export class ViewSessions {
  private sessions = new Map<string, number>();
  private loadedStamp: string | undefined;

  private constructor(
    private readonly path: string,
    private readonly lock: WindowLock,
    private readonly clock: Clock,
  ) {}

  static open(dataDir: string, lock: WindowLock, opts?: { clock?: Clock }): ViewSessions {
    return new ViewSessions(join(dataDir, VIEW_SESSIONS_FILE), lock, opts?.clock ?? systemClock);
  }

  mint(): ViewSessionId {
    if (this.lock.mode === "closed") {
      throw new Error("A closed window issues no sessions");
    }
    this.reload();
    const id = randomBytes(32).toString("base64url") as ViewSessionId;
    const now = this.clock.now();
    for (const [hash, expires] of this.sessions) {
      if (expires <= now) {
        this.sessions.delete(hash);
      }
    }
    this.sessions.set(this.hashOf(id), now + VIEW_COOKIE_MAX_AGE * 1000);
    while (this.sessions.size > MAX_SESSIONS) {
      const oldest = [...this.sessions.entries()].sort((a, b) => a[1] - b[1])[0];
      this.sessions.delete(oldest![0]);
    }
    this.persist();
    return id;
  }

  resolve(raw: string | undefined): boolean {
    if (!raw || this.lock.mode === "closed") {
      return false;
    }
    this.reload();
    const expires = this.sessions.get(this.hashOf(raw));
    return expires !== undefined && expires > this.clock.now();
  }

  private hashOf(id: string): string {
    if (this.lock.mode === "closed") {
      throw new Error("A closed window has no session key");
    }
    return createHmac("sha256", this.lock.viewerDigest).update(id, "utf8").digest("hex");
  }

  private stamp(): string | undefined {
    try {
      const stat = statSync(this.path);
      return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  /** Both doors run in one process, but tests and restarts open their own store on the same file. */
  private reload(): void {
    let stamp: string | undefined;
    try {
      stamp = this.stamp();
    } catch (error) {
      console.error(`Could not read ${this.path}`, error);
      return;
    }
    if (stamp === this.loadedStamp) {
      return;
    }
    const next = new Map<string, number>();
    if (stamp !== undefined) {
      try {
        const parsed = JSON.parse(readFileSync(this.path, "utf8")) as { sessions?: unknown };
        for (const row of Array.isArray(parsed.sessions) ? parsed.sessions : []) {
          const session = row as Partial<StoredSession>;
          if (
            typeof session.sha256 === "string" &&
            /^[0-9a-f]{64}$/.test(session.sha256) &&
            typeof session.expires_at === "number"
          ) {
            next.set(session.sha256, session.expires_at);
          }
        }
      } catch (error) {
        console.error(`Ignoring ${this.path}`, error);
      }
    }
    this.sessions = next;
    this.loadedStamp = stamp;
  }

  private persist(): void {
    const rows: StoredSession[] = [...this.sessions].map(([sha256, expires_at]) => ({ sha256, expires_at }));
    const temp = `${this.path}.${process.pid}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify({ sessions: rows })}\n`, { mode: 0o600 });
      chmodSync(temp, 0o600);
      renameSync(temp, this.path);
      this.loadedStamp = this.stamp();
    } catch (error) {
      console.error(`Could not save ${this.path}; this session lasts until restart`, error);
    }
  }
}

/**
 * HTTPS as the browser sees it. No TLS listener and no `trust proxy`, so the only HTTPS
 * request is one whose Host is the operator's https VIEW_PUBLIC_ORIGIN, served by a tunnel.
 */
export function browserIsHttps(
  req: { secure: boolean; headers: { host?: string } },
  publicOrigin: string | undefined,
): boolean {
  if (req.secure) {
    return true;
  }
  if (!publicOrigin?.startsWith("https:")) {
    return false;
  }
  return (req.headers.host ?? "").toLowerCase() === new URL(publicOrigin).host;
}
