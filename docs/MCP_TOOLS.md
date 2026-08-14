# Foundation MCP tools

Product contract: [`docs/SPEC.md`](./SPEC.md).

v1 surface is **12 tools**. Destructive tools require `confirm: true` or they return `{ error, suggestion }`. Identity is UUID. If you already have a UUID, call `get` — do not `search`. Ontology mutations apply immediately (activity log + `undo`; no proposal inbox).

| Tool | Purpose |
| --- | --- |
| `bootstrap` | Return starter ontology, how to extend it, and current type/relation inventory. Call first. |
| `search` | Find nodes by text query and/or filters (`type`, `status`, `under`, `since`, `origin`). Query is optional when a filter is set. Hits are id/type/title/snippet. |
| `get` | Fetch a node by id, including payload and incident edges with neighbor titles. Blob payloads return metadata, not bytes. |
| `upsert` | Create or update a node (title, type, payload, data, status). Updates require `base_updated_at`. Create accepts `idempotency_key`. Blob ingest via `bytes_base64` or `source_path`. |
| `delete` | Soft-delete a node. Requires `confirm: true`. |
| `link` | Create a typed edge after validation. Requires `from_base_updated_at` and `to_base_updated_at`. |
| `unlink` | Remove a typed edge. Requires `confirm: true`. |
| `inspect_ontology` | List type and relation registry rows (system + authored). |
| `manage_type` | Create or update a node type. Applies immediately. |
| `manage_relation` | Create or update a relation type. Applies immediately. |
| `list_activity` | Read the activity log (filter by action, target, since). |
| `undo` | Reverse a reversible activity row by id. Requires `confirm: true`. Type-create undo with leftover deleted nodes needs `purge_deleted: true`. |

Handler contract: each tool has one zod input schema and one output schema; JSON Schema on the wire is derived; invalid input never reaches the domain; domain errors are `{ error, suggestion? }`.

## Parameters

### `bootstrap`

- **In:** none
- **Out:** `{ spine, types, relations, rules, how_to_extend }`
- `how_to_extend` includes `manage_type`, `manage_relation`, `nodes`, `links`, `activity`, and `search`. Summary notes that vault health, graph hygiene, and applying git updates are instance routines, not tools ([`docs/VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`docs/GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`prompts/update-foundation.md`](../prompts/update-foundation.md)). No `get_vault_health` tool.

### `get`

- **In:** `{ id, include_body? }`
- **Out:** `{ node, edges: [{ id, from_id, to_id, relation_type, direction, metadata, created_at, neighbor: { id, title, type } }], blob? }` or `{ error, suggestion? }`
- Each incident edge includes **neighbor title and type**, not UUID-only hops. Use those titles to `search` or `get` the other node.
- Inline payloads still return `payload.body`. Blob payloads return `{ storage: "blob", blob_id, media_type }` plus `blob: { id, sha256, media_type, byte_size, path }`. Bytes are **not** dumped into the JSON by default.
- `include_body: true` may add base64 `payload.body` for small blobs (256KB cap). Larger files: HTTP `GET /blobs/:id` with `Authorization: ApiKey <FOUNDATION_API_KEY>`.

### `upsert`

- **In:** `{ id?, type, title, payload?, data?, status?, metadata?, base_updated_at?, idempotency_key?, actor?, actor_label? }`
- **Out:** `{ node, activity_id }` or `{ error, suggestion? }`
- `payload`: `{ media_type, storage: "inline"|"blob", body?, blob_id?, bytes_base64?, source_path? }`
- Inline media types: `text/markdown`, `text/html`, `application/json`, `text/plain`.
- **Blob ingest (no browser, no S3):** pass exactly one of:
  1. `bytes_base64` — MCP-native; good for small files. Size cap **20MB** (decoded). JSON body limit is 32MB so a 20MB file can round-trip.
  2. `source_path` — relative file under `$FOUNDATION_DATA/uploads` (filename or `uploads/filename`). The server **moves** it to `$FOUNDATION_DATA/blobs/<uuid>`. Rejects `..` and absolute paths.
  3. `blob_id` — attach an already-ingested blob (sha256 dedup may reuse an existing row).
