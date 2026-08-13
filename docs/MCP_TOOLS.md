# Foundation MCP tools

Canonical list and rationale: [`docs/REDESIGN.md`](./REDESIGN.md) §5. Product contract: [`docs/SPEC.md`](./SPEC.md).

v1 surface is **12 tools**. Destructive tools require `confirm: true` or they return `{ error, suggestion }`. Identity is UUID. Ontology mutations apply immediately (activity log + `undo`; no proposal inbox).

| Tool | Status | Purpose |
| --- | --- | --- |
| `bootstrap` | shipped | Return starter ontology, how to extend it, and current type/relation inventory. Call first. |
| `search` | later (slice 8) | Find nodes by text query and optional type filter. |
| `get` | shipped (slice 4) | Fetch a node by id, including payload and incident edges. |
| `upsert` | shipped (slice 4) | Create or update a node (title, type, payload, data, status). |
| `delete` | shipped (slice 4) | Soft-delete a node. Requires `confirm: true`. |
| `link` | shipped (slice 5) | Create a typed edge after validation. |
| `unlink` | shipped (slice 5) | Remove a typed edge. Requires `confirm: true`. |
| `inspect_ontology` | shipped (slice 6) | List type and relation registry rows (system + authored). |
| `manage_type` | shipped (slice 6) | Create or update a node type. Applies immediately. |
| `manage_relation` | shipped (slice 6) | Create or update a relation type. Applies immediately. |
| `list_activity` | later (slice 7) | Read the activity log (filter by action, target, since). |
| `undo` | later (slice 7) | Reverse a reversible activity row by id. Requires `confirm: true`. |

Handler contract: each tool has one zod input schema and one output schema; JSON Schema on the wire is derived; invalid input never reaches the domain; domain errors are `{ error, suggestion? }`.

## Parameters (slices 4–6)

### `bootstrap`

- **In:** none
- **Out:** `{ spine, types, relations, rules, how_to_extend }`
- `how_to_extend` includes `manage_type`, `manage_relation`, `nodes`, and `links`.

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
- Soft-delete (`deleted_at`). `get` hides deleted nodes.

### `link`

- **In:** `{ from_id, to_id, relation_type, upgrade?, metadata? }`
- **Out:** `{ edge, activity_id, suggestion? }` or `{ error, suggestion? }`
- Validation: [`packages/schema`](../packages/schema) `validateLink` (unknown relation, self-link, duplicate, symmetric duplicate, constraints, `child_of` uniqueness / `parent_types`). `relates_to` that fits the spine **suggests** `child_of`; it does not rewrite unless `upgrade: true`.
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

### `search` / `list_activity` / `undo`

Not in this slice. Sketches remain in [`docs/REDESIGN.md`](./REDESIGN.md) §5.

## Not in v1

Restore (use `undo`), hierarchy tree, parent suggestion, habit logging, blob upload, embeddings admin, memories, pending proposals, chat presentation, web search, skills.
