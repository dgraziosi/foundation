import type { NextFunction, Request, Response } from "express";
import type { AgentPrincipal, Keyring } from "./keyring.js";
import { attemptSource, type FailureLedger } from "./view-door.js";
import type { WriteContext } from "./write-context.js";

/**
 * Authorization: ApiKey <key>
 * Bearer <key> is accepted as a documented equivalent.
 * Cookie `foundation_key` carries a view session id for the `/view` window only (`Path=/view`).
 * `/mcp` and `/blobs` require the Authorization header. The cookie is not an MCP credential.
 */
export const API_KEY_COOKIE = "foundation_key";
export const HOME_LOOKED_COOKIE = "foundation_home_looked";
export const VIEW_COOKIE_MAX_AGE = 2592000;
const VIEW_COOKIE_ATTRS = "Path=/view; HttpOnly; SameSite=Strict; Max-Age=2592000";

export function cookieValue(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    if (trimmed.slice(0, eq).trim() !== name) {
      continue;
    }
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

export function headerApiKey(req: Request): string | undefined {
  const header = req.header("authorization") ?? "";
  const match = header.match(/^(ApiKey|Bearer)\s+(\S+)$/i);
  return match?.[2];
}

/** `Secure` only over HTTPS. Some browsers drop a Secure cookie on plain http://127.0.0.1. */
export function viewSessionCookieHeader(sessionId: string, secure: boolean): string {
  return `${API_KEY_COOKIE}=${encodeURIComponent(sessionId)}; ${VIEW_COOKIE_ATTRS}${secure ? "; Secure" : ""}`;
}

export function homeLookedCookieHeader(lookedAt: string, secure: boolean): string {
  return `${HOME_LOOKED_COOKIE}=${encodeURIComponent(lookedAt)}; ${VIEW_COOKIE_ATTRS}${secure ? "; Secure" : ""}`;
}

export function readHomeLooked(cookieHeader: string): Date | undefined {
  const raw = cookieValue(cookieHeader, HOME_LOOKED_COOKIE);
  if (!raw) {
    return undefined;
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    return undefined;
  }
  return new Date(ms);
}

export function writeContextOf(principal: AgentPrincipal): WriteContext {
  return {
    writer: {
      actor: principal.actor,
      actor_label: principal.actor_label,
    },
    destructive: principal.destructive,
  };
}

function refuseApiKey(req: Request, res: Response, status: 401 | 429): void {
  res.setHeader("WWW-Authenticate", 'ApiKey realm="foundation"');
  const mcp = req.baseUrl === "/mcp" || req.originalUrl.startsWith("/mcp");
  if (mcp) {
    res.status(status).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    return;
  }
  res.status(status).json({ error: "Unauthorized" });
}

/**
 * Header ledger, apart from Unlock so a bad bot key on loopback never locks the window.
 * A success does not clear it: every local account shares 127.0.0.1, and a busy bot would
 * otherwise reset a neighbor's guesses.
 */
export function requireApiKey(keyring: Pick<Keyring, "resolve">, ledger: FailureLedger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = headerApiKey(req);
    if (provided === undefined) {
      refuseApiKey(req, res, 401);
      return;
    }
    const source = attemptSource(req);
    const retryAfterSec = ledger.lockedFor(source);
    if (retryAfterSec !== undefined) {
      res.setHeader("Retry-After", String(retryAfterSec));
      refuseApiKey(req, res, 429);
      return;
    }
    const principal = keyring.resolve(provided);
    if (!principal) {
      ledger.fail(source);
      refuseApiKey(req, res, 401);
      return;
    }
    req.agent = principal;
    next();
  };
}

/** Keyed `/health` adds bind fields. It spends the header ledger and never answers 429. */
export function healthKeyMatches(req: Request, keyring: Pick<Keyring, "resolve">, ledger: FailureLedger): boolean {
  const provided = headerApiKey(req);
  if (provided === undefined) {
    return false;
  }
  const source = attemptSource(req);
  if (ledger.lockedFor(source) !== undefined) {
    return false;
  }
  if (keyring.resolve(provided)) {
    return true;
  }
  ledger.fail(source);
  return false;
}

declare global {
  namespace Express {
    interface Request {
      agent?: AgentPrincipal;
    }
  }
}
