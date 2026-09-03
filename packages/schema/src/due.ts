/** Seed / fallback IANA zone when the vault settings row is missing or invalid. */
export const DUE_TIMEZONE = "America/New_York";

export const ISO_DATE_PATTERN = "^[0-9]{4}-[0-9]{2}-[0-9]{2}$";
export const ISO_DATE_RE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

export const DUE_DATE_SUGGESTION =
  "Pass an ISO date YYYY-MM-DD, e.g. 2026-08-27. due is a calendar date, not a timestamp.";

/** Optional `data.due` on task and goal. Not required — nodes without due still upsert. */
export const DUE_DATA_JSON_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    due: {
      anyOf: [
        {
          type: "string",
          pattern: ISO_DATE_PATTERN,
          description: "ISO date YYYY-MM-DD (real calendar day)",
        },
        { type: "null" },
      ],
      description: "Optional due date as YYYY-MM-DD. Pass null to clear.",
    },
  },
} as const;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

/** “Today” in the seed timezone. Search and working_set read the vault settings row. */
export function todayInNewYork(now = new Date()): string {
  return todayInTimeZone(DUE_TIMEZONE, now);
}

export function dueFromData(data: Record<string, unknown>): string | undefined {
  const raw = data.due;
  if (typeof raw !== "string" || !isIsoDate(raw)) {
    return undefined;
  }
  return raw;
}

/** Drop `due: null` so a dated node can become undated. */
export function canonicalizeDueInData(data: Record<string, unknown>): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(data, "due")) {
    return data;
  }
  if (data.due === null || data.due === undefined) {
    const next = { ...data };
    delete next.due;
    return next;
  }
  return data;
}

/** After canonicalize: a remaining `due` key must be a real YYYY-MM-DD. */
export function dueKeyIsInvalid(data: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(data, "due") && dueFromData(data) === undefined;
}

export type DueSearchFilters = {
  due?: "overdue" | "today";
  due_on_or_before?: string;
  due_on_or_after?: string;
};

export function hasDueSearchFilter(input: DueSearchFilters): boolean {
  return Boolean(input.due || input.due_on_or_before || input.due_on_or_after);
}

/** True when `due` satisfies the search window. Missing due never matches a due filter. */
export function matchesDueFilters(
  due: string | undefined,
  input: DueSearchFilters,
  today: string,
): boolean {
  if (!hasDueSearchFilter(input)) {
    return true;
  }
  if (!due) {
    return false;
  }
  if (input.due === "overdue" && !(due < today)) {
    return false;
  }
  if (input.due === "today" && due !== today) {
    return false;
  }
  if (input.due_on_or_after && due < input.due_on_or_after) {
    return false;
  }
  if (input.due_on_or_before && due > input.due_on_or_before) {
    return false;
  }
  return true;
}
