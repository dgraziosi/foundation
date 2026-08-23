# Foundation MCP tools

Product contract: [`docs/SPEC.md`](./SPEC.md). Pointer search rename (design, not yet the live keys): [`SPEC.md`](./SPEC.md#pointer-search-rename-design).

v1 surface is **14 tools**. Destructive tools require `confirm: true` or they return `{ error, suggestion }`. Identity is UUID. A node is what is true now, short. History stays in activity. If you already have a UUID and need the current picture (payload, data, edges, if-match), call `get`. `get` does not return activity. If you already have a UUID and need the diary for that node, call `list_activity` `{ target }`. If you already have a UUID and need the open work around it, call `working_set`. To resolve one or more entity names, call `lookup`, then `working_set` with that id. Ontology mutations apply immediately (activity log + `undo`; no proposal inbox). A named bot rewrites one node on purpose: `get` → `list_activity` `{ target }` → keep what still matters, invent nothing → `upsert` the same id with a short `payload` and `base_updated_at`. Not a background job. The server does not invent the picture. No rewrite tool. Contract: [`SPEC.md`](./SPEC.md#current-picture).

| Tool | Purpose |
| --- | --- |
| `bootstrap` | Return starter ontology, how to extend it, and current type/relation inventory. Call first. |
| `search` | Find nodes by text query and/or filters (`type`, `status`, `under`, `since`, `living`, `code`, `receipt`, `due`, `due_on_or_before`, `due_on_or_after`, `data_equals`). Query is optional when a filter is set. Hits are id/type/title/snippet plus `due` when set. |
| `lookup` | Resolve one or more names to live nodes. One result per input (`exact` / `alias` / `candidate` / `ambiguous` / `no_match`). Read-only. |
| `get` | Return the current picture of one node: payload, data, incident edges with neighbor titles, and `suggested_links` from title FTS. Does not return activity. Blob payloads return metadata, not bytes. |
| `working_set` | Return the actionable working set around one live node: open work, dues, and the parent chain when the root hangs under something. |
| `upsert` | Create or update a node (title, type, payload, data, status). Passing `payload` replaces that body; omit it and the body stays. Updates require `base_updated_at`. Create accepts `idempotency_key`. Create (no id) preflights duplicates via `lookup`. Blob ingest via `bytes_base64` or `source_path`. Returns `suggested_links` (proposals only). |
| `delete` | Soft-delete a node. Requires `confirm: true`. |
| `link` | Create typed edges after validation. One edge or `edges[]` (1–20). Whole batch validates; one transaction writes all or none. Requires endpoint if-match. |
| `unlink` | Remove a typed edge. Requires `confirm: true`. |
| `inspect_ontology` | List type and relation registry rows (system + authored), including each type’s `fields`, view declarations, `default_view`, `hue`, and `glyph`. |
| `manage_type` | Create, update, or retire a node type (including `fields`, view queries, hue, and glyph). Applies immediately. Retire requires `confirm: true`. |
| `manage_relation` | Create or update a relation type. Applies immediately. |
| `list_activity` | Read the diary (filter by action, target, since). `{ target: <node id> }` is the write history for that node (`before` / `after`). |
| `undo` | Reverse a reversible activity row by id. Requires `confirm: true`. Type-create undo with leftover deleted nodes needs `purge_deleted: true`. |

Handler contract: each tool has one zod input schema and one output schema; JSON Schema on the wire is derived; invalid input never reaches the domain; domain errors are `{ error, suggestion? }`.

## Parameters

### `bootstrap`

- **In:** none
- **Out:** `{ spine, types, relations, rules, how_to_extend }`
- `how_to_extend` includes `manage_type`, `manage_relation`, `nodes`, `links`, `activity`, `search`, `lookup`, and `working_set`. After `lookup` binds a UUID, `working_set` is the one call for open work around that node. Summary notes that vault health, graph hygiene, and applying git updates are instance routines, not tools ([`docs/VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`docs/GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/)). No `get_vault_health` tool.

### `get`

The current picture of one live node. History stays in activity.

- **In:** `{ id, include_body? }`
- **Out:** `{ node, edges: [{ id, from_id, to_id, relation_type, direction, metadata, created_at, neighbor: { id, title, type } }], blob?, suggested_links }` or `{ error, suggestion? }`
- `node` is what is true now: type, title, status, `payload`, `data`, metadata, `created_at`, `updated_at`. It does not include activity rows. `list_activity` `{ target }` is the diary.
- Each incident edge includes **neighbor title and type**, not UUID-only hops. Use those titles to `search` or `get` the other node. For the open work around this id (children, dues, parent chain), call `working_set` — `get` stays one node plus flags (`include_body`).
- `suggested_links` is the same title-FTS list as `upsert` (skip self and already-linked; no second `child_of` parent; cap 5). Useful when a later `get` still has no edges. Empty → `[]`. Never writes an edge.
- Inline payloads still return `payload.body`. Blob payloads return `{ storage: "blob", blob_id, media_type }` plus `blob: { id, sha256, media_type, byte_size, path }`. Bytes are **not** dumped into the JSON by default.
- `include_body: true` may add base64 `payload.body` for small blobs (256KB cap). Larger files: HTTP `GET /blobs/:id` with `Authorization: ApiKey <FOUNDATION_API_KEY>`.

### `working_set`

Read-only agenda around one live node. New tool — not a `get` flag.

**Why a new tool.** `get` is the current picture: one node, payload, data, incident edges, `suggested_links`, `updated_at` for if-match. A working set is a different return: many lean rows, filtered to open work, sorted by due, walked from the ontology. A flag on `get` would either ship that agenda on every fetch or turn `get` into two tools behind a switch. `search` already lists vault-wide (`under`, `due`, `status`). This call is rooted: given one id, return the actionable set around it. Age-decay on this agenda is out of this amendment.

**Why `working_set`.** The return is the set of nodes an agent needs to act on around that root. `context` already means prompt stuffing and MCP session state; an agent would expect bodies and history. `agenda` reads as calendar-only and misses the parent chain on a task root.

- **In:** `{ id, include_completed?, depth?, limit?, due_within_days? }`
- **Out:** `{ root: { id, type, title, status, due? }, items: [{ id, type, title, status, due?, start?, end?, role, via, parent? }], walk, truncated }` or `{ error, suggestion? }`
- `id` is a live node UUID. Unknown or deleted id → `{ error, suggestion }` in the same family as `get` (`Node not found: <id>`; deleted nodes stay hidden until undo).
- `include_completed` default `false`. Open work is `status: "active"`. Completed and archived work rows stay out unless this is `true`. Ancestor rows (`role: "parent"`) always include the live chain so a completed goal still explains a task.
- `depth` default `1`, max `2`. Applies to the work walk (children or associative neighbors, then their children at 2). The ancestor chain is the full live hierarchy walk to a node with no parent — typically two or three spine hops, not bounded by `depth`.
- `limit` default **40**, max **40**. Hard cap on `items`. Caller may pass a smaller limit. When the walk finds more work rows than fit, the response keeps the sort order, sets `truncated: true`, and fills remaining slots after the ancestor rows.
- `due_within_days` default **14**, max **90**. Used when the root is a **spine root** (spine `kind`, empty `parent_types` — seed `area`). Work rows stay if they are overdue, due on or before today + that many days, or undated **and** depth 1 (the root’s direct children). Timezone for “today” / overdue is **America/New_York**, same as `search` `due`. Other roots skip this window; the cap still applies.
- Honest empty: a live root with nothing open returns `{ root, items: [], walk, truncated: false }`. That is success.

**Item shape (lean).** Titles, types, status, due, ids, parent titles. No payload body, no blob bytes, no `data` bag, no `suggested_links`.

| Field | Meaning |
| --- | --- |
| `role` | `"work"` (open item around the root) or `"parent"` (ancestor that explains why the root exists) |
| `due` | Value of the type’s field with role `date` when set (seed `data.due` on `task` / `goal` / `spend`) |
| `start` / `end` | Values of fields with those roles when set (seed `trip`) |
| `via` | `{ relation, direction, hops }` — the edge that reached this row from the root. `direction` is `incoming` (neighbor points at the root: a `child_of` child, an `about` source) or `outgoing` (root points at the neighbor: a `child_of` parent). `hops` is 1 or 2 for work; ancestor hops follow the chain. Several live edges to the same neighbor yield **one row**; `via.relation` is the more specific verb (`about` or `supports` over `relates_to`; hierarchy over associative). |
| `parent` | Immediate live hierarchy parent `{ id, title, type }` when the item itself hangs under something |

**Sort.** `role: "parent"` first, nearest parent then further ancestors. Then `role: "work"`: overdue first, then upcoming by the sort date, then undated (title as tie-break). Sort date is `due` when set, else `start`. Overdue is sort date before today in America/New_York.

**Walk (ontology, not a closed type catalog).** The handler reads the live type and relation registry (`bootstrap` / `inspect_ontology`). Seed examples below are illustrations.

1. **Hierarchy down** (`walk.work: "children"`) — the root type appears in some type’s `parent_types`, or a `kind: hierarchy` relation can target it. Walk live hierarchy edges where the root is the parent (`child_of` target). Equivalent spine children: other `kind: hierarchy` relations, and relations whose `semantic_parent_slug` is a hierarchy relation. Seed: `goal`, `project`, `area` (and any authored type that lists this type in `parent_types`).
2. **About a person** (`walk.work: "about"`) — the root type is listed in an associative relation’s non-empty `target_types` (seed `about` → `person`) and is not a hierarchy parent. Walk those targeted relations (incoming `about`) and `relates_to` either direction, plus relations whose `semantic_parent_slug` is `about` or `relates_to`. A person has empty `parent_types`; this walk does not invent `child_of` on them.
3. **Event-like** (`walk.work: "event"`) — the type has `start` and `end` field roles and is not a hierarchy parent (seed `trip`). Walk hierarchy children when any exist, and associative `relates_to` / `supports` (and their semantic children) as the work around the event — seed `task` cannot `child_of` `trip`.
4. **Parent chain** (`walk.ancestors: true`) — the root type has `parent_types`. Walk live hierarchy edges upward and emit `role: "parent"` rows. Seed: `task` → goal or project, then that parent’s parent. `habit`, `lesson`, `decision`, and a `goal` under a project use the same rule.

A type can take more than one of these (a `goal` is children + ancestors). `walk` echoes what ran:

`{ work: "children"|"about"|"event"|"none", ancestors: boolean, relations: string[], depth, due_window: { days, timezone } | null }`

`walk.work: "none"` with `ancestors: true` is a leaf whose working set is the parent chain. `walk.work: "none"` and `ancestors: false` with `items: []` is a live isolate — still success.

**Read-only.** Live edges only. The tool does not write, link, or turn `suggested_links` into edges. Call `get` for the current picture or if-match; call `list_activity` `{ target }` for the diary; call `link` when the user accepts a suggestion.

**How this sits next to `get` and `search`.**

| Need | Call |
| --- | --- |
| One node’s current picture (`payload`, `data`, edges, `suggested_links`, `updated_at`) | `get` |
| Diary of writes for one node (`before` / `after`) | `list_activity` `{ target }` |
| Vault-wide list or lexical recall (`under`, `due`, `status`, text) | `search` |
| Name → UUID | `lookup` |
| Open work around one UUID | `working_set` |

`search` `{ under }` still lists live `child_of` children of a parent. `working_set` adds due sort, open-only default, person/event walks, parent chain, and the area bound. It does not replace `search`. A project with `spend` children includes those open rows in the hierarchy walk; the date-role value shows as `due` on the item.

**Name then act.** `lookup` `{ inputs: [{ name, type }] }` → take an `exact` or `alias` UUID (ask the user on `candidate` / `ambiguous`) → `working_set` `{ id }`. That is one resolve and one agenda.

### `upsert`

- **In:** `{ id?, type, title, payload?, data?, status?, metadata?, base_updated_at?, idempotency_key?, allow_duplicate?, actor?, actor_label? }`
- **Out:** `{ node, activity_id, suggested_links, duplicate_warnings? }` or `{ error, suggestion?, outcome?, candidates? }`
- **`suggested_links`:** Postgres FTS on the new title (create, and update when the title changes) — not embeddings. Each item is `{ kind, target: { id, type, title }, reason }`. `kind` is a seed relation: `child_of`, `about`, or `relates_to`. `target` is a **live** node that already exists. How they are chosen: spine types with `parent_types` → `child_of` a live allowed parent whose title matches; if the title looks like a person already in the graph → `about` that person; otherwise `relates_to` a close title match of any type. Skip self. Skip nodes already linked to this one. A node with a live `child_of` is not offered a second parent (`about` / `relates_to` may still appear). Cap 5. Empty graph or no match → `[]`. **Never creates an edge.** Never adds a type or relation. `link` is how an accepted suggestion becomes an edge. Show non-empty suggestions and ask before calling `link`.
- `payload`: `{ media_type, storage: "inline"|"blob", body?, blob_id?, bytes_base64?, source_path? }`. On update, passing `payload` **replaces** that body (the written picture). Omit `payload` and the body stays. A named bot that rewrites the current picture passes the new short `payload` and `base_updated_at` from `get`.
- Inline media types: `text/markdown`, `text/html`, `application/json`, `text/plain`.
- **Blob ingest (no browser, no S3):** pass exactly one of:
  1. `bytes_base64` — MCP-native; good for small files. Size cap **20MB** (decoded). JSON body limit is 32MB so a 20MB file can round-trip.
  2. `source_path` — relative file under `$FOUNDATION_DATA/uploads` (filename or `uploads/filename`). The server **moves** it to `$FOUNDATION_DATA/blobs/<uuid>`. Rejects `..` and absolute paths.
  3. `blob_id` — attach an already-ingested blob (sha256 dedup may reuse an existing row).
- Stored payload is `{ storage: "blob", blob_id, media_type }`. Over cap → `{ error, suggestion }`.
- Omit `id` to create. Pass `id` to update, or to create with a chosen UUID.
- **Update if-match:** when `id` already exists, `base_updated_at` is required and must match the node's current `updated_at` at millisecond precision (the instant `get` returns). Mismatch or omit → `{ error, suggestion }` (call `get` and retry). A CAS miss is stale, never “node not found.” This is lost-update protection, not a write-ACL.
- **`data` merges** on update (`JSONB ||`, top-level keys). A partial `data` patch does not wipe other keys. Omit `data` to leave it unchanged.
- **`json_schema`:** compiled from the type’s `fields`. upsert validates the **merged** `data` object against it. Miss → `{ error, suggestion }` (inspect_ontology, fix data or the type fields). Types with no fields skip this check (`json_schema: null`). `additionalProperties` stays true, so extra keys (a voice dump) still write. Seed `task` and `goal` accept optional `data.due` (`YYYY-MM-DD`); omit it and the node still writes. Seed `spend` validates `amount` (number), `currency` (string, e.g. `USD`), `due` (same date rule), `vendor` (string, e.g. `Fixture vendor`), and `stage` (`quoted` | `paid`) the same way. A `ref` field must be a live node UUID of `ref_type` and does not create an edge.
- **`data.due`:** optional ISO date on `task`, `goal`, and `spend`. Stored on the JSONB `data` object. Pass `due: null` to clear. `get` returns it on `node.data`; search hits also surface `due` so briefs do not have to open every node. On `spend`, display is Date (the calendar day of the line).
- **`data.living`:** optional `{ system, id }` for `gmail` | `calendar` | `drive`. Unique on **live** nodes. Which living object. Not sent mail and not a cleared event. `living: null` clears. Look up with `search` `{ living }` (or `get` once you have the UUID). Foundation stores the ref only — **never fetch or mirror** those systems' bodies. There is no `kind` on living. There is no `url` on living. GitHub is `data.code`, not living.
- **`data.code`:** optional `{ system, id }` for `github`. Unique on **live** nodes. Which GitHub object. `code: null` clears. Look up with `search` `{ code }` then `get`. Store the ref only. Not a living Drive/Sheet.
- **`data.url`:** optional https href on any type. Sibling of living (and of code). How the Viewer opens a living file that stays the source of truth. Validated only when the incoming `data` patch includes `url`. `url: null` clears. Omit the key to leave url unchanged (including a legacy value). Incomplete, non-https, credentialed, or non-string values refuse. Not unique — uniqueness stays on living (or code). Store the href only — no file body, no blob. `get` returns it on `node.data`. Find the living object with `search` `{ living }`, then `get`.
- **`data.receipt`:** optional `{ system, id, kind }` after a bot sends mail or clears a calendar event. `system` is `gmail` | `calendar`. `kind` is `sent` | `cleared`. Pairing is closed: `sent` with `gmail`, `cleared` with `calendar`. Unique on **live** `system`+`id`, independent of living. `receipt: null` clears. Missing is allowed. Incomplete, unknown, or unpaired values refuse. Look up with `search` `{ receipt: { system, id } }` then `get`. The server does not invent the receipt. Store the ref only — no mail or event bodies.
- **`data.aliases`:** optional string array of user-authored alternate names (any type). Validated only when the incoming `data` patch includes `aliases`. `aliases: []` clears. Explicit malformed values refuse, including values that fold empty after `name_norm` (punctuation-only). A successful aliases patch leaves a well-formed non-empty array, or is `[]`. Omit the key to leave aliases unchanged (including legacy malformed values). `lookup` ignores malformed stored aliases. Alias dedupe uses the same fold as SQL `foundation_name_norm`.
- **Create duplicate preflight:** when `id` is omitted, `upsert` runs the same matcher as `lookup` on `{ name: title, type }`. Exact title or unique exact alias (or an exact-tier collision) returns `{ error: "duplicate_candidates", suggestion, outcome, candidates }` and does not write. Pass `allow_duplicate: true` to write a same-name entity anyway. Token, fuzzy, and space-compacted matches set `duplicate_warnings` and still write. `confidence` on those candidates ranks only — it does not authorize the write. Updates (`id` present) and CAS are unchanged.
- **Create idempotency:** `idempotency_key` on create. A retry with the same key returns the existing node and original `activity_id` — it does not twin. A key already used by a deleted node refuses (undo, or a new key).
- **`actor` / `actor_label`:** optional who-wrote fields stored on the activity row (`actor` is `agent` | `user` | `system`; default `agent`). Not a permission gate.

### `delete`

- **In:** `{ id, confirm: true, actor?, actor_label? }`
- **Out:** `{ ok, activity_id }` or `{ error, suggestion? }`
- Soft-delete (`deleted_at`). `get` hides deleted nodes. Incident edges stay in place for undo; `get` and `link` validation ignore edges to deleted endpoints. Reparenting drops a stale `child_of` to a deleted parent so uniqueness matches the live graph, and records an `unlink` activity row with a `before` snapshot of the dropped edge. Restore via `undo` of the delete row. Soft-delete does **not** delete blob bytes (so undo can restore a blob node).

### `link`

- **In (one edge):** `{ from_id, to_id, relation_type, upgrade?, metadata?, from_base_updated_at?, to_base_updated_at?, actor?, actor_label? }`
- **In (batch):** `{ edges: [{ from_id, to_id, relation_type, upgrade?, metadata?, from_base_updated_at?, to_base_updated_at? }], actor?, actor_label? }`
- `edges` is 1–20. Pass either the one-edge fields or `edges[]`, not both.
- **Out (one-edge form):** `{ edge, activity_id, suggestion?, links: [{ edge, activity_id, suggestion? }] }` or `{ error, suggestion? }`
- **Out (`edges[]` form):** `{ links: [{ edge, activity_id, suggestion? }] }` or `{ error, suggestion? }`
- Validation: whole batch before any write. [`packages/schema`](../packages/schema) `validateLink` per edge (unknown relation, self-link, duplicate, symmetric duplicate, constraints, `child_of` uniqueness / `parent_types`). In-batch exact and symmetric duplicates refuse. Later edges see earlier accepted edges in the same call (including a second `child_of` from the same source). `relates_to` that fits the spine **suggests** `child_of`; it does not rewrite unless that edge passes `upgrade: true`. A suggestion does not fail the batch. Duplicate checks run on the proposed relation **before** the optional `relates_to` → `child_of` upgrade.
- **Atomic write:** one transaction. First error wins; no partial `links` and no new edges on refuse.
- **If-match:** `from_base_updated_at` and `to_base_updated_at` are required on **each** edge and must match each endpoint's current `updated_at` from `get`. A missing timestamp on any item refuses that edge and writes nothing. A later edge does not inherit CAS from an earlier edge that named the same node. Several edges that share a node still use one agreed timestamp. Disagreeing timestamps refuse the batch. Stale or missing → `{ error, suggestion }` (get the nodes and retry). Linking does not change `updated_at`. Not a write-ACL.
- Optional `actor` / `actor_label` are stored on each activity row (who wrote). Not a permission gate.
- One activity receipt per written edge. `undo` inverts one receipt. Edges table is the only source of truth.

### `unlink`

- **In:** `{ from_id, to_id, relation_type, confirm: true, actor?, actor_label? }`
- **Out:** `{ ok, activity_id }` or `{ error, suggestion? }`

### `inspect_ontology`

- **In:** `{ kind?: "types"|"relations"|"all" }`
- **Out:** `{ types, relations }`. Each type includes `fields`, view declarations, optional `default_view`, optional `hue`, and optional `glyph`, with `slug`, `label`, `kind`, `parent_types`, and compiled `json_schema`.

### `manage_type`

- **In:** `{ action: "create"|"update"|"retire", slug, label?, description?, kind?, parent_types?, json_schema?, views?, default_view?, fields?, hue?, glyph?, confirm?, purge_deleted?, actor?, actor_label? }`
- **Out:** `{ type, activity_id }` or `{ error, suggestion? }`
- Applies immediately. System seed types may edit description, `fields`, `hue`, `glyph`, and `filter` / `sort` / `group` on views they already declare. They cannot change slug, kind, parent_types, label, retire, or the ordered view **ids** (no add, drop, or reorder of engines). `default_view` stays a member of those locked ids. Authored types keep the wider patch, including the view id list. Custom types may set `parent_types` so `child_of` placement works. Seed apply fills missing seed hue/glyph and missing seed fields only; it does not overwrite a user edit. Seed `spend` (artifact, `parent_types: ["project"]`) is the type for one money line. `project` has optional `budget_amount` / `budget_currency`. Contract: [`SPEC.md`](./SPEC.md#project-spend).
- **`fields`:** ordered template `{ name, kind, display?, needed?, role?, enum_values?, ref_type? }`. Kinds: `string`, `date`, `number`, `enum`, `ref`. Roles: `title`, `status`, `date`, `start`, `end`, `subtitle`. At most one of title/status/date/start/end. `end` requires `start`. `status` requires enum. Date roles require kind date. `json_schema` is compiled from fields — pass `fields`, not a hand-written schema, once a template exists. `needed` does not block capture.
- **`views` / `default_view`:** defining a type includes this choice. `views` is an ordered array of declarations `{ id, filter?, sort?, group? }` (bare ids still parse). `id` is `list` | `card` | `table` | `board` | `calendar` | `timeline` | `outline` | `graph`. Filter/sort/group bind to field roles or node `title` / `status` / `updated_at`. `default_view` must be a member of those ids, or omitted when `views` is empty. Seed types already declare views (`task` defaults to `board`, filter `status = active`). The Viewer reads the same contract from `inspect_ontology`.
- **Retire:** `action: "retire"` with `confirm: true` drops an authored type that has **zero live nodes**. System seed types refuse. Live nodes refuse with `{ error, suggestion }` (delete or retype, then retry). Soft-deleted nodes of that type stay restorable — same family as undo-of-type-create: restore those deletes first, or pass `purge_deleted: true` (with `confirm: true`) to hard-delete the tombstones and their incident edges. Never a silent vault wipe. Undo of retire restores the registry row.

### `manage_relation`

- **In:** `{ action: "create"|"update", slug, label?, description?, kind?, source_types?, target_types?, is_symmetric?, semantic_parent_slug?, actor?, actor_label? }`
- **Out:** `{ relation, activity_id }` or `{ error, suggestion? }`
- Applies immediately. System relations: description only.

### `search`

- **In:** `{ query?, type?, status?, under?, since?, living?, code?, receipt?, due?, due_on_or_before?, due_on_or_after?, data_equals?, limit? }`
- **Out:** `{ nodes: [{ id, type, title, status, snippet, due? }], suggestion? }` or `{ error, suggestion? }`
- Postgres FTS on `title` (weighted highest) + string values from `data` + extracted inline payload text. HTML: tag text plus `alt` / `title` / `aria-label` / `placeholder`. JSON: string values from the parsed body — **not** `JSON.stringify` of the payload wrapper (`media_type`, `storage`, …). Latin diacritics are folded (`fiancee` matches `fiancée` and vice versa). Soft-deleted nodes are excluded. Lexical recall only (no embeddings).
- **`query` is optional** when `type`, `status`, `under`, `since`, `living`, `code`, `receipt`, `due`, `due_on_or_before`, `due_on_or_after`, or `data_equals` is set. That is how agents list without a word: all people (`type: "person"`), all open tasks (`type: "task", status: "active"`), overdue or due-today (`due: "overdue"` | `"today"`), due on or before a date (`due_on_or_before: "2026-08-27"`), children of a parent (`under: <parent uuid>` = live `child_of`), spend bids (`type: "spend", data_equals: { stage: "quoted" }`), spend under a project (`type: "spend", under: <project uuid>`), nodes updated `since` an ISO-8601 timestamp, a living Gmail/Calendar/Drive object (`living: { system, id }`), a GitHub object (`code: { system, id }`), a sent-mail or cleared-event pointer (`receipt: { system, id }`), or nodes whose top-level `data` keys equal a value (`data_equals: { kind: "…", status: "…" }`). Empty `{}` → `{ error, suggestion }` (do not add `list_nodes`).
- `due: "overdue" | "today"` uses **America/New_York** for “today.” `due_on_or_before` / `due_on_or_after` are inclusive ISO dates (`YYYY-MM-DD`) against `data.due`. Nodes without `data.due` do not match a due filter. Seed `spend` uses the same `data.due` key, so those filters apply to a spend line the same way they apply to a task.
- `data_equals` is JSONB containment (`data @> …`) on one or a few top-level keys (at most 8; lowercase identifiers). Not a column per key. Nodes missing those keys do not match. Combine with `type` / other filters. Values are strings — `{ stage: "paid" }` or `{ currency: "USD" }` on `spend` matches; `amount` is a number and does not.
- `living: { system, id }` looks up the unique live `data.living` ref (`gmail` | `calendar` | `drive`). Which living object, not done.
- `code: { system, id }` looks up the unique live `data.code` ref (`github`). Which GitHub object, not done.
- `receipt: { system, id }` looks up the unique live `data.receipt` (`gmail` | `calendar`). Kind lives on the stored node. Then `get`. A miss means that pointer is free to write.
- Hits are lean (id/type/title/snippet, plus `due` when `data.due` is set). Call `get` for the current picture and neighbor titles. Call `list_activity` `{ target }` for the diary. Call `working_set` when the hit is a root and you want the open work around it.
- If `query` is a UUID, search resolves it like `get` and returns `suggestion` to prefer `get` (or `working_set` for the agenda) next time.
- **An empty lexical result is not a license to upsert a duplicate.** The `suggestion` says so. Try a shorter token or a type filter; only upsert if the entity is new. If you already have a UUID, call `get` for the current picture or `working_set` for the agenda. A living miss means you may upsert with that `data.living` (ref only). A code miss means you may upsert with that `data.code` (ref only). A receipt miss means you may upsert with that `data.receipt` (ref only). To resolve one or more entity names to UUIDs, call `lookup`.

### `lookup`

- **In:** `{ inputs: [{ name, type?, id? }], type?, limit? }`
- **Out:** `{ results: [{ input, outcome, candidates, suggestion? }] }` or `{ error, suggestion? }`
- `inputs` is required (1–20). Each `name` is 1–200 characters. Optional `id` is echoed for correlation. Top-level `type` applies when an input omits `type`. `limit` is candidates per input (default 5, max 10).
- One result per input, same order, even when some names miss.
- `outcome` is `exact` | `alias` | `candidate` | `ambiguous` | `no_match`.
  - `exact` — unique live UUID, or unique title after `name_norm` (case, accent, punctuation, whitespace).
  - `alias` — unique exact user-authored `data.aliases` entry; title did not exact-match.
  - `candidate` — token or fuzzy (including compact/no-space) matches. Never authoritative, even with a high `confidence`.
  - `ambiguous` — duplicate exact titles, or title exact and alias exact on different nodes.
  - `no_match` — nothing above the floor.
- Candidates are `{ id, type, title, status, updated_at, confidence, match, matched_value, explanation }`. `title` is the canonical node title. `updated_at` is for a later if-match upsert or link. `confidence` is algorithmic rank, not a calibrated probability, and does not authorize a write. `match` is `title_exact` | `alias_exact` | `title_fuzzy` | `alias_fuzzy` | `title_token` | `uuid`. The surrounding list is `candidates` on that result.
- Soft-deleted nodes are excluded. Title matching uses generated `title_norm` / `title_compact` plus trigram indexes. Aliases are unnested from JSONB (well-formed string arrays only).
- Read-only. Never writes, merges, creates, or picks an ambiguous candidate. For `candidate` or `ambiguous`, ask the user to confirm a UUID before any mutation that depends on the identity. `get` is safe for inspection.
- If you already have a UUID, call `get` for the current picture or `working_set` for the open work around it. Listing, living refs, code refs, receipt refs, due filters, and payload search stay on `search`. Lexical recall only, not embeddings. No hidden nickname list. The usual path after a bound name is `working_set` with that id.

### `list_activity`

- **In:** `{ action?, target?, since?, limit? }`
- **Out:** `{ activities }`
- `target` is `target_id` (node UUID, edge UUID, or type/relation slug). `{ target: <node id> }` is the diary for that node. Newest first. Default limit 50, max 200. Page older rows with `since`. `get` does not include these rows.
- `since` is an ISO-8601 timestamp. Rows include `actor`, `actor_label`, `before` / `after`, `reversible`, `undo_token`, `token_expires_at`, and `undone_at`. `actor` / `actor_label` record who wrote; they are not a permission gate. Node write rows store snapshots of `payload`, `data`, title, type, and status. A bad picture is rebuilt from those snapshots, then written with `upsert`.
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

- `GET /blobs/:id` — raw bytes. Requires `Authorization: ApiKey <FOUNDATION_API_KEY>` (Bearer accepted). The unlock cookie is not a credential here. `Content-Type` is the blob `media_type`, except HTML/SVG and other scriptable types which are `application/octet-stream`. Always `Content-Disposition: attachment` so a browser does not run the file as a page on this host. This is how agents fetch large files without inlining them in MCP JSON.
- `GET /view/blobs/:id` — same bytes, same store, for the read-only window. Unlock cookie or Authorization header. Same attachment / scriptable-type rules. The cookie still does not unlock `/mcp` or `/blobs/:id`.
- Files live at `$FOUNDATION_DATA/blobs/<uuid>` (directory mode 0700). `FOUNDATION_DATA` must not be an agent profile/memory directory.

## Not in v1

Restore as a separate tool (use `undo`), hierarchy tree, a dedicated parent-suggestion tool (title-FTS `suggested_links` already return on `upsert` / `get`; `link` writes the edge), habit logging, a dedicated blob-upload tool (ingest is on `upsert`), embeddings admin, memories, pending proposals, chat presentation, web search, skills, `get_vault_health` / `run_maintenance` / `audit_links` (instance routines instead: [vault health](./VAULT_HEALTH.md), [graph hygiene](./GRAPH_HYGIENE.md), [apply product updates](../.agents/skills/update-foundation/)), bank / card import, a second ledger, double-entry accounting, or a spend rollup tool (an agent reads project budget fields plus `spend` lines when it needs remaining).
