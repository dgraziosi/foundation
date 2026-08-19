# Foundation MCP tools

Product contract: [`docs/SPEC.md`](./SPEC.md).

v1 surface is **13 tools**. Destructive tools require `confirm: true` or they return `{ error, suggestion }`. Identity is UUID. If you already have a UUID, call `get` — do not `search`. To resolve one or more entity names, call `lookup` — do not serial-search. Ontology mutations apply immediately (activity log + `undo`; no proposal inbox).

| Tool | Purpose |
| --- | --- |
| `bootstrap` | Return starter ontology, how to extend it, and current type/relation inventory. Call first. |
| `search` | Find nodes by text query and/or filters (`type`, `status`, `under`, `since`, `origin`, `due`, `due_on_or_before`, `due_on_or_after`, `data_equals`). Query is optional when a filter is set. Hits are id/type/title/snippet plus `due` when set. |
| `lookup` | Resolve one or more names to live nodes. One result per input (`exact` / `alias` / `candidate` / `ambiguous` / `no_match`). Read-only. |
| `get` | Fetch a node by id, including payload, incident edges with neighbor titles, and `suggested_links` from title FTS. Blob payloads return metadata, not bytes. |
| `upsert` | Create or update a node (title, type, payload, data, status). Updates require `base_updated_at`. Create accepts `idempotency_key`. Create (no id) preflights duplicates via `lookup`. Blob ingest via `bytes_base64` or `source_path`. Returns `suggested_links` (proposals only). |
| `delete` | Soft-delete a node. Requires `confirm: true`. |
| `link` | Create a typed edge after validation. Requires `from_base_updated_at` and `to_base_updated_at`. |
| `unlink` | Remove a typed edge. Requires `confirm: true`. |
| `inspect_ontology` | List type and relation registry rows (system + authored). |
| `manage_type` | Create, update, or retire a node type. Applies immediately. Retire requires `confirm: true`. |
| `manage_relation` | Create or update a relation type. Applies immediately. |
| `list_activity` | Read the activity log (filter by action, target, since). |
| `undo` | Reverse a reversible activity row by id. Requires `confirm: true`. Type-create undo with leftover deleted nodes needs `purge_deleted: true`. |

Handler contract: each tool has one zod input schema and one output schema; JSON Schema on the wire is derived; invalid input never reaches the domain; domain errors are `{ error, suggestion? }`.

## Parameters

### `bootstrap`

- **In:** none
- **Out:** `{ spine, types, relations, rules, how_to_extend }`
- `how_to_extend` includes `manage_type`, `manage_relation`, `nodes`, `links`, `activity`, `search`, and `lookup`. Summary notes that vault health, graph hygiene, and applying git updates are instance routines, not tools ([`docs/VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`docs/GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/)). No `get_vault_health` tool.

### `get`

- **In:** `{ id, include_body? }`
- **Out:** `{ node, edges: [{ id, from_id, to_id, relation_type, direction, metadata, created_at, neighbor: { id, title, type } }], blob?, suggested_links }` or `{ error, suggestion? }`
- Each incident edge includes **neighbor title and type**, not UUID-only hops. Use those titles to `search` or `get` the other node.
- `suggested_links` is the same title-FTS list as `upsert` (skip self and already-linked; no second `child_of` parent; cap 5). Useful when a later `get` still has no edges. Empty → `[]`. Never writes an edge.
- Inline payloads still return `payload.body`. Blob payloads return `{ storage: "blob", blob_id, media_type }` plus `blob: { id, sha256, media_type, byte_size, path }`. Bytes are **not** dumped into the JSON by default.
- `include_body: true` may add base64 `payload.body` for small blobs (256KB cap). Larger files: HTTP `GET /blobs/:id` with `Authorization: ApiKey <FOUNDATION_API_KEY>`.

### `upsert`