- Stored payload is `{ storage: "blob", blob_id, media_type }`. Over cap → `{ error, suggestion }`.
- Omit `id` to create. Pass `id` to update, or to create with a chosen UUID.
- **Update if-match:** when `id` already exists, `base_updated_at` is required and must match the node's current `updated_at`. Mismatch or omit → `{ error, suggestion }` (call `get` and retry). This is lost-update protection, not a write-ACL.
- **`data` merges** on update (`JSONB ||`, top-level keys). A partial `data` patch does not wipe other keys. Omit `data` to leave it unchanged.
- **`json_schema`:** if the type has `json_schema`, upsert validates the **merged** `data` object against it. Miss → `{ error, suggestion }` (inspect_ontology, fix data or the type schema). Types with `json_schema: null` skip this check.
- **`data.origin`:** optional `{ system, id }` for `gmail` | `calendar` | `drive` | `github`. Unique on **live** nodes. Look up with `search` `{ origin }` (or `get` once you have the UUID) so agents do not twin people. Foundation stores the ref only — **never fetch or mirror** those systems' bodies.
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

- **In:** `{ action: "create"|"update", slug, label?, description?, kind?, parent_types?, json_schema?, actor?, actor_label? }`
- **Out:** `{ type, activity_id }` or `{ error, suggestion? }`
- Applies immediately. System types: description only; system slugs cannot be deleted. Custom types may set `parent_types` so `child_of` placement works.

### `manage_relation`

- **In:** `{ action: "create"|"update", slug, label?, description?, kind?, source_types?, target_types?, is_symmetric?, semantic_parent_slug?, actor?, actor_label? }`
- **Out:** `{ relation, activity_id }` or `{ error, suggestion? }`
- Applies immediately. System relations: description only.

### `search`

- **In:** `{ query?, type?, status?, under?, since?, origin?, limit? }`
- **Out:** `{ nodes: [{ id, type, title, status, snippet }], suggestion? }` or `{ error, suggestion? }`
- Postgres FTS on `title` (weighted highest) + string values from `data` + extracted inline payload text. HTML: tag text plus `alt` / `title` / `aria-label` / `placeholder`. JSON: string values from the parsed body — **not** `JSON.stringify` of the payload wrapper (`media_type`, `storage`, …). Latin diacritics are folded (`fiancee` matches `fiancée` and vice versa). Soft-deleted nodes are excluded. Lexical recall only (no embeddings).
- **`query` is optional** when `type`, `status`, `under`, `since`, or `origin` is set. That is how agents list without a word: all people (`type: "person"`), all open tasks (`type: "task", status: "active"`), children of a parent (`under: <parent uuid>` = live `child_of`), or nodes updated `since` an ISO-8601 timestamp. Empty `{}` → `{ error, suggestion }` (do not add `list_nodes`).
- `origin: { system, id }` looks up the unique live `data.origin` ref (`gmail` | `calendar` | `drive` | `github`).
- Hits are lean (id/type/title/snippet). Call `get` to load payload and neighbor titles.
- If `query` is a UUID, search resolves it like `get` and returns `suggestion` to prefer `get` next time.
- **An empty lexical result is not a license to upsert a duplicate.** The `suggestion` says so. Try a shorter token or a type filter; only upsert if the entity is new. If you already have a UUID, call `get`. An origin miss means you may upsert with that `data.origin` (ref only).

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

Live nodes of a type still block type-create undo. Soft-deleted nodes stay restorable via undo-of-delete while the type row exists. If only tombstones remain, undo returns `{ error, suggestion }`: restore those nodes first, or pass `purge_deleted: true` (with `confirm: true`) to hard-delete the tombstones and their incident edges, write unlink activity, and mark those prior delete rows non-reversible. Type-create undo never silently purges.

Undo tokens are single-use (`undone_at`; token cleared). Expired tokens refuse. Undo of undo is the compensating row (`reversible = false`).

## HTTP (not an MCP tool)

- `GET /blobs/:id` — raw bytes. Requires `Authorization: ApiKey <FOUNDATION_API_KEY>` (Bearer accepted). `Content-Type` is the blob `media_type`. This is how agents fetch large files without inlining them in MCP JSON.
- Files live at `$FOUNDATION_DATA/blobs/<uuid>` (directory mode 0700). `FOUNDATION_DATA` must not be an agent profile/memory directory.

## Not in v1

Restore as a separate tool (use `undo`), hierarchy tree, parent suggestion, habit logging, a dedicated blob-upload tool (ingest is on `upsert`), embeddings admin, memories, pending proposals, chat presentation, web search, skills, `get_vault_health` / `run_maintenance` / `audit_links` (instance routines instead: [vault health](./VAULT_HEALTH.md), [graph hygiene](./GRAPH_HYGIENE.md), [apply product updates](../prompts/update-foundation.md)).
