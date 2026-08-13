import type { NextFunction, Request, Response } from "express";

/**
 * Authorization: ApiKey <FOUNDATION_API_KEY>
 * Bearer <FOUNDATION_API_KEY> is accepted as a documented equivalent.
 */
export function requireApiKey(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("authorization") ?? "";
    const match = header.match(/^(ApiKey|Bearer)\s+(\S+)$/i);
    const provided = match?.[2];
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