- **In:** `{ id?, type, title, payload?, data?, status?, metadata?, base_updated_at?, idempotency_key?, allow_duplicate?, actor?, actor_label? }`
- **Out:** `{ node, activity_id, suggested_links, duplicate_warnings? }` or `{ error, suggestion?, outcome?, candidates? }`
- **`suggested_links`:** Postgres FTS on the new title (create, and update when the title changes) — not embeddings. Each item is `{ kind, target: { id, type, title }, reason }`. `kind` is a seed relation: `child_of`, `about`, or `relates_to`. `target` is a **live** node that already exists. How they are chosen: spine types with `parent_types` → `child_of` a live allowed parent whose title matches; if the title looks like a person already in the graph → `about` that person; otherwise `relates_to` a close title match of any type. Skip self. Skip nodes already linked to this one. A node with a live `child_of` is not offered a second parent (`about` / `relates_to` may still appear). Cap 5. Empty graph or no match → `[]`. **Never creates an edge.** Never adds a type or relation. `link` is how an accepted suggestion becomes an edge. Show non-empty suggestions and ask before calling `link`.
- `payload`: `{ media_type, storage: "inline"|"blob", body?, blob_id?, bytes_base64?, source_path? }`
- Inline media types: `text/markdown`, `text/html`, `application/json`, `text/plain`.
- **Blob ingest (no browser, no S3):** pass exactly one of:
  1. `bytes_base64` — MCP-native; good for small files. Size cap **20MB** (decoded). JSON body limit is 32MB so a 20MB file can round-trip.
  2. `source_path` — relative file under `$FOUNDATION_DATA/uploads` (filename or `uploads/filename`). The server **moves** it to `$FOUNDATION_DATA/blobs/<uuid>`. Rejects `..` and absolute paths.
  3. `blob_id` — attach an already-ingested blob (sha256 dedup may reuse an existing row).
- Stored payload is `{ storage: "blob", blob_id, media_type }`. Over cap → `{ error, suggestion }`.
- Omit `id` to create. Pass `id` to update, or to create with a chosen UUID.
- **Update if-match:** when `id` already exists, `base_updated_at` is required and must match the node's current `updated_at` at millisecond precision (the instant `get` returns). Mismatch or omit → `{ error, suggestion }` (call `get` and retry). A CAS miss is stale, never “node not found.” This is lost-update protection, not a write-ACL.
- **`data` merges** on update (`JSONB ||`, top-level keys). A partial `data` patch does not wipe other keys. Omit `data` to leave it unchanged.
- **`json_schema`:** if the type has `json_schema`, upsert validates the **merged** `data` object against it. Miss → `{ error, suggestion }` (inspect_ontology, fix data or the type schema). Types with `json_schema: null` skip this check. Seed `task` and `goal` schemas accept optional `data.due` (`YYYY-MM-DD`); omit it and the node still writes.
- **`data.due`:** optional ISO date on `task` and `goal`. Stored on the JSONB `data` object. Pass `due: null` to clear. `get` returns it on `node.data`; search hits also surface `due` so briefs do not have to open every node.
- **`data.origin`:** optional `{ system, id }` for `gmail` | `calendar` | `drive` | `github`. Unique on **live** nodes. Look up with `search` `{ origin }` (or `get` once you have the UUID) so agents do not twin people. Foundation stores the ref only — **never fetch or mirror** those systems' bodies.
- **`data.aliases`:** optional string array of operator-authored alternate names (any type). Validated only when the incoming `data` patch includes `aliases`. `aliases: []` clears. Explicit malformed values refuse, including values that fold empty after `name_norm` (punctuation-only). A successful aliases patch leaves a well-formed non-empty array, or is `[]`. Omit the key to leave aliases unchanged (including legacy malformed values). `lookup` ignores malformed stored aliases. Alias dedupe uses the same fold as SQL `foundation_name_norm`.
- **Create duplicate preflight:** when `id` is omitted, `upsert` runs the same matcher as `lookup` on `{ name: title, type }`. Exact title or unique exact alias (or an exact-tier collision) returns `{ error: "duplicate_candidates", suggestion, outcome, candidates }` and does not write. Pass `allow_duplicate: true` to write a same-name entity anyway. Token, fuzzy, and space-compacted matches set `duplicate_warnings` and still write. `confidence` on those candidates ranks only — it does not authorize the write. Updates (`id` present) and CAS are unchanged.
- **Create idempotency:** `idempotency_key` on create. A retry with the same key returns the existing node and original `activity_id` — it does not twin. A key already used by a deleted node refuses (undo, or a new key).
- **`actor` / `actor_label`:** optional who-wrote fields stored on the activity row (`actor` is `agent` | `user` | `system`; default `agent`). Not a permission gate.

