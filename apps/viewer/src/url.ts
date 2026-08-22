/** Viewer Open: well-formed https only. Malformed leftover values yield undefined. */
export function openableUrl(data: Record<string, unknown> | undefined): string | undefined {
  const raw = data?.url;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return undefined;
    }
    if (parsed.username || parsed.password) {
      return undefined;
    }
    if (!parsed.hostname) {
      return undefined;
    }
    return trimmed;
  } catch {
    return undefined;
  }
}
