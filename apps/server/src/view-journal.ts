import { randomUUID } from "node:crypto";
import { findLiveJournalOnDay, getNodeByIdempotencyKey, type Pool } from "@foundation/db";
import { isToolError, todayInNewYork } from "@foundation/schema";
import { upsertGraphNode } from "./graph.js";
import { viewNode } from "./view-data.js";

const VIEWER_WRITER = { actor: "user" as const, actor_label: "Viewer" };

export function journalDayTitle(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    return day;
  }
  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(stamp));
}

export function journalMarkdownPayload(body: string) {
  return { media_type: "text/markdown" as const, storage: "inline" as const, body };
}

function todayJournalKey(day: string): string {
  return `view-journal-${day}`;
}

export async function viewJournalTodayPeek(pool: Pool, dataDir: string) {
  const day = todayInNewYork();
  const existing = await findLiveJournalOnDay(pool, day);
  if (!existing) {
    return { node: null as null };
  }
  return viewNode(pool, existing.id, dataDir);
}

export async function viewJournalToday(pool: Pool, dataDir: string) {
  const day = todayInNewYork();
  const existing = await findLiveJournalOnDay(pool, day);
  if (existing) {
    return viewNode(pool, existing.id, dataDir);
  }
  const stable = todayJournalKey(day);
  const prior = await getNodeByIdempotencyKey(pool, stable, { includeDeleted: true });
  const key = prior?.deleted_at ? `${stable}-${randomUUID()}` : stable;
  const created = await upsertGraphNode(pool, {
    type: "journal",
    title: journalDayTitle(day),
    payload: journalMarkdownPayload(""),
    idempotency_key: key,
    allow_duplicate: true,
    ...VIEWER_WRITER,
  });
  if (isToolError(created)) {
    return created;
  }
  return viewNode(pool, created.node.id, dataDir);
}

export async function viewJournalWrite(
  pool: Pool,
  dataDir: string,
  input: { id: string; title: string; body: string; base_updated_at: string },
) {
  const current = await viewNode(pool, input.id, dataDir);
  if ("error" in current) {
    return current;
  }
  if (current.node.type !== "journal") {
    return { error: "Journal writes only.", suggestion: "Open a journal record." };
  }
  const title = input.title.trim();
  if (!title) {
    return { error: "Title is required.", suggestion: "Keep a title on the first line." };
  }
  const written = await upsertGraphNode(pool, {
    id: input.id,
    type: "journal",
    title,
    payload: journalMarkdownPayload(input.body),
    base_updated_at: input.base_updated_at,
    ...VIEWER_WRITER,
  });
  if (isToolError(written)) {
    return written;
  }
  return viewNode(pool, written.node.id, dataDir);
}