### `delete`

- **In:** `{ id, confirm: true, actor?, actor_label? }`
- **Out:** `{ ok, activity_id }` or `{ error, suggestion? }`
- Soft-delete (`deleted_at`). `get` hides deleted nodes. Incident edges stay in place for undo; `get` and `link` validation ignore edges to deleted endpoints. Reparenting drops a stale `child_of` to a deleted parent so uniqueness matches the live graph, and records an `unlink` activity row with a `before` snapshot of the dropped edge. Restore via `undo` of the delete row. Soft-delete does **not** delete blob bytes (so undo can restore a blob node).

### `link`

- **In:** `{ from_id, to_id, relation_type, upgrade?, metadata?, from_base_updated_at?, to_base_updated_at?, actor?, actor_label? }`
- **Out:** `{ edge, activity_id, suggestion? }` or `{ error, suggestion? }`
- Validation: [`packages/schema`](../packages/schema) `validateLink` (unknown relation, self-link, duplicate, symmetric duplicate, constraints, `child_of` uniqueness / `parent_types`). `relates_to` that fits the spine **suggests** `child_of`; it does not rewrite unless `upgrade: true`. Duplicate checks run on the proposed relation **before** the optional `relates_to` → `child_of` upgrade.
- **If-match:** `from_base_updated_at` and `to_base_updated_at` are required and must match each endpoint's current `updated_at` from `get`. Stale or missing → `{ error, suggestion }` (get both nodes and retry). Not a write-ACL.
- Optional `actor` / `actor_label` are stored on the activity row (who wrote). Not a permission gate.
- Edges table is the only source of truth.

### `unlink`

- **In:** `{ from_id, to_id, relation_type, confirm: true, actor?, actor_label? }`
- **Out:** `{ ok, activity_id }` or `{ error, suggestion? }`

### `inspect_ontology`

- **In:** `{ kind?: "types"|"relations"|"all" }`
- **Out:** `{ types, relations }`

### `manage_type`

- **In:** `{ action: "create"|"update"|"retire", slug, label?, description?, kind?, parent_types?, json_schema?, confirm?, purge_deleted?, actor?, actor_label? }`
- **Out:** `{ type, activity_id }` or `{ error, suggestion? }`
- Applies immediately. System types: description only; system slugs cannot be retired. Custom types may set `parent_types` so `child_of` placement works.
- **Retire:** `action: "retire"` with `confirm: true` drops an authored type that has **zero live nodes**. System seed types refuse. Live nodes refuse with `{ error, suggestion }` (delete or retype, then retry). Soft-deleted nodes of that type stay restorable — same family as undo-of-type-create: restore those deletes first, or pass `purge_deleted: true` (with `confirm: true`) to hard-delete the tombstones and their incident edges. Never a silent vault wipe. Undo of retire restores the registry row.

### `manage_relation`

- **In:** `{ action: "create"|"update", slug, label?, description?, kind?, source_types?, target_types?, is_symmetric?, semantic_parent_slug?, actor?, actor_label? }`
- **Out:** `{ relation, activity_id }` or `{ error, suggestion? }`
- Applies immediately. System relations: description only.

