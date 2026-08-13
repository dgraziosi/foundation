# Foundation MCP tools

Canonical list and rationale: [`docs/REDESIGN.md`](./REDESIGN.md) §5. Product contract: [`docs/SPEC.md`](./SPEC.md).

v1 surface is **12 tools**. Destructive tools require `confirm: true` or they return `{ error, suggestion }`. Identity is UUID. Ontology mutations apply immediately (activity log + `undo`; no proposal inbox).

| Tool | Status | Purpose |
| --- | --- | --- |
| `bootstrap` | shipped | Return starter ontology, how to extend it, and current type/relation inventory. Call first. |
| `search` | shipped (slice 8) | Find nodes by text query and optional type filter. |
| `get` | shipped (slice 4) | Fetch a node by id, including payload and incident edges. |
| `upsert` | shipped (slice 4) | Create or update a node (title, type, payload, data, status). |
| `delete` | shipped (slice 4) | Soft-delete a node. Requires `confirm: true`. |
| `link` | shipped (slice 5) | Create a typed edge after validation. |
| `unlink` | shipped (slice 5) | Remove a typed edge. Requires `confirm: true`. |
| `inspect_ontology` | shipped (slice 6) | List type and relation registry rows (system + authored). |
| `manage_type` | shipped (slice 6) | Create or update a node type. Applies immediately. |
| `manage_relation` | shipped (slice 6) | Create or update a relation type. Applies immediately. |
| `list_activity` | shipped (slice 7) | Read the activity log (filter by action, target, since). |
| `undo` | shipped (slice 7) | Reverse a reversible activity row by id. Requires `confirm: true`. Type-create undo with leftover deleted nodes needs `purge_deleted: true`. |

Handler contract: each tool has one zod input schema and one output schema; JSON Schema on the wire is derived; invalid input never reaches the domain; domain errors are `{ error, suggestion? }`.

## Parameters (slices 4–9)

### `bootstrap`

- **In:** none
- **Out:** `{ spine, types, relations, rules, how_to_extend }`
- `how_to_extend` includes `manage_type`, `manage_relation`, `nodes`, `links`, `activity`, and `search`.

### `get`

- **In:** `{ id }`
- **Out:** `{ node, edges: [{ id, from_id, to_id, relation_type, direction, metadata, created_at }] }` or `{ error, suggestion? }`

### `upsert`

- **In:** `{ id?, type, title, payload?, data?, status?, metadata? }`
- **Out:** `{ node, activity_id }` or `{ error, suggestion? }`
- `payload`: `{ media_type, storage: "inline"|"blob", body?, blob_id? }`
- Inline media types in v1: `text/markdown`, `text/html`, `application/json`, `text/plain`. Blob storage is rejected until slice 10.
- Omit `id` to create. Pass `id` to update, or to create with a chosen UUID.

### `delete`

- **In:** `{ id, confirm: true }`
- **Out:** `{ ok, activity_id }` or `{ error, suggestion? }`
- Soft-delete (`deleted_at`). `get` hides deleted nodes. Incident edges stay in place for undo; `get` and `link` validation ignore edges to deleted endpoints. Reparenting drops a stale `child_of` to a deleted parent so uniqueness matches the live graph, and records an `unlink` activity row with a `before` snapshot of the dropped edge. Restore via `undo` of the delete row.

### `link`

- **In:** `{ from_id, to_id, relation_type, upgrade?, metadata? }`
- **Out:** `{ edge, activity_id, suggestion? }` or `{ error, suggestion? }`
- Validation: [`packages/schema`](../packages/schema) `validateLink` (unknown relation, self-link, duplicate, symmetric duplicate, constraints, `child_of` uniqueness / `parent_types`). `relates_to` that fits the spine **suggests** `child_of`; it does not rewrite unless `upgrade: true`. Duplicate checks run on the proposed relation **before** the optional `relates_to` → `child_of` upgrade.
- Edges table is the only source of truth.

### `unlink`

- **In:** `{ from_id, to_id, relation_type, confirm: true }`
- **Out:** `{ ok, activity_id }` or `{ error, suggestion? }`

### `inspect_ontology`

- **In:** `{ kind?: "types"|"relations"|"all" }`
- **Out:** `{ types, relations }`

### `manage_type`

- **In:** `{ action: "create"|"update", slug, label?, description?, kind?, parent_types?, json_schema? }`
- **Out:** `{ type, activity_id }` or `{ error, suggestion? }`
- Applies immediately. System types: description only; system slugs cannot be deleted. Custom types may set `parent_types` so `child_of` placement works.

### `manage_relation`

- **In:** `{ action: "create"|"update", slug, label?, description?, kind?, source_types?, target_types?, is_symmetric?, semantic_parent_slug? }`
- **Out:** `{ relation, activity_id }` or `{ error, suggestion? }`
- Applies immediately. System relations: description only.

### `search`

- **In:** `{ query, type?, limit? }`
- **Out:** `{ nodes }` or `{ error, suggestion? }`
- Postgres FTS on `title` + extracted inline payload text (HTML tags stripped; JSON stringified). Filter by `type`. Soft-deleted nodes are excluded. Lexical recall only (no embeddings).

### `list_activity`

- **In:** `{ action?, target?, since?, limit? }`
- **Out:** `{ activities }`
- `target` is `target_id` (node UUID, edge UUID, or type/relation slug). `since` is an ISO-8601 timestamp. Rows include `before` / `after`, `reversible`, `undo_token`, `token_expires_at`, and `undone_at`.

### `undo`

- **In:** `{ id, confirm: true, purge_deleted? }` (`id` is an activity row id)
- **Out:** `{ ok, activity_id }` or `{ error, suggestion? }`
- `activity_id` is the compensating row (`reversible = false`). Invert map (REDESIGN §4.7):

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

## Not in v1

Restore as a separate tool (use `undo`), hierarchy tree, parent suggestion, habit logging, blob upload, embeddings admin, memories, pending proposals, chat presentation, web search, skills.
