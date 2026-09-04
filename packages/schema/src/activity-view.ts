import {
  ACTIVITY_FIELD_NAMES,
  type Activity,
  type ActivityFieldName,
} from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Lean before/after: top-level keys that differ. One-sided null keeps the other snapshot. */
export function activitySnapshotDiff(
  before: unknown,
  after: unknown,
): { before: unknown; after: unknown } {
  if (before == null || after == null) {
    return { before, after };
  }
  if (!isPlainObject(before) || !isPlainObject(after)) {
    return jsonEqual(before, after) ? { before: null, after: null } : { before, after };
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const leanBefore: Record<string, unknown> = {};
  const leanAfter: Record<string, unknown> = {};
  for (const key of keys) {
    const left = before[key];
    const right = after[key];
    if (jsonEqual(left, right)) {
      continue;
    }
    if (Object.hasOwn(before, key)) {
      leanBefore[key] = left;
    }
    if (Object.hasOwn(after, key)) {
      leanAfter[key] = right;
    }
  }
  return { before: leanBefore, after: leanAfter };
}

export function projectActivity(
  row: Activity,
  fields?: readonly ActivityFieldName[],
): Partial<Activity> {
  if (!fields || fields.length === 0) {
    return row;
  }
  const seen = new Set<ActivityFieldName>();
  const out: Partial<Activity> = {};
  for (const field of fields) {
    if (seen.has(field)) {
      continue;
    }
    seen.add(field);
    (out as Record<string, unknown>)[field] = row[field];
  }
  return out;
}

export function presentActivity(
  row: Activity,
  options: { fields?: readonly ActivityFieldName[]; diff_only?: boolean } = {},
): Partial<Activity> {
  const next = options.diff_only
    ? { ...row, ...activitySnapshotDiff(row.before, row.after) }
    : row;
  return projectActivity(next, options.fields);
}

export { ACTIVITY_FIELD_NAMES };
