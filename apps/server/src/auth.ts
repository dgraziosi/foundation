import type { NextFunction, Request, Response } from "express";
import type { AgentPrincipal, Keyring } from "./keyring.js";
import type { WriteContext } from "./write-context.js";

/**
 * Authorization: ApiKey <key>
 * Bearer <key> is accepted as a documented equivalent.
 * Cookie `foundation_key` unlocks the `/view` window only (`Path=/view`).
 * `/mcp` and `/blobs` require the Authorization header — the cookie is not an MCP credential.
 */
export const API_KEY_COOKIE = "foundation_key";

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

/** Header first; cookie only for the `/view` window. */
export function providedApiKey(req: Request): string | undefined {
  return headerApiKey(req) ?? cookieValue(req.header("cookie") ?? "", API_KEY_COOKIE);
}

export function apiKeyCookieHeader(key: string): string {
  return `${API_KEY_COOKIE}=${encodeURIComponent(key)}; Path=/view; HttpOnly; SameSite=Strict; Max-Age=2592000`;
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

export function requireApiKey(keyring: Keyring) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = keyring.resolve(headerApiKey(req));
    if (!principal) {
      res.setHeader("WWW-Authenticate", 'ApiKey realm="foundation"');
      const mcp = req.baseUrl === "/mcp" || req.originalUrl.startsWith("/mcp");
      if (mcp) {
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Unauthorized" },
          id: null,
        });
        return;
      }
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.agent = principal;
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      agent?: AgentPrincipal;
    }
  }
}
