---
name: dream
description: Nightly vault pass. Use when Vault Keeper's Dream routine runs, or when the user asks to run Dream. Rewrites one record at a time from that record's own activity. Invents nothing.
---

# Dream

You are running Dream. Dream is the nightly vault pass. The user can run this, or attach it to Vault Keeper.

Dream rewrites the record from today's activity, closes what's done, and cleans obvious duplicates. One record at a time. Invent nothing.

Cite [`.agents/skills/foundation-mcp/`](../foundation-mcp/) for which vault call to use. Cite [`.agents/skills/handoff/`](../handoff/) when a step finishes. Look up the live vault schema at call time (`bootstrap`, `inspect_ontology`, or the server tool list). Do not trust a dump in this file.

The user is the human who runs Compose. The vault MCP is on this machine (`http://127.0.0.1:8787`). Stay on localhost. Do not tell anyone to expose it.

A **record** is the node (the system of record). **Activity** is the audit log. History stays in activity. Do not call the graph “the Vault.”

Vault Keeper still does not invent life facts. A bot running Dream may rewrite a record from that record's own activity.

## Schedule and voice

02:00, all 7 nights, user-local. Overnight on purpose. Run Dream before backup when both exist. If a morning brief also exists, that clock is 08:00 user-local. Put these clocks on the bot's Routines. Do not add a live instance cron in git.

Quiet when the pass finished and nothing needs the user. Ping the user when you stopped because the activity does not say what is true, or when a destructive call needs `confirm`.

This pass rewrites records that moved. Vault health, nightly backup, the weekly graph report ([`.agents/skills/graph-hygiene/`](../graph-hygiene/)), and product updates have their own schedules. That weekly report stays a report. Do not turn this pass into that report.

## What Dream is not

- Not Letta sleep-time compute. Do not precompute the next query.
- Not Mem0 chat extract. Do not ingest mail or chat.
- Do not invent insight records.
- Do not write dues into standing harness memory. Dues stay on the record.
- Not a new vault call. Use `get`, `list_activity`, `upsert`, and `search`. Destructive calls (`delete`, `unlink`, `undo`, `manage_type` retire) need `confirm: true`.
- Not a Viewer pass.

## Pass

One record at a time. Invent nothing. The server does not invent a summary.

1. Find records that moved on the last waking day. A 02:00 pass is already on the next calendar day, so `search` `{ since }` must use the start of yesterday in the user's local zone as ISO-8601. That lists live records whose `updated_at` is on or after that stamp. This is not the due `today` filter (that clock is America/New_York). Raise `limit` if the live schema allows; if you hit the cap, stop a full dump — there is no `list_nodes`. `list_activity` `{ since }` (no target) lists last waking day's writes when you need the audit log first. Take record ids only: when `target_kind` is `node`, take `target_id`; when `target_kind` is `edge`, take `from_id` and `to_id` from `before` / `after`. Skip `type` and `relation` rows — `get` will not load those ids. Linking does not bump a record's `updated_at`. Cite foundation-mcp for which call.

2. For each record, in order:
   1. `get` that id — the record as it stands, plus `updated_at`.
   2. `list_activity` `{ target }` — that record's activity (`before` / `after`). Raise `limit` or walk `since` when the default page is short.
   3. Rewrite the record from today's activity. Keep what still matters. Invent nothing. Do not write a digest onto the record.
   4. If the record is still true, leave it. If it is not, `upsert` the same id with a short `payload` that is still true, any `data` patch that still belongs, and `base_updated_at` from `get`. Omit `payload` when only `data` or `status` changes.
   5. Close what's done. `status: "completed"` is vault work state. Clear `data.due` when the work is done. Do not invent a `receipt`. Do not create a new record to hold a summary.

3. Clean obvious duplicates you meet on this pass (last waking day's moved records). Do not merge. Do not delete a record just because it has no edges. A first-day vault (seed types, zero user records) is healthy — skip. If you cannot confirm a destructive call, skip and ping the user.

4. When a step finishes, name who has the work now, or say done. If a due date was added, changed, or cleared, Executive Assistant acts on the calendar in the same motion.

## Chief of Staff

Do not copy a staff list. [`prompts/chief.md`](../../../prompts/chief.md) cites this folder. Vault Keeper runs Dream at 02:00 user-local. Chief of Staff does not run it.

If a morning brief exists, that clock is 08:00 user-local.
