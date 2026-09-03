import { isUuid } from "./blobs.js";

export const LIST_CURSOR_INVALID_SUGGESTION =
  "Pass next from the previous page. Do not invent a cursor. Do not page with offset or by raising limit.";

export type SearchCursorValue = {
  rank: number;
  updated_at: string;
  id: string;
};

export type ActivityCursorValue = {
  created_at: string;
  id: string;
};

const SEARCH_PREFIX = "s1.";
const ACTIVITY_PREFIX = "a1.";

function encodeOpaque(prefix: string, value: unknown): string {
  return prefix + Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeOpaque(prefix: string, raw: string): unknown {
  if (!raw.startsWith(prefix)) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.from(raw.slice(prefix.length), "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function isIsoStamp(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function encodeSearchCursor(value: SearchCursorValue): string {
  return encodeOpaque(SEARCH_PREFIX, value);
}

export function encodeActivityCursor(value: ActivityCursorValue): string {
  return encodeOpaque(ACTIVITY_PREFIX, value);
}

export function parseSearchCursor(raw: string): SearchCursorValue | undefined {
  const value = decodeOpaque(SEARCH_PREFIX, raw);
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.rank !== "number" ||
    !Number.isFinite(record.rank) ||
    typeof record.updated_at !== "string" ||
    !isIsoStamp(record.updated_at) ||
    typeof record.id !== "string" ||
    !isUuid(record.id)
  ) {
    return undefined;
  }
  return { rank: record.rank, updated_at: record.updated_at, id: record.id };
}

export function parseActivityCursor(raw: string): ActivityCursorValue | undefined {
  const value = decodeOpaque(ACTIVITY_PREFIX, raw);
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.created_at !== "string" ||
    !isIsoStamp(record.created_at) ||
    typeof record.id !== "string" ||
    !isUuid(record.id)
  ) {
    return undefined;
  }
  return { created_at: record.created_at, id: record.id };
}
