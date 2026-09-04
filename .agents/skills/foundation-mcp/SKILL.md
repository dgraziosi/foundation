---
name: foundation-mcp
description: Pick which vault MCP call to use. Use when a pasted bot first attaches or must choose a vault call. Recipe only, not a tool catalog.
---

# Foundation MCP

This skill picks the vault call. It is not a tool list.

The user is the human who runs this vault on this machine. The vault MCP is on this machine (`http://127.0.0.1:8787`). Stay on localhost. Do not tell anyone to expose it.

Look up the live schema at call time (`bootstrap`, `inspect_ontology`, or the server tool list). Input parameter docs on that list come from Zod `.describe()`. Do not trust a dump in this file.

## Which call

- `bootstrap` — first attach / what tools and spine exist
- `lookup` — a name, not a UUID yet
- `get` — already have a UUID, need the record (not activity)
- `list_activity` — already have a UUID, need the diary for that record (`target`). After a full page, send `cursor`. Read `count`. Omit `fields` and `diff_only` for the full snapshot. `fields` asks for a subset of activity keys. `diff_only: true` returns a lean before/after. Undo still uses the stored snapshot.
- `working_set` — already have a UUID, need the open work around it. Depth, hard cap, and the spine-root due window read the vault settings row.
- `search` — list or find without a bound id. After a full page, send `cursor`. Read `count`. `search` `{ url }` finds a Gmail, Calendar, or Drive object. `search` `{ repo }` finds a GitHub object. `search` `{ receipt }` looks up a sent-mail or cleared-event receipt, then `get`. Same tool, not a new verb. `due: today` and `overdue` use the vault settings timezone (seed America/New_York). No settings tool.
- `upsert` — write or patch a record; passing `payload` replaces that body. A bot writes `data.receipt` after send or clear. The server does not invent it. Changing `type` revalidates live incident edges and refuses if one would no longer be allowed (unlink first).
- `link` — accept a suggested edge or hang a child. Suggestions and `child_of` placement read live `kind`, `parent_types`, and `target_types`, not a frozen slug list.
- `manage_relation` — create or update a relation. System relations may edit `source_types` and `target_types`. Slug, kind, label, and symmetry stay locked.
- `delete` — soft-delete a live node. Refuses when a live `ref` field still points at that id (clear the field first).
- `job` — claim a named instance routine before a pass (`dream`, `vault-health`, `activity-prune`, …). Keep the token. A second live claim fails. `finish` records last run. `release` opens without recording. `read` is who and last run. Not a graph write and not `get_vault_health`. Activity prune itself is the host script `scripts/activity-prune.sh`.

A record is what is true now, short. History stays in activity. To rewrite one record: `get` → `list_activity` `{ target }` → keep what still matters, invent nothing → `upsert` the same id with a short `payload` and `base_updated_at`. One record at a time. Not a background job. The server does not invent the body.

## Destructive scope

Destructive calls (`delete`, `unlink`, `undo`, `manage_type` retire) need a key with destructive scope. Ordinary upsert and link do not. `delete`, `unlink`, and node or edge `undo` also need if-match timestamps from `get`.
