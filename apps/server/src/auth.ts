import type { NextFunction, Request, Response } from "express";

/**
 * Authorization: ApiKey <FOUNDATION_API_KEY>
 * Bearer <FOUNDATION_API_KEY> is accepted as a documented equivalent.
 * Cookie `foundation_key` unlocks the read-only `/view` window only (`Path=/view`).
 * `/mcp` and `/blobs` require the Authorization header — the cookie is not a write credential.
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

function headerApiKey(req: Request): string | undefined {
  const header = req.header("authorization") ?? "";
  const match = header.match(/^(ApiKey|Bearer)\s+(\S+)$/i);
  return match?.[2];
}

/** Header first; cookie only for the read-only window. */
export function providedApiKey(req: Request): string | undefined {
  return headerApiKey(req) ?? cookieValue(req.header("cookie") ?? "", API_KEY_COOKIE);
}

export function apiKeyCookieHeader(key: string): string {
  return `${API_KEY_COOKIE}=${encodeURIComponent(key)}; Path=/view; HttpOnly; SameSite=Strict; Max-Age=2592000`;
}

export function requireApiKey(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = headerApiKey(req);
    if (!provided || provided !== expected) {
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
    next();
  };
}
