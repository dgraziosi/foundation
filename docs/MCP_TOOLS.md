# Foundation MCP tools (proposed)

Stub. Canonical list and rationale: [`docs/REDESIGN.md`](./REDESIGN.md) §5. Product contract: [`docs/SPEC.md`](./SPEC.md).

v1 surface is **12 tools**. Destructive tools require `confirm: true` or they no-op with an error. Identity is UUID. Ontology mutations apply immediately (activity log + `undo`; no proposal inbox).

| Tool | Purpose |
| --- | --- |
| `bootstrap` | Return starter ontology, how to extend it, and current type/relation inventory. Call first. |
| `search` | Find nodes by text query and optional type filter. |
| `get` | Fetch a node by id, including payload and incident edges. |
| `upsert` | Create or update a node (title, type, payload, data, status). |
| `delete` | Soft-delete a node. Requires `confirm: true`. |
| `link` | Create a typed edge after validation. |
| `unlink` | Remove a typed edge. Requires `confirm: true`. |
| `inspect_ontology` | List type and relation registry rows (system + authored). |
| `manage_type` | Create or update a node type. Applies immediately. |
| `manage_relation` | Create or update a relation type. Applies immediately. |
| `list_activity` | Read the activity log (filter by action, target, since). |
| `undo` | Reverse a reversible activity row by id. Requires `confirm: true`. |

## Parameter sketches (non-normative until implementation)

These are design hints for the first scaffold PR, not a frozen schema.

### `bootstrap`

- **In:** none
- **Out:** `{ spine, types, relations, rules, how_to_extend }`

### `search`

- **In:** `{ query, type?, limit? }`
- **Out:** `{ results: [{ id, type, title, snippet }] }`

### `get`

- **In:** `{ id }`
- **Out:** `{ node, edges: [{ id, from_id, to_id, relation_type, direction }] }`

### `upsert`

- **In:** `{ id?, type, title, payload?, data?, status? }`
- **Out:** `{ node }`
- `payload`: `{ media_type, storage: "inline"|"blob", body?, blob_id? }`

### `delete`

- **In:** `{ id, confirm: true }`
- **Out:** `{ ok, activity_id }`

### `link`

- **In:** `{ from_id, to_id, relation_type }`
- **Out:** `{ edge }` or `{ error, suggestion }`

### `unlink`

- **In:** `{ from_id, to_id, relation_type, confirm: true }`
- **Out:** `{ ok, activity_id }`

### `inspect_ontology`

- **In:** `{ kind?: "types"|"relations"|"all" }`
- **Out:** `{ types, relations }`

### `manage_type`

- **In:** `{ action: "create"|"update", slug, label?, description?, kind?, parent_types?, json_schema? }`
- **Out:** `{ type }`

### `manage_relation`

- **In:** `{ action: "create"|"update", slug, label?, description?, kind?, source_types?, target_types?, is_symmetric?, semantic_parent_slug? }`
- **Out:** `{ relation }`

### `list_activity`

- **In:** `{ action?, target_id?, since?, limit? }`
- **Out:** `{ activity: [...] }`

### `undo`

- **In:** `{ activity_id, confirm: true }`
- **Out:** `{ ok }` or `{ error }` if missing / not reversible / already undone / token expired

## Not in v1

Restore (use `undo`), hierarchy tree, parent suggestion, habit logging, blob upload, embeddings admin, memories, pending proposals, chat presentation, web search, skills.