### `search`

- **In:** `{ query?, type?, status?, under?, since?, origin?, due?, due_on_or_before?, due_on_or_after?, data_equals?, limit? }`
- **Out:** `{ nodes: [{ id, type, title, status, snippet, due? }], suggestion? }` or `{ error, suggestion? }`
- Postgres FTS on `title` (weighted highest) + string values from `data` + extracted inline payload text. HTML: tag text plus `alt` / `title` / `aria-label` / `placeholder`. JSON: string values from the parsed body — **not** `JSON.stringify` of the payload wrapper (`media_type`, `storage`, …). Latin diacritics are folded (`fiancee` matches `fiancée` and vice versa). Soft-deleted nodes are excluded. Lexical recall only (no embeddings).
- **`query` is optional** when `type`, `status`, `under`, `since`, `origin`, `due`, `due_on_or_before`, `due_on_or_after`, or `data_equals` is set. That is how agents list without a word: all people (`type: "person"`), all open tasks (`type: "task", status: "active"`), overdue or due-today (`due: "overdue"` | `"today"`), due on or before a date (`due_on_or_before: "2026-08-27"`), children of a parent (`under: <parent uuid>` = live `child_of`), nodes updated `since` an ISO-8601 timestamp, or nodes whose top-level `data` keys equal a value (`data_equals: { kind: "…", status: "…" }`). Empty `{}` → `{ error, suggestion }` (do not add `list_nodes`).
- `due: "overdue" | "today"` uses **America/New_York** for “today.” `due_on_or_before` / `due_on_or_after` are inclusive ISO dates (`YYYY-MM-DD`) against `data.due`. Nodes without `data.due` do not match a due filter.
- `data_equals` is JSONB containment (`data @> …`) on one or a few top-level keys (at most 8; lowercase identifiers). Not a column per key. Nodes missing those keys do not match. Combine with `type` / other filters.
- `origin: { system, id }` looks up the unique live `data.origin` ref (`gmail` | `calendar` | `drive` | `github`).
- Hits are lean (id/type/title/snippet, plus `due` when `data.due` is set). Call `get` to load payload and neighbor titles.
- If `query` is a UUID, search resolves it like `get` and returns `suggestion` to prefer `get` next time.
- **An empty lexical result is not a license to upsert a duplicate.** The `suggestion` says so. Try a shorter token or a type filter; only upsert if the entity is new. If you already have a UUID, call `get`. An origin miss means you may upsert with that `data.origin` (ref only). To resolve one or more entity names to UUIDs, call `lookup`.

### `lookup`

- **In:** `{ inputs: [{ name, type?, id? }], type?, limit? }`
- **Out:** `{ results: [{ input, outcome, candidates, suggestion? }] }` or `{ error, suggestion? }`
- `inputs` is required (1–20). Each `name` is 1–200 characters. Optional `id` is echoed for correlation. Top-level `type` applies when an input omits `type`. `limit` is candidates per input (default 5, max 10).
- One result per input, same order, even when some names miss.
- `outcome` is `exact` | `alias` | `candidate` | `ambiguous` | `no_match`.
  - `exact` — unique live UUID, or unique title after `name_norm` (case, accent, punctuation, whitespace).
  - `alias` — unique exact operator-authored `data.aliases` entry; title did not exact-match.
  - `candidate` — token or fuzzy (including compact/no-space) matches. Never authoritative, even with a high `confidence`.
  - `ambiguous` — duplicate exact titles, or title exact and alias exact on different nodes.
  - `no_match` — nothing above the floor.
