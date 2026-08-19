/**
 * Connection-source checks. A Host header is not isolation — a client can send
 * Host: 127.0.0.1 to a published address. Use the socket remote address.
 */

const LOOPBACK_EXACT = new Set(["127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"]);

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }
  const trimmed = address.trim().toLowerCase();
  if (LOOPBACK_EXACT.has(trimmed)) {
    return true;
  }
  if (trimmed.startsWith("::ffff:127.")) {
    return true;
  }
  if (/^127(?:\.\d{1,3}){3}$/.test(trimmed)) {
    return true;
  }
  return false;
}

type RemoteRequest = {
  socket: { remoteAddress?: string };
  header(name: string): string | undefined;
};

/**
 * Socket peer address. `x-foundation-remote` is honored only when NODE_ENV is
 * `test`, so Host spoof tests can claim a non-loopback peer without a real NIC.
 */
export function requestRemoteAddress(req: RemoteRequest): string | undefined {
  if (process.env.NODE_ENV === "test") {
    const override = req.header("x-foundation-remote");
    if (override) {
      return override;
    }
  }
  return req.socket.remoteAddress;
}

export function requestIsLoopback(req: RemoteRequest): boolean {
  return isLoopbackAddress(requestRemoteAddress(req));
}

export function isViewPath(path: string): boolean {
  return path === "/view" || path.startsWith("/view/");
}

export function isAgentPath(path: string): boolean {
  return path === "/mcp" || path.startsWith("/mcp/") || /^\/blobs(?:\/|$)/.test(path);
}
