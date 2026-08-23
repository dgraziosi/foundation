# Foundation — product contract

Living spec. Keep this current as decisions land.

## Purpose

Foundation is a **personal ontology + MCP server** for AI agents. It is durable structured context (a typed graph) that agents read and write — not chat memory, not a notes app with an API bolted on.

Named after Asimov’s Foundation: carry structured knowledge forward so you and your agents are not starting from zero.

**Not for sale.** Open on GitHub so others can self-host for their own agents.

Do not commit personal life data, documents, or secrets to this repository. Those belong in the user’s vault, not in git.

## Locked glossary

Short analog: app / folder / links → Foundation / vault / graph.

- **Foundation** — the product
- **vault** — one instance (`FOUNDATION_DATA` + Postgres)
- **graph** — the live network in that vault
- **ontology** — the vocabulary (types and relations)
- **blob** — bytes on a node (`payload.storage: "blob"`), stored in the vault
- **pointer** — a typed graph fact that names something without copying it. Not one string bag. Shapes: [Pointers](#pointers)
- **living** — pointer: this node is that Gmail, Calendar, or Drive object (`data.living { system, id }`)
- **code** — pointer: this node is that GitHub object (`data.code { system, id }`)
- **href** — pointer: https open address (`data.url`)
- **receipt** — pointer: done after send or clear (`data.receipt { system, id, kind }`)
- **ref** — a typed UUID field on `data`. Points at another node. Not an edge
- **agent** — anything that can reach the vault MCP
- **user** — the human who runs Compose
- **bot** — a named role that acts through an agent

Do not call the graph “the Vault.”

Do not use “origin” as a Foundation key, search filter, or shape name. Cursor Origin is source control. It is not a vault word.

Starter recipes: [`AGENTS.md`](./AGENTS.md).

## Url and repo (design)

Design only. Schema, search, and upsert wait for review. Today’s leftover keys on this commit stay under [today’s bags](#pointers) (`data.living`, `data.code`, `data.url` the https address). This section is the hard cut that replaces them. Keep this language lock in the copy on implement.

### Language lock

Dream and Vault are feature brands. Url and repo are ordinary words, not brands. Drive / Gmail / Calendar is a url. GitHub is a repo. Viewer Open stays `data.url`.

**Record** is the node (system of record). **Activity** is the audit log.

Do not mint these as product words: Replay, Reconcile, Hygiene, Living, Code, Present, Current picture, Pointer.

Tester fails a new glossary word that is not a feature name, same as OPERATIONS voice.

### Verified on main (`c66a81c`)

| Bag | Key | Type | Unique | How an agent finds it |
| --- | --- | --- | --- | --- |
| Drive / Gmail / Calendar (a url) | leftover `data.living { system, id }` | object | yes (`gmail` \| `calendar` \| `drive`) | leftover `search { living }` then `get` |
| GitHub (a repo) | leftover `data.code { system, id }` | object | yes (`github`) | leftover `search { code }` then `get` |
| Viewer Open | `data.url` | https string | no | `get`. FTS and `data_equals: { url }` |
| Receipt | `data.receipt { system, id, kind }` | object | yes | `search { receipt }` then `get` |

Search selectors match data keys. Leftover `origin` already refuses. A Drive id cannot derive the https address (no `kind` on that leftover object; Docs, Sheets, and files use different prefixes). Indexes: `nodes_living_live_uidx`, `nodes_code_live_uidx`. `nodes_origin_live_uidx` is gone.

### Collision

`search { url }` as `{ system, id }` identity and `data.url` the https address smash.

1. One key cannot be an object and a string.
2. `data_equals: { url }` already matches the https string.
3. Search selectors match data keys. `search { url }` would mean `data.url`.
4. “Search by url” reads as the https link. That link is not unique, so it is not which Drive / Gmail / Calendar object.

The https address and the Drive / Gmail / Calendar identity stay two bags. Do not use `origin` as a Foundation key, filter, or `system` value. Cursor Origin is source control.

### Proposed wire

Search key equals data key. Hard cut. No dual-read of leftover `living` / `code` / `origin`. `search { living }` and `search { code }` are gone. `search { origin }` stays gone.

| Bag | Key | What it is | How an agent finds it |
| --- | --- | --- | --- |
| url (Drive / Gmail / Calendar) | `{ system, id }` — JSON key is the [review lock](#review-lock) | This record is that Drive, Gmail, or Calendar object. Unique on live records. No `kind`. `system` is `gmail` \| `calendar` \| `drive`. Refuses `github`. | matching `search` then `get` |
| Viewer Open | `data.url` | https address. Any type. Not unique. | `get`. FTS and `data_equals: { url }` |
| repo | `data.repo { system, id }` | This record is that GitHub object. Unique on live records. No `kind`. `system` is `github`. Refuses gmail / calendar / drive. | `search { repo }` then `get` |
| receipt | `data.receipt { system, id, kind }` | Unchanged. Independent of the Drive / Gmail / Calendar url. | `search { receipt }` then `get` |

`data.url` stays the https address. Viewer Open stays that key. Trimmed, https, no credentials, max 2048. `url: null` clears. Missing is allowed. Not unique. Not which Drive / Gmail / Calendar object. The Open key does not change, so Open copy does not restyle. Open leaves the window for that file.

`data.repo` is today’s leftover `data.code` renamed. `repo: null` clears. Store the ref only. A later git slug is out. Cursor Origin is not a vault key and not a `repo.system` value.

Receipt, uniqueness family, leftover refuse, and fixture ids stay the same family as today (`file-fixture-1`, `repo-fixture-1`, `https://example.test/drive/file-fixture-1`). No file, mail, event, or repository bodies. No new MCP tool. No new store.

### Review lock

The JSON and search key for the Drive / Gmail / Calendar url.

It cannot be `url` (`data.url` is the https address Open uses). It cannot be a minted product word from the language lock. It cannot be `receipt` or `record` (record is the node). Do not mint `url_id` or `url_ref`.

Two complete options:

**A.** The Drive / Gmail / Calendar url is `data.url { system, id }` and `search { url }`. The https address moves off `data.url`. Viewer Open reads the new https key. This breaks “Viewer Open stays `data.url`.”

**B.** Viewer Open stays `data.url`. `search { url }` is not which Drive / Gmail / Calendar object. GitHub is `search { repo }`. That url identity stays `{ system, id }` under one ordinary word the review names. Search key equals that data key.

This design picks **B**. The review names that ordinary word before implement.

### Everyday words (clone)

A clone does not land insider words. Not a speech to a person.

- **record** — the node (system of record)
- **activity** — the audit log
- **user** — the human who runs Compose
- **bot** — a named role
- Feature brands only: Dream, Vault. Url and repo are ordinary words.
- Tester fails a new glossary word that is not a feature name, same as OPERATIONS voice.

Do not put this bar in Vault Keeper. Do not add a bot for it.

### Out

No docker / db-init. No Viewer visual restyle. No personal data. No new bot. PRODUCT only.

## Primary users

1. **Agents** via MCP — default interface (Cursor, Claude, and other MCP clients)
2. **Users** via the read-only window on the same API (`/view`). Same graph as MCP. The window is not a second store. Surfaces, shell, tokens, and states: [`VIEWER.md`](./VIEWER.md).

## Starter spine

```text
area → project → goal → habit | task
```

Recommended structure: Area → project → goal → task. A habit hangs under a goal. A task may child_of a goal or a project. A spend hangs under a project.

**Area** is the spine root (life domain + what you value). The spine is preferred placement, not a hard gate: `task` may `child_of` `project` (skip a dummy goal). Prefer goal when there is a real outcome. `task` still cannot `child_of` `area`. Seed artifacts include person, place, company, journal, idea, lesson, note, trip, decision, spend. Hierarchy verb is `child_of`. Associative seeds: relates_to, supports, inspired_by, references, about.

A `spend` is one recorded money line under a project. Hang it with `child_of` that project. A project may hold optional `budget_amount` and `budget_currency` so an envelope can live on the project node. Field template, validation, and search: [Project spend](#project-spend).

Agents can add types and relations over time. No approval inbox.

## Agent API (14 tools)

These names are the current surface. Full parameters: [`docs/MCP_TOOLS.md`](./MCP_TOOLS.md). The current-picture rule uses `get`, `upsert`, and `list_activity`. It does not add a tool. A further tool still needs a SPEC amendment.

`bootstrap`, `search`, `lookup`, `get`, `working_set`, `upsert`, `delete`, `link`, `unlink`, `inspect_ontology`, `manage_type`, `manage_relation`, `list_activity`, `undo`.

- Destructive tools (`delete`, `unlink`, `undo`, `manage_type` retire) require `confirm: true`
- Identity is UUID. If you already have a UUID and need the current picture (payload, data, edges, if-match), call `get`. `get` does not return activity. If you already have a UUID and need the open work around it, call `working_set`. `lookup` then `working_set` is the name → act path. How a bot rewrites one node: [Current picture](#current-picture).
- Updates (`upsert` with an existing id, `link`) are if-match: pass `base_updated_at` / endpoint timestamps from `get`. Compared at millisecond precision (same instant `get` returns). Mismatch → `{ error, suggestion }` (get and retry), never “node not found.” Not a write-ACL. `link` accepts one edge or a capped `edges[]` (1–20). The whole batch validates, then one transaction writes all edges or none. One activity receipt per written edge. Each edge carries both endpoint timestamps; a later edge does not inherit CAS from an earlier edge that named the same node. Shared endpoints still use one agreed timestamp; missing or disagreeing timestamps refuse the batch. Linking does not change `node.updated_at`.
- `manage_type` can retire an unused authored type (`action: "retire"`, `confirm: true`). System seed types cannot be retired. Live nodes of that type refuse; leftover soft-deleted nodes follow type-create undo (`purge_deleted: true` or restore those deletes first). A type owns `fields` (the field template), view declarations (`id` plus optional `filter` / `sort` / `group`), `default_view`, `hue`, and `glyph`. `json_schema` is compiled from `fields` (`additionalProperties: true`; `needed` is not JSON Schema `required`). Seed types already declare views (`task` defaults to `board`) and first-paint hue/glyph. The Viewer reads that contract; it does not infer views or hardcode a type catalog. System seed types may edit description, `fields`, hue, glyph, and the query on views they already declare. Their slug, kind, parent_types, label, and ordered view **ids** stay locked. Authored types keep the wider patch, including the view id list. Seed apply fills **missing** seed fields and missing seed hue/glyph only; it does not overwrite a user edit.
- `upsert` **replaces** `payload` when that field is passed (omit it and the body stays). It **merges** `data` on update (partial patch does not wipe other keys). Create accepts `idempotency_key` so a retry does not twin a node. Create (no `id`) runs the same `lookup` matcher on the new title, type-scoped. Exact title or unique exact alias returns those write-ready candidates and does not write unless `allow_duplicate: true`. Token, fuzzy, and space-compacted matches warn (`duplicate_warnings`) and do not block. Same-name entities stay allowed with that override. Update/CAS behavior is unchanged. When a type has `json_schema`, upsert validates merged `data` and returns `{ error, suggestion }` on a miss. A bot that rewrites the current picture passes the new short `payload` and `base_updated_at` from `get`.
- `upsert` (create, and update when the title changes) returns `suggested_links` from Postgres FTS on the new title — not embeddings. Each item is `{ kind, target: { id, type, title }, reason }` where `kind` is a seed relation (`child_of`, `about`, or `relates_to`) and `target` is a live node that already exists. Spine types with `parent_types` get `child_of` an allowed parent whose title matches; a title that looks like a person already in the graph gets `about`; otherwise `relates_to` a close title match. Skip self and already-linked pairs. A node with a live `child_of` is not offered a second parent (`about` / `relates_to` may still appear). Cap 5. Empty graph or no match → `[]`. **Never creates an edge** and never adds a type or relation. `link` is how an accepted suggestion becomes an edge. `get` may return the same list for a node that still has no edges.
- Activity stores optional `actor` / `actor_label` (who wrote). Not a permission gate. Every node write leaves a row (`create` / `update` / `delete`) with `before` / `after` snapshots of that node (`payload`, `data`, title, type, status). Blob snapshots store `payload.blob_id` plus blob metadata, not file bytes. `list_activity` `{ target: <node id> }` is the diary for that node. Newest first. Default limit 50, max 200. Page older rows with `since`. `get` does not include these rows.
- `search` is Postgres FTS (title + `data` + extracted inline payload text; Latin accents folded). `query` is optional when `type`, `status`, `under` (child_of parent), `since`, `living`, `code`, `receipt`, `due` (`overdue` | `today` in America/New_York), `due_on_or_before`, `due_on_or_after`, or `data_equals` is set, so agents can list without a word. `data_equals` is JSONB equality on one or a few top-level `data` keys (not a column per key). Hits include `due` when `data.due` is set. Not embeddings. No `list_nodes`.
- `lookup` resolves one or more names in one request and returns a result per input (`exact`, `alias`, `candidate`, `ambiguous`, `no_match`). Unique UUID, unique folded title (`name_norm`: case, accent, punctuation, whitespace), or unique user-authored `data.aliases` entry may bind a UUID. Token and fuzzy matches are always `candidate`. Duplicate exact titles and alias/title collisions are `ambiguous`. Each useful candidate includes `id`, `type`, canonical `title`, `updated_at`, `match`, `confidence`, and sits on the surrounding `candidates` list so a later confirm/link/upsert can if-match. `confidence` ranks; it is not a calibrated probability and does not authorize a write. For `candidate` or `ambiguous`, ask the user to confirm a UUID before any mutation that depends on the identity; `get` is safe for inspection. `lookup` never writes, merges, creates, or picks an ambiguous candidate. Compact/no-space equality is candidate-only. Matching is type-scoped when `type` is supplied. Not embeddings. No hidden nickname list. After a bound UUID, `working_set` is the one agenda read around that node.
- `working_set` is a read-only rooted agenda. Given one live node id, it returns lean open work around that root (dues first), plus the parent chain when the type has `parent_types`. Walks follow the live ontology: hierarchy down (`child_of` and equivalent `kind: hierarchy` / `semantic_parent_slug` children) for types that can be parents (`goal`, `project`, `area`, and authored types in someone’s `parent_types`); `about` and `relates_to` for a person-like about-target (no invented `child_of`); hierarchy plus `relates_to` / `supports` for event-like types with `start`/`end` roles (`trip`). Defaults: open-only (`active`; pass `include_completed` for done), depth 1 (max 2), hard cap 40, America/New_York overdue, spine-root (`area`) bound by a 14-day due window. Honest empty is `{ items: [] }`. Several live edges to the same neighbor yield one row (`about` or `supports` over `relates_to`). Unknown or deleted id is `{ error, suggestion }` like `get`. No writes, no payload bodies, no `suggested_links`. `search` stays the vault-wide list. `get` stays one node.
- `data.aliases` is an optional string array on any node. `upsert` validates it only when the incoming `data` patch includes `aliases` (`[]` clears; malformed patch refuses, including values that fold empty after `name_norm`). A successful aliases write leaves a well-formed non-empty array, or `[]`. Unrelated updates leave legacy values alone. `lookup` ignores malformed legacy aliases. Alias dedupe uses the same `name_norm` as SQL lookup.
- `task`, `goal`, and `spend` accept optional `data.due` (`YYYY-MM-DD`) via the `due` date field (role `date`). On `spend`, display is Date — the calendar day of the line, not a task deadline. Compiled `json_schema` enforces the date when present; nodes without due still upsert. Extra `data` keys still write. `due: null` clears. A `ref` field stores a typed UUID pointer and does not create an edge.
- Live nodes are unique on `data.living.{system,id}` for `gmail` | `calendar` | `drive`. That ref is which living object. Look up with `search` `{ living }` (then `get`). Store the ref only — do not fetch or mirror those systems’ bodies.
- Live nodes are unique on `data.code.{system,id}` for `github`. That ref is which GitHub object. Look up with `search` `{ code }` (then `get`). Store the ref only. GitHub is not a living Drive/Sheet. [Pointers](#pointers).
- `data.url` is an optional https href on any type. It is how the Viewer opens a living file that stays the source of truth. It is a sibling of living (and of code), not a key on those objects, and not a second identity.
- After a bot sends mail or clears a calendar event, the same node holds `data.receipt` `{ system, id, kind }`. That pointer is the current picture of done. [Mail and calendar receipt](#mail-and-calendar-receipt).
- No `get_vault_health` / `run_maintenance` / `audit_links` tools — those jobs are instance routines the user can run ([`VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/))
- No rewrite or picture tool. `get` + `list_activity` + `upsert` is the loop. [Current picture](#current-picture).

## Current picture

A node is what is true now, short. History stays in activity.

`get` returns that current picture: type, title, status, `payload`, `data`, metadata, `created_at`, `updated_at` for if-match, incident edges with neighbor titles, optional blob metadata, and `suggested_links`. It does not return activity rows. It does not grow a diary on the node.

**`payload`** is the written picture. Inline body, or blob metadata when the file lives on disk. A rewrite passes a new `payload` and replaces that body. Omit `payload` and the body stays.

**`data`** is the structured bag (due, living, code, url, receipt, aliases, typed fields). An update merges keys. It is not the diary.

A named **bot** rewrites the picture on purpose. One node at a time. Not a background job. The server does not invent the picture.

1. `get` `{ id }` — the picture as it stands, plus `updated_at`.
2. `list_activity` `{ target: <that id> }` — the writes (`before` / `after`). Raise `limit` or walk `since` when the default page is short.
3. Keep what still matters. Invent nothing.
4. `upsert` that same id with the new short `payload`, any `data` patch that still belongs, and `base_updated_at` from `get`. The write leaves a new activity row.

A bad picture is rebuilt the same way. Activity already holds the snapshots. The bot reads them, writes a short picture, and `get` shows that picture. `undo` of the rewrite restores the previous picture while that row is reversible.

`working_set` is not this loop. It stays the open-work agenda around one id. Age-decay on that agenda is **out** of this amendment. The walk already loads each neighbor as a full node, so `updated_at` is already in memory. A later stale bound would be the same cheap class as the spine-root 14-day due window: no new column, no new query, no new tool. This pass does not invent that window. The picture contract does not need it.

## Mail and calendar receipt

When a bot sends mail or clears a calendar event, **done** is a graph fact on that node. Pointer only.

The user is the human who runs Compose. Named roles are bots. An agent is anything that can reach the vault.

Gmail and Calendar stay the source of truth. The vault does not hold message or event bodies.

### Living is not this fact

`data.living` `{ system, id }` is which living object. Live nodes are unique on that pair for `gmail` | `calendar` | `drive`. `living: null` clears. `search` `{ living }` finds that node. Extra keys on the living object are not a contract. Living reads as `system` and `id` only. There is no `kind` on living.

Activity is the diary of vault writes (`before` / `after` on `create` / `update` / `delete`). `get` does not return those rows. A snapshot that happens to contain living is not sent mail and not a cleared event.

`status: "completed"` is vault work state. It is not a mail or calendar pointer.

Living plus activity do not make done a current picture. Do not hang `kind` on living. Do not treat an activity row as done.

### Shape

One optional key on `data`, same JSONB bag as living and due. Not a column. Not a table. Not a new MCP tool.

```text
data.receipt: { system, id, kind }
```

- **`system`** — `gmail` | `calendar`
- **`id`** — that system’s stable id (the sent message, or the event that is gone)
- **`kind`** — `sent` | `cleared`

Pairing is closed: `sent` goes with `gmail`. `cleared` goes with `calendar`. One receipt object on the node. The current picture is the latest receipt; earlier pointers stay in activity. `receipt: null` clears. Missing receipt is allowed. Incomplete or unknown values refuse.

Live nodes are unique on `data.receipt.{system,id}`. That uniqueness is independent of `data.living`. The same calendar id may be living on a node (this task is that event) and later receipt `cleared` on the same node (the event is gone).

Store the ref only. Do not fetch or mirror Gmail or Calendar bodies into `payload` or `data`.

### Write after send or clear

A named bot writes the receipt after the move in Gmail or Calendar. One node at a time. The server does not invent the receipt.

1. Send the message, or clear the event, in Gmail or Calendar.
2. `get` `{ id }` — current picture and `updated_at`.
3. `search` `{ receipt: { system, id } }` — if a live node already holds that pointer, `get` that id. Do not twin.
4. `upsert` the same node with `data.receipt` `{ system, id, kind }` and `base_updated_at` from `get`. Merge keeps living, due, and other keys. Omit `payload` unless the written picture also changes.
5. The write leaves an activity row. That row is the diary of the patch, not the done fact. `undo` of the upsert restores the previous `data` while the row is reversible. It does not unsend mail or restore a calendar event.

Fixture writes (no personal ids, no bodies):

```text
upsert id=<task uuid> base_updated_at=<from get>
data: { receipt: { system: "gmail", id: "msg-fixture-sent-1", kind: "sent" } }

upsert id=<task uuid> base_updated_at=<from get>
data: { receipt: { system: "calendar", id: "evt-fixture-1", kind: "cleared" } }
```

### How get and search see done

`get` returns `node.data.receipt`. A well-formed receipt is done on the current picture.

`search` `{ receipt: { system, id } }` looks up the unique live receipt, then `get`. Same tool as living lookup. No `list_nodes`. A miss means that pointer is free to write.

`search` `{ living }` is which living object, not done. `search` `{ code }` is which GitHub object, not done.

FTS already walks string values in `data`, so a query of that id or kind can hit. Hits stay id / type / title / snippet / `due`. They do not grow a `receipt` field. `data_equals` matches top-level string keys only and does not match the receipt object.

### Out

No new MCP tool. No new store. No mail or event bodies in the vault. No `kind` on `data.living`. No embeddings.

## Pointers

A pointer is a typed graph fact that names something without copying it. Pointers are not one string bag. Each shape has its own key. A clone can tell them apart.

The user is the human who runs Compose. Named roles are bots. An agent is anything that can reach the vault.

Node identity stays UUID. That is not a pointer.

| Shape | Key | What it is | How an agent finds it |
| --- | --- | --- | --- |
| **living** | `data.living { system, id }` | This node is that Gmail, Calendar, or Drive object. Unique on live nodes. No `kind`. | `search { living }` then `get` |
| **href** | `data.url` | https open address. Any type. Not unique. | `get`. FTS and `data_equals: { url }` can hit the string |
| **receipt** | `data.receipt { system, id, kind }` | Done after send or clear. Unique on live `system`+`id`. | `search { receipt }` then `get` |
| **code** | `data.code { system, id }` | This node is that GitHub object. Unique on live nodes. No `kind`. | `search { code }` then `get` |
| **blob** | `payload.blob_id` | Bytes in the vault. | `get` (metadata). Bytes: `GET /blobs/:id` |
| **ref** | a `kind: ref` field | UUID of another node. Not an edge. | `get` |
| **alias** | `data.aliases` | Alternate names. Not an outside-system pointer. | `lookup` |

Do not hang GitHub on living. Do not hang Drive on code. Do not treat a blob as a living file. Do not treat receipt as living.

`search { living }` and `search { code }` are the product keys. There is no `search { origin }`. Hard cut. No alias for the old word.

### Living plus href

A living Drive file or Sheet stays the source of truth. The graph holds a pointer, not a copy. Gmail and Calendar use the same living shape.

```text
data.living: { system, id }
data.url: https://…
```

- **`living.system`** — `gmail` | `calendar` | `drive`
- **`living.id`** — that system’s stable id
- **`url`** — the https href the Viewer opens. Trimmed. No credentials. Max 2048 characters

Extra keys on the living object are not a contract. Living cannot derive the open href. A Drive id is a Sheet, a Doc, or a generic file; those systems use different URL prefixes. Living has no `kind`, so the Viewer cannot invent the URL. Hang the href as a sibling.

Missing url is allowed. `url: null` clears. Omit the key and url stays. Incomplete, non-https, credentialed, or non-string values refuse. Validation runs when the incoming `data` patch includes `url`. The Viewer opens only a well-formed https href.

Url is not unique. Uniqueness stays on `data.living.{system,id}` (and separately on `data.code.{system,id}`). Two nodes may hold the same href; `search { living }` is how an agent finds the living object.

Url without living is a relevant link the Viewer can open. It is not which object. A living file that stays source of truth is living plus url.

Store the href only. Do not fetch or mirror the file body. Do not ingest a blob for this.

Write (fixture ids only):

```text
upsert type=note title="Fixture sheet"
data: { living: { system: "drive", id: "file-fixture-1" }, url: "https://example.test/drive/file-fixture-1" }
```

1. `search { living: { system, id } }` — if a live node already holds that object, `get` that id. Do not twin.
2. `get { id }` when updating.
3. `upsert` with `data.living` and `data.url`. Merge keeps due, receipt, aliases, and other keys.

`get` returns `node.data.living` and `node.data.url`. Hits stay id / type / title / snippet / `due`. They do not grow a `url` field.

When `data.url` is a well-formed https URL, Detail properties offer Open. That click leaves the window for the living file. It does not write. Contract: [`VIEWER.md`](./VIEWER.md).

### Code

GitHub stays the source of truth for that object. The graph holds `data.code { system, id }` with `system: "github"`. Unique on live nodes. `code: null` clears. `search { code }` then `get`. Store the ref only. Do not fetch or mirror the repository body.

Code is not living. A later git slug is not this amendment. Cursor Origin stays a product name, not a vault key and not a `code.system` value.

Fixture: `{ system: "github", id: "repo-fixture-1" }`.

### Out

No new MCP tool. No new store. No file, mail, event, or repository bodies in the vault. No blob for a living file. No `kind` on living or code. No `url` on those objects. No uniqueness on url. No embeddings.

## Project spend

`spend` is a seed type: one recorded money line under a project (a bid or a payment). Artifact. `parent_types`: `["project"]`. Hue `teal`, glyph `Receipt`. Views: `list` (`default_view: "list"`). The Viewer opens it from that declared view. `inspect_ontology` and `bootstrap` list it.

It hangs under a `project` via `child_of` (child → parent; at most one). It does not hang under `area` or `goal`. `upsert` the line, then `link` it to the project. `search` `{ type: "spend", under: <project uuid> }` lists the lines.

### Fields

These fields are already on the type. `json_schema` is compiled from the template (`additionalProperties: true`; `needed` is a hint, not JSON Schema `required`). When a key is present, upsert validates it. `null` clears. Extra `data` keys still write. `search` and `get` treat them as real fields. `get` returns the validated `data` and does not return blob bytes for a spend line.

- **`amount`** — `number`. Display Amount. `needed: true`. Example `12.50`. Typical line is positive; v1 does not constrain sign. `data_equals` accepts strings only, so it cannot filter this key.
- **`currency`** — `string`. Display Currency. `needed: true`. ISO-4217 convention (`USD`). Not a closed enum.
- **`due`** — `date`, role `date`. Display Date. `needed: false`. Calendar day of the line. Same key and validation as `task.due`, so `search` `{ due, due_on_or_before, due_on_or_after }` and hit `due` apply unchanged.
- **`vendor`** — `string`. Display Vendor. `needed: false`. Name on the quote or receipt. Fixture: `Fixture vendor`.
- **`stage`** — `enum` `quoted` | `paid`. Display Stage. `needed: true`. Bid vs payment. Filter with `data_equals: { stage: "paid" }`.

**Vendor is a string, not a `ref` to `company`.** `company` stays the type for an organization you have a relationship with. A `ref` would require a second node before a line can exist, and a `ref` does not create an edge. An agent that already has a `company` may `relates_to` it.

**Quoted vs paid is one enum (`stage`), not two types and not two amounts.** Search can filter. Two types would fork the catalog. Two amounts on one node would be ledger-shaped, and `data_equals` cannot match numbers. When a bid is taken, patch the same node (`stage: "paid"`, amount or date if they changed). Activity keeps the before snapshot. Write a second line when they are truly two lines.

### Project budget

`project` has optional `budget_amount` (`number`) and `budget_currency` (`string`, same `USD` convention). The envelope lives on the project node. Seed apply fills those fields only when missing; it does not overwrite a user edit. Remaining is budget minus paid lines — an agent reads those fields. Not a stored key and not a rollup tool.

### Write and read

1. `upsert` the project with `data.budget_amount` / `data.budget_currency` when there is an envelope.
2. `upsert` a `spend`. Title is the short label; money lives in `data`.
3. `link` `{ from_id: <spend>, to_id: <project>, relation_type: "child_of" }` with if-match timestamps from `get`.
4. `search` `{ type: "spend", under: <project uuid> }` lists lines. `{ type: "spend", data_equals: { stage: "quoted" } }` lists bids. `{ type: "spend", due_on_or_before: "2026-08-20" }` uses the same date window as `task.due`. `get` returns the validated `data` fields and no blob bytes.
5. `working_set` on the project includes live `spend` children (open-only default). The date-role value appears as `due` on the item. Completing or archiving a paid line drops it from that default agenda.

Fixture create (no personal amounts):

```text
upsert type=spend title="Materials bid"
data: { amount: 12.50, currency: "USD", due: "2026-08-20", vendor: "Fixture vendor", stage: "quoted" }
```

### Why this is not a ledger

One type, one line, one envelope on the project. Agents record validated fields instead of a note that cannot add up. Bank or card import, double-entry, accounts, a second ledger store, embeddings, and new MCP write verbs stay out. `get` / `search` read these `data` keys; `working_set` walks `child_of` children and the date-role field.

## Runtime

- Docker Compose: Postgres 16 + Foundation server
- Durable files under `FOUNDATION_DATA`
- Localhost MCP at `http://127.0.0.1:8787/mcp` with `Authorization: ApiKey <FOUNDATION_API_KEY>`
- Read-only window at `/view` (same API key; not a second store). Compose publishes MCP / health / agent blobs on `127.0.0.1:8787` and `/view` on `8788` (`http://127.0.0.1:8788/view`; from another machine, `http://<this-host>:8788/view`). Unlock with the key, HttpOnly cookie `Path=/view`. After unlock: Home is Recents (5, newest first), open tasks (5, due-urgency), and type folders for types that have live objects. Collection and Detail are pages in the content host. Search is a rail overlay. The rail is Home and Search. A click on a record or graph node opens that object's detail page — not a docked inspector. Types carry hue and glyph; Viewer reads them. Dark is first paint; Light and System are real choices. A stored `paper` choice reads as Light. The cookie does not unlock `/mcp` or `/blobs/:id`. Contract: [`VIEWER.md`](./VIEWER.md).
- Blobs: `$FOUNDATION_DATA/blobs/<uuid>`; ingest on `upsert`; bytes via `GET /blobs/:id`

## Locked (do not reopen)

- **14 tools** — names above. This amendment adds no tool. The current picture is `get` / `upsert` / `list_activity`. A further tool still needs a SPEC amendment
- **FTS now** — embeddings/hybrid search is later optional work, not current search

## Non-goals (v1)

- Mobile app, Watch, Apple auth, billing, iCloud vault sync
- Multi-tenant SaaS, complex OAuth for third parties
- Dual write to a markdown vault + database (one store)
- Proposal/approve inbox for ontology changes
- Write-ACL / default-deny (the API key is the gate)
- Bank / card import, a second ledger, double-entry accounting, a rollup tool, or stored remaining on `project`
- Mail, calendar, Drive, or GitHub bodies in the vault (those systems stay source of truth; the graph holds `data.living`, `data.code`, `data.url`, and `data.receipt` refs only)

## Contributor checklist

Typecheck and tests pass. Destructive MCP tools stay behind `confirm: true`. Do not put vault contents, `FOUNDATION_DATA` files, or graph dumps in pull requests. When a change alters the graph or vault shape, update [`ARCHITECTURE.md`](./ARCHITECTURE.md) in the same PR.