- Candidates are `{ id, type, title, status, updated_at, confidence, match, matched_value, explanation }`. `title` is the canonical node title. `updated_at` is for a later if-match upsert or link. `confidence` is algorithmic rank, not a calibrated probability, and does not authorize a write. `match` is `title_exact` | `alias_exact` | `title_fuzzy` | `alias_fuzzy` | `title_token` | `uuid`. The surrounding list is `candidates` on that result.
- Soft-deleted nodes are excluded. Title matching uses generated `title_norm` / `title_compact` plus trigram indexes. Aliases are unnested from JSONB (well-formed string arrays only).
- Read-only. Never writes, merges, creates, or picks an ambiguous candidate. For `candidate` or `ambiguous`, ask the operator to confirm a UUID before any mutation that depends on the identity. `get` is safe for inspection.
- If you already have a UUID, call `get`. Listing, origin refs, due filters, and payload search stay on `search`. Lexical recall only, not embeddings. No hidden nickname list.

### `list_activity`

- **In:** `{ action?, target?, since?, limit? }`
- **Out:** `{ activities }`
- `target` is `target_id` (node UUID, edge UUID, or type/relation slug). `since` is an ISO-8601 timestamp. Rows include `actor`, `actor_label`, `before` / `after`, `reversible`, `undo_token`, `token_expires_at`, and `undone_at`. `actor` / `actor_label` record who wrote; they are not a permission gate.
- Blob node snapshots store `payload.blob_id` plus `blob: { blob_id, sha256, byte_size, media_type }` — not PDF/file bytes.

### `undo`

- **In:** `{ id, confirm: true, purge_deleted?, actor?, actor_label? }` (`id` is an activity row id)
- **Out:** `{ ok, activity_id }` or `{ error, suggestion? }`
- `activity_id` is the compensating row (`reversible = false`). Invert map:

| action | inverse |
| --- | --- |
| create node | soft-delete |
| update node | restore `before` payload/data/title/type/status |
| delete node | clear `deleted_at` (restore) |
| link | delete that edge |
| unlink | re-insert edge from `before` |
| type/relation create | delete registry row if unused; else refuse |
| type/relation update | restore `before` row |
| type retire | restore registry row from `before` |

Live nodes of a type still block type-create undo and `manage_type` retire. Soft-deleted nodes stay restorable via undo-of-delete while the type row exists. If only tombstones remain, undo (or retire) returns `{ error, suggestion }`: restore those nodes first, or pass `purge_deleted: true` (with `confirm: true`) to hard-delete the tombstones and their incident edges, write unlink activity, and mark those prior delete rows non-reversible. Type-create undo and type retire never silently purge.

Undo tokens are single-use (`undone_at`; token cleared). Expired tokens refuse. Undo of undo is the compensating row (`reversible = false`).

## HTTP (not an MCP tool)

- `GET /blobs/:id` — raw bytes. Requires `Authorization: ApiKey <FOUNDATION_API_KEY>` (Bearer accepted). The unlock cookie is not a credential here. `Content-Type` is the blob `media_type`, except HTML/SVG and other scriptable types which are `application/octet-stream`. Always `Content-Disposition: attachment` so a browser does not run the file as a page on this origin. This is how agents fetch large files without inlining them in MCP JSON.
- `GET /view/blobs/:id` — same bytes, same store, for the read-only window. Unlock cookie or Authorization header. Same attachment / scriptable-type rules. The cookie still does not unlock `/mcp` or `/blobs/:id`.
- Files live at `$FOUNDATION_DATA/blobs/<uuid>` (directory mode 0700). `FOUNDATION_DATA` must not be an agent profile/memory directory.

## Not in v1

Restore as a separate tool (use `undo`), hierarchy tree, a dedicated parent-suggestion tool (title-FTS `suggested_links` already return on `upsert` / `get`; `link` writes the edge), habit logging, a dedicated blob-upload tool (ingest is on `upsert`), embeddings admin, memories, pending proposals, chat presentation, web search, skills, `get_vault_health` / `run_maintenance` / `audit_links` (instance routines instead: [vault health](./VAULT_HEALTH.md), [graph hygiene](./GRAPH_HYGIENE.md), [apply product updates](../.agents/skills/update-foundation/)).
