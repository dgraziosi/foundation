export type DueTone = "overdue" | "today" | "future";

export function todayInNewYork(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function dueTone(due: string, today = todayInNewYork()): DueTone {
  if (due < today) {
    return "overdue";
  }
  if (due === today) {
    return "today";
  }
  return "future";
}

export function journalDayLabel(iso?: string, now = new Date()): string {
  const stamp = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : now;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(stamp);
}

export function journalPayloadBody(source: string): string {
  return source;
}

export function relativeTime(iso: string, now = new Date()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return iso;
  }
  const delta = Math.round((now.getTime() - then) / 1000);
  if (delta < 45) {
    return "just now";
  }
  if (delta < 3600) {
    const minutes = Math.max(1, Math.round(delta / 60));
    return `${minutes}m`;
  }
  if (delta < 86400) {
    const hours = Math.max(1, Math.round(delta / 3600));
    return `${hours}h`;
  }
  const days = Math.max(1, Math.round(delta / 86400));
  if (days < 14) {
    return `${days}d`;
  }
  return new Date(then).toLocaleDateString();
}

export type RecencyGroup = "Today" | "Yesterday" | "Earlier this week" | "Earlier";

function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

function mondayOfWeek(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  const weekday = (date.getUTCDay() + 6) % 7;
  return shiftIsoDate(iso, -weekday);
}

export function recencyGroup(iso: string, now = new Date()): RecencyGroup {
  const today = todayInNewYork(now);
  const day = todayInNewYork(new Date(iso));
  if (day === today) {
    return "Today";
  }
  if (day === shiftIsoDate(today, -1)) {
    return "Yesterday";
  }
  const monday = mondayOfWeek(today);
  if (day >= monday && day < today) {
    return "Earlier this week";
  }
  return "Earlier";
}

export const RECENCY_GROUPS: RecencyGroup[] = [
  "Today",
  "Yesterday",
  "Earlier this week",
  "Earlier",
];

export type TaskDueGroup = "Overdue" | "Today" | "Upcoming" | "No date";

export function taskDueGroup(due: string | undefined, tone?: DueTone): TaskDueGroup {
  if (!due) {
    return "No date";
  }
  if (tone === "overdue" || (!tone && due < todayInNewYork())) {
    return "Overdue";
  }
  if (tone === "today" || (!tone && due === todayInNewYork())) {
    return "Today";
  }
  return "Upcoming";
}

export const TASK_DUE_GROUPS: TaskDueGroup[] = ["Overdue", "Today", "Upcoming", "No date"];

/** Home Recents and Open tasks widgets. Recents page and the task collection stay uncapped. */
export const HOME_WIDGET_LIMIT = 5;

const TASK_DUE_GROUP_RANK: Record<TaskDueGroup, number> = {
  Overdue: 0,
  Today: 1,
  Upcoming: 2,
  "No date": 3,
};

/** Overdue (oldest due first), today, upcoming (soonest first), then undated by title. */
export function compareOpenTasks(
  a: { title: string; due?: string; due_tone?: DueTone },
  b: { title: string; due?: string; due_tone?: DueTone },
): number {
  const leftGroup = taskDueGroup(a.due, a.due_tone);
  const rightGroup = taskDueGroup(b.due, b.due_tone);
  if (leftGroup !== rightGroup) {
    return TASK_DUE_GROUP_RANK[leftGroup] - TASK_DUE_GROUP_RANK[rightGroup];
  }
  if (a.due && b.due && a.due !== b.due) {
    return a.due < b.due ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

/** Newest `updated_at` first; title as a stable tie-break. */
export function compareRecentRows(
  a: { title: string; updated_at: string },
  b: { title: string; updated_at: string },
): number {
  if (a.updated_at !== b.updated_at) {
    return a.updated_at < b.updated_at ? 1 : -1;
  }
  return a.title.localeCompare(b.title);
}

export function truncate(value: string, max = 22): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export type SearchSnippetPart = { text: string; hit: boolean };

function stripHeadlineTags(text: string): string {
  return text.replace(/<\/?b>/gi, "");
}

/** Split a Postgres ts_headline snippet so `<b>` marks become emphasis, not raw tags. */
export function parseSearchSnippet(snippet: string): SearchSnippetPart[] {
  const parts: SearchSnippetPart[] = [];
  const re = /<b>(.*?)<\/b>/gi;
  let last = 0;
  for (const match of snippet.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) {
      const plain = stripHeadlineTags(snippet.slice(last, index));
      if (plain) {
        parts.push({ text: plain, hit: false });
      }
    }
    parts.push({ text: match[1] ?? "", hit: true });
    last = index + match[0].length;
  }
  const tail = stripHeadlineTags(snippet.slice(last));
  if (tail) {
    parts.push({ text: tail, hit: false });
  }
  return parts;
}
