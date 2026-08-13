import { toolError, type ToolError } from "./mcp-io.js";

export const LOST_UPDATE_SUGGESTION =
  "Call get and retry with the current updated_at as base_updated_at (or from_base_updated_at / to_base_updated_at).";

export const MISSING_BASE_SUGGESTION =
  "Pass the node's updated_at from get, then retry. This is if-match, not a write-ACL.";

/** Instant from get (`toISOString`) or an equivalent ISO-8601 timestamptz. */
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseTimestampMs(value: string): number | null {
  if (!ISO_INSTANT.test(value)) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function timestampsEqual(left: string, right: string): boolean {
  const a = parseTimestampMs(left);
  const b = parseTimestampMs(right);
  return a !== null && b !== null && a === b;
}

/** If-match: caller must pass the timestamp they last read. */
export function assertIfMatch(
  field: string,
  provided: string | undefined,
  current: string,
): ToolError | null {
  if (provided === undefined) {
    return toolError(`Missing ${field}`, MISSING_BASE_SUGGESTION);
  }
  if (parseTimestampMs(provided) === null) {
    return toolError(
      `Invalid ${field}: ${provided}`,
      "Pass an ISO-8601 timestamp from get (node.updated_at).",
    );
  }
  if (!timestampsEqual(provided, current)) {
    return toolError(`${field} does not match current updated_at`, LOST_UPDATE_SUGGESTION);
  }
  return null;
}
