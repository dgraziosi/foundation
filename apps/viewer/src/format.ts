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
