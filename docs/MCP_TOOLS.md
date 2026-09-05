# Foundation MCP tools

Product contract: [`docs/SPEC.md`](./SPEC.md). Url, repo, and link: [`SPEC.md`](./SPEC.md#url-repo-and-link).

Destructive tools need a key with destructive scope or they return `{ error, suggestion }`. Identity is UUID. A record is what is true now, short. History stays in activity. If you already have a UUID and need the record (payload, data, edges, if-match), call `get`. `get` does not return activity. If you already have a UUID and need the diary for that record, call `list_activity` `{ target }`. If you already have a UUID and need the open work around it, call `working_set`. To resolve one or more entity names, call `lookup`, then `working_set` with that id. Ontology mutations apply immediately (activity log + `undo`; no proposal inbox). A named bot rewrites one record on purpose: `get` → `list_activity` `{ target }` → keep what still matters, invent nothing → `upsert` the same id with a short `payload` and `base_updated_at`. Not a background job. The server does not invent the body. No rewrite tool. Contract: [`SPEC.md`](./SPEC.md#rewrite-one-record).

| Tool | Purpose |
| --- | --- |
| `bootstrap` | Return starter ontology, how to extend it, and current type/relation inventory. Call first. |
| `search` | Find nodes by text query and/or filters (`type`, `status`, `under`, `since`, `url`, `repo`, `receipt`, `due`, `due_on_or_before`, `due_on_or_after`, `data_equals`). Query is optional when a filter is set. Hits are id/type/title/snippet plus `due` when set. |
| `lookup` | Resolve one or more names to live nodes. One result per input (`exact` / `alias` / `candidate` / `ambiguous` / `no_match`). Read-only. |
| `get` | Return the record: payload, data, incident edges with neighbor titles, and `suggested_links` from title FTS. Does not return activity. Blob payloads return metadata, not bytes. |
| `working_set` | Return the actionable working set around one live node: open work, dues, and the parent chain when the root hangs under something. |
| `upsert` | Create or update a node (title, type, payload, data, status). Always pass `type` on create and update. Passing `payload` replaces that body; omit it and the body stays. Updates require `base_updated_at`. Create accepts `idempotency_key`. Create (no id) preflights duplicates via `lookup`. Blob ingest via `bytes_base64` or `source_path`. Returns `suggested_links` (proposals only). |
| `delete` | Soft-delete a node. Needs a key with destructive scope and `base_updated_at` from `get`. |
| `link` | Create typed edges after validation. One edge or `edges[]` (1–20). Whole batch validates; one transaction writes all or none. Requires endpoint if-match. |
| `unlink` | Remove a typed edge. Needs a key with destructive scope and endpoint if-match. |
| `inspect_ontology` | List type and relation registry rows (system + authored), including each type’s `fields`, view declarations, `default_view`, `hue`, and `glyph`. |
| `manage_type` | Create, update, or retire a node type (including `fields`, view queries, hue, and glyph). Applies immediately. Retire needs a key with destructive scope. |
| `manage_relation` | Create or update a relation type. Applies immediately. |
| `list_activity` | Read the diary (filter by action, target, since). `{ target: <node id> }` is the write history for that node (`before` / `after`). |
| `undo` | Reverse a reversible activity row by id. Needs a key with destructive scope. Node and edge inversions require if-match timestamps from `get`. Type-create undo with leftover deleted nodes needs `purge_deleted: true`. |
| `job` | Claim a named instance routine, keep the claim alive, finish or release it, or read who holds it and last run. Not a graph write. |

HANDLER_CONTRACT_AND_REST_OF_FILE_CONTINUES_FROM_FIXED_MD