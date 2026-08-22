---
name: foundation-mcp
description: Pick which vault MCP call to use. Use when a pasted bot first attaches or must choose a vault call. Recipe only, not a tool catalog.
---

# Foundation MCP

This skill picks the vault call. It is not a tool list.

The user is the human who runs Compose. The vault MCP is on this machine (`http://127.0.0.1:8787`). Stay on localhost. Do not tell anyone to expose it.

Look up the live schema at call time (`bootstrap`, `inspect_ontology`, or the server tool list). Do not trust a dump in this file.

## Which call

- `bootstrap` — first attach / what tools and spine exist
- `lookup` — a name, not a UUID yet
- `get` — already have a UUID, need the current picture (not activity)
- `list_activity` — already have a UUID, need the diary for that node (`target`)
- `working_set` — already have a UUID, need the open work around it
- `search` — list or find without a bound id. `search` `{ living }` finds a Gmail, Calendar, or Drive object. `search` `{ code }` finds a GitHub object. `search` `{ receipt }` looks up a sent-mail or cleared-event pointer, then `get`. Same tool, not a new verb.
- `upsert` — write or patch a node; passing `payload` replaces that body. A bot writes `data.receipt` after send or clear. The server does not invent it.
- `link` — accept a suggested edge or hang a child

A node is what is true now, short. History stays in activity. To rewrite one node: `get` → `list_activity` `{ target }` → keep what still matters, invent nothing → `upsert` the same id with a short `payload` and `base_updated_at`. One node at a time. Not a background job. The server does not invent the picture.

## Confirm

Destructive calls (`delete`, `unlink`, `undo`, `manage_type` retire) need `confirm: true`.
