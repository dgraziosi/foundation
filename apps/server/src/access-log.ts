import { appendFileSync, chmodSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import type { NextFunction, Request, Response } from "express";

export const ACCESS_LOG_DIR = "logs";
export const ACCESS_LOG_FILE = "access.log";
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_KEEP = 3;
const FIELD_MAX = 200;

/** One request. Built from the socket and route only, so no header, cookie, or body can reach it. */
export type AccessLogLine = {
  readonly time: string;
  readonly remote: string;
  readonly label: string;
  readonly route: string;
  readonly status: number;
};

function field(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, "?");
  return clean.length > FIELD_MAX ? `${clean.slice(0, FIELD_MAX)}...` : clean || "-";
}

export function formatAccessLine(line: AccessLogLine): string {
  return `${[line.time, line.remote, line.label, line.route].map(field).join("\t")}\t${line.status}\n`;
}

/** The view door has no `req.agent`; it names who opened it here instead. */
export function setAccessLabel(res: Response, label: string): void {
  res.locals.accessLabel = label;
}

export function accessLineOf(req: Request, res: Response, now: Date): AccessLogLine {
  const label = typeof res.locals.accessLabel === "string" ? res.locals.accessLabel : (req.agent?.name ?? "-");
  const path = req.originalUrl.split("?")[0] ?? "/";
  return {
    time: now.toISOString(),
    remote: req.socket.remoteAddress ?? "-",
    label,
    route: `${req.method} ${path}`,
    status: res.statusCode,
  };
}

export class AccessLog {
  private size: number | undefined;
  private failing = false;

  private constructor(
    private readonly dir: string,
    private readonly maxBytes: number,
    private readonly keep: number,
  ) {}

  static open(dataDir: string, opts?: { maxBytes?: number; keep?: number }): AccessLog {
    return new AccessLog(join(dataDir, ACCESS_LOG_DIR), opts?.maxBytes ?? DEFAULT_MAX_BYTES, opts?.keep ?? DEFAULT_KEEP);
  }

  get path(): string {
    return join(this.dir, ACCESS_LOG_FILE);
  }

  write(line: AccessLogLine): void {
    const text = formatAccessLine(line);
    try {
      if (this.size === undefined) {
        this.prepare();
      }
      if ((this.size ?? 0) + Buffer.byteLength(text) > this.maxBytes && (this.size ?? 0) > 0) {
        this.rotate();
      }
      appendFileSync(this.path, text, { mode: 0o600 });
      this.size = (this.size ?? 0) + Buffer.byteLength(text);
      this.failing = false;
    } catch (error) {
      this.size = undefined;
      if (!this.failing) {
        console.error(`Could not write ${this.path}`, error);
      }
      this.failing = true;
    }
  }

  private prepare(): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    chmodSync(this.dir, 0o700);
    try {
      chmodSync(this.path, 0o600);
      this.size = statSync(this.path).size;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
      this.size = 0;
    }
  }

  private rotate(): void {
    for (let i = this.keep - 1; i >= 1; i -= 1) {
      try {
        renameSync(`${this.path}.${i}`, `${this.path}.${i + 1}`);
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
    }
    renameSync(this.path, `${this.path}.1`);
    this.size = 0;
  }
}

export function logAccess(log: AccessLog) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on("finish", () => {
      log.write(accessLineOf(req, res, new Date()));
    });
    next();
  };
}
