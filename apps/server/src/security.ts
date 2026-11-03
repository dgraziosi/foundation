import type { NextFunction, Request, Response } from "express";
import type { AppBindings, AppConfig } from "./config.js";

export function isViewPath(path: string): boolean {
  return path === "/view" || path.startsWith("/view/");
}

export function isAgentPath(path: string): boolean {
  return path === "/mcp" || path.startsWith("/mcp/") || /^\/blobs(?:\/|$)/.test(path);
}

const LOOPBACK_NAMES = ["localhost", "127.0.0.1", "[::1]"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Hosts and browser origins the operator named. Loopback with the door's own port
 * is always allowed and is not listed here, because the port is known only per socket.
 */
export type HostPolicy = {
  readonly hosts: ReadonlySet<string>;
  readonly origins: ReadonlySet<string>;
};

export function hostPolicyOf(config: Pick<AppBindings, "FOUNDATION_ALLOWED_HOSTS" | "VIEW_PUBLIC_ORIGIN">): HostPolicy {
  const hosts = new Set((config.FOUNDATION_ALLOWED_HOSTS ?? []).map((host) => host.toLowerCase()));
  const origins = new Set<string>();
  for (const host of hosts) {
    origins.add(`http://${host}`);
    origins.add(`https://${host}`);
  }
  if (config.VIEW_PUBLIC_ORIGIN) {
    const url = new URL(config.VIEW_PUBLIC_ORIGIN);
    hosts.add(url.host);
    origins.add(url.origin);
  }
  return { hosts, origins };
}

function loopbackHosts(port: number): string[] {
  const named = LOOPBACK_NAMES.map((name) => `${name}:${port}`);
  return port === 80 ? [...named, ...LOOPBACK_NAMES] : named;
}

/** The door's own listen address when a client sent no Host, as in HTTP/1.0. */
function listenHost(socket: { localAddress?: string; localPort?: number }): string {
  const address = (socket.localAddress ?? "").replace(/^::ffff:/, "");
  const name = address.includes(":") ? `[${address}]` : address;
  return `${name}:${socket.localPort ?? 0}`;
}

export function hostAllowed(policy: HostPolicy, host: string, port: number): boolean {
  const normalized = host.trim().toLowerCase();
  return loopbackHosts(port).includes(normalized) || policy.hosts.has(normalized);
}

export function originAllowed(policy: HostPolicy, origin: string, port: number): boolean {
  const normalized = origin.trim().toLowerCase();
  return loopbackHosts(port).some((host) => normalized === `http://${host}`) || policy.origins.has(normalized);
}

function requestPath(req: Request): string {
  return (req.originalUrl.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
}

/**
 * One gate before every route. A foreign Host is DNS rebinding or a misrouted tunnel.
 * A foreign Origin on a /view write is another site posting with the person's cookie.
 */
export function guardHostAndOrigin(policy: HostPolicy) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const port = req.socket.localPort ?? 0;
    const host = req.headers.host ?? listenHost(req.socket);
    if (!hostAllowed(policy, host, port)) {
      res.status(403).json({ error: "Host not allowed" });
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !SAFE_METHODS.has(req.method) && isViewPath(requestPath(req))) {
      if (!originAllowed(policy, origin, port)) {
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }
    }
    next();
  };
}

export function isLoopbackBind(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(normalized)
  );
}

/** Why a bind beyond loopback may not start, or undefined when it may. */
export function bindRefusal(
  config: Pick<AppConfig, "HOST" | "VIEW_HOST" | "VIEW_PUBLIC_ORIGIN" | "FOUNDATION_ALLOW_CLEARTEXT">,
): string | undefined {
  const offBox = [
    ["HOST", config.HOST],
    ["VIEW_HOST", config.VIEW_HOST],
  ].filter(([, host]) => !isLoopbackBind(host!));
  if (offBox.length === 0) {
    return undefined;
  }
  const names = offBox.map(([name, host]) => `${name}=${host}`).join(" and ");
  if (!config.VIEW_PUBLIC_ORIGIN) {
    return `${names} listens beyond this machine. Set VIEW_PUBLIC_ORIGIN to the origin the browser opens, such as https://vault.example.ts.net.`;
  }
  if (!config.VIEW_PUBLIC_ORIGIN.startsWith("https:") && !config.FOUNDATION_ALLOW_CLEARTEXT) {
    return `${names} listens beyond this machine on plain http. Serve VIEW_PUBLIC_ORIGIN over https, or set FOUNDATION_ALLOW_CLEARTEXT=1 to accept http on your network.`;
  }
  return undefined;
}
