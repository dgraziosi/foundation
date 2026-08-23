import { z } from "zod";

/** Top-level `data` keys only. Same family as `data.link` / `data.due` — not a column per key. */
export const DATA_EQUALS_KEY_RE = /^[a-z][a-z0-9_]*$/;
export const DATA_EQUALS_MAX_KEYS = 8;

export const DATA_EQUALS_KEY_SUGGESTION =
  "data_equals keys must be lowercase identifiers (e.g. kind, status). Top-level data keys only.";

export const DataEqualsKeySchema = z
  .string()
  .regex(DATA_EQUALS_KEY_RE, DATA_EQUALS_KEY_SUGGESTION);

/** Constrained equality map: one or a few top-level data keys, string values. */
export const DataEqualsSchema = z
  .record(DataEqualsKeySchema, z.string().trim().min(1))
  .superRefine((value, ctx) => {
    if (Object.keys(value).length > DATA_EQUALS_MAX_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `data_equals accepts at most ${DATA_EQUALS_MAX_KEYS} keys`,
      });
    }
  });
export type DataEquals = z.infer<typeof DataEqualsSchema>;

export function hasDataEqualsFilter(equals: Record<string, string> | undefined): boolean {
  return Boolean(equals && Object.keys(equals).length > 0);
}

/**
 * True when every `data_equals` key is present on `data` with that string value.
 * Missing keys never match. Empty / omitted filter matches everything.
 */
export function matchesDataEquals(
  data: Record<string, unknown>,
  equals: Record<string, string> | undefined,
): boolean {
  if (!hasDataEqualsFilter(equals)) {
    return true;
  }
  for (const [key, value] of Object.entries(equals!)) {
    if (!Object.prototype.hasOwnProperty.call(data, key) || data[key] !== value) {
      return false;
    }
  }
  return true;
}
