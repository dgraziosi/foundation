export function isViewPath(path: string): boolean {
  return path === "/view" || path.startsWith("/view/");
}

export function isAgentPath(path: string): boolean {
  return path === "/mcp" || path.startsWith("/mcp/") || /^\/blobs(?:\/|$)/.test(path);
}
