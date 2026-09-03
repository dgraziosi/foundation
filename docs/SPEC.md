# Foundation — product contract

Keep this current as decisions land.

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
- **record** — the node
- **activity** — the audit log
- **receipt** — done after send or clear (`data.receipt { system, id, kind }`)
- **ref** — a typed UUID field on `data`. Points at another node. Not an edge
- **agent** — anything that can reach the vault MCP
- **user** — the human who runs this vault on this machine
- **bot** — a named role that acts through an agent

Do not call the graph “the Vault.”

Feature brands only: Dream, Vault. Url, repo, and link are ordinary words.

Do not use “origin” as a Foundation key, search filter, or shape name. Cursor Origin is source control. It is not a vault word.

Starter recipes: [`AGENTS.md`](./AGENTS.md).

## Url, repo, and link

Drive / Gmail / Calendar identity is `search { url }` `{ system, id }`. `system` is `gmail` | `calendar` | `drive`. Refuses `github`. Unique on live records. No `kind`. `url: null` on upsert clears uniqueness. Link is the edge tool. It is not a pointer key, not a search selector, and not a data identity bag.

Because `data.url` is already the https string, that object is not stored as `data.url`. Persist uses a dedicated unique index, parse, and refuse (same family as repo and receipt). `url.ts` stays the https helper.

Viewer Open stays `data.url` (https string, not unique). That string is not which Drive / Gmail / Calendar object. `search { url }` is not `data_equals` on the https string. A string `search.url` refuses from `tools/call` with `{ error, suggestion }`. `tools/list` advertises `{ system, id }`, not a string.

GitHub is `data.repo { system, id }` and `search { repo }`. `system` is `github`. Refuses gmail / calendar / drive. Unique on live records. `repo: null` clears. Cursor Origin is not a vault key and not a `repo.system` value.

Receipt is unchanged: `data.receipt { system, id, kind }` and `search { receipt }`.

Identity registry. One storage shape and one unique-index family: upsert `url`, `data.repo`, and `data.receipt`. No dual-read of leftover `living` / `code` / `origin` / `link`. `search { living }`, `search { code }`, `search { origin }`, and `search { link }` are gone. Leftover rows and leftover writes migrate into `url` or `repo` by system, then the leftover keys are stripped. There is no leftover refuse path. Do not reintroduce `origin` as a vault key.

| Bag | Key | What it is | How an agent finds it |
| --- | --- | --- | --- |
| Drive / Gmail / Calendar | upsert `url { system, id }` | This record is that Drive, Gmail, or Calendar object. Unique on live records. No `kind`. | `search { url }` then `get` |
| Viewer Open | `data.url` | https address. Any type. Not unique. | `get`. FTS and `data_equals: { url }` |
| GitHub | `data.repo { system, id }` | This record is that GitHub object. Unique on live records. No `kind`. | `search { repo }` then `get` |
| Receipt | `data.receipt { system, id, kind }` | Done after send or clear. Unique on live `system`+`id`. | `search { receipt }` then `get` |

`data.url` is trimmed, https, no credentials, max 2048. `data.url: null` clears the https address. Missing is allowed. Not unique. Not which Drive / Gmail / Calendar object. Open leaves the window for that file.

Store the ref only. A Drive id cannot derive the https address (no `kind`; Docs, Sheets, and files use different prefixes). Hang the href as `data.url`. A later git slug is out.

Indexes: `nodes_url_live_uidx`, `nodes_repo_live_uidx`. Leftover `nodes_living_live_uidx`, `nodes_code_live_uidx`, `nodes_link_live_uidx`, and `nodes_origin_live_uidx` are gone.

Fixtures only: `file-fixture-1`, `repo-fixture-1`, `https://example.test/drive/file-fixture-1`. No file, mail, event, or repository bodies. Url and repo use `search`, `get`, and `upsert`. No new store.

Write (fixture ids only):

```text
upsert type=note title="Fixture sheet"
url: { system: "drive", id: "file-fixture-1" }
data: { url: "https://example.test/drive/file-fixture-1" }
```

1. `search { url: { system, id } }` — if a live record already holds that object, `get` that id. Do not twin.
2. `get { id }` when updating.
3. `upsert` with `url` and `data.url`. Merge keeps due, receipt, aliases, and other keys.

`get` is the record. Hits stay id / type / title / snippet / `due`. They do not grow a `url` field.

When `data.url` is a well-formed https URL, Detail properties offer Open. That click leaves the window for that file. It does not write. Contract: [`VIEWER.md`](./VIEWER.md).

`data.url` without a Drive / Gmail / Calendar url is a relevant address the Viewer can open. It is not which object.

GitHub write: `{ system: "github", id: "repo-fixture-1" }`. `search { repo }` then `get`.

### Everyday words (clone)

A clone does not land insider words. Not a speech to a person.

- **record** — the node
- **activity** — the audit log
- **user** — the human who runs this vault on this machine
- **bot** — a named role
- Feature brands only: Dream, Vault. Url, repo, and link are ordinary words.
- Tester fails a new glossary word that is not a feature name, same as OPERATIONS voice.

Do not put this bar in Vault Keeper. Do not add a bot for it.

## Primary users

1. **Agents** via MCP — default interface (Cursor, Claude, and other MCP clients)
2. **Users** via the window on the same API (`/view`). Same graph as MCP. The window is not a second store. Journal title and markdown body may write (if-match, actor user). Other types stay read-only. Surfaces, shell, tokens, and states: [`VIEWER.md`](./VIEWER.md).

## Starter spine

```text
area → project → goal → habit | task
```

Recommended structure: Area → project → goal → task. Prefer a habit under a goal; a habit does not need a goal parent. A task may child_of a goal or a project. Prefer a spend under a project; a spend does not need a project parent. Prefer a lesson or decision under an area, project, or goal; they do not need that parent.

**Area** is the spine root (life domain + what you value). The spine is preferred placement, not a hard gate: `habit` may skip a goal parent; `task` may `child_of` `project` (skip a dummy goal). Prefer goal when there is a real outcome. `task` still cannot `child_of` `area`. Seed artifacts include person, place, company, journal, idea, lesson, note, trip, decision, spend. A lesson or decision may hang under area, project, or goal and does not need that parent. Hierarchy verb is `child_of`. Associative seeds: relates_to, supports, inspired_by, references, about.

A `spend` is one recorded money line. Prefer hanging it under a project with `child_of`. A spend does not need a project parent. A project may hold optional `budget_amount` and `budget_currency` so an envelope can live on the project node. Field template, validation, and search: [Project spend](#project-spend).

Agents can add types and relations over time. No approval inbox.

## Agent API

These names are the current surface. Full parameters: [`docs/MCP_TOOLS.md`](./MCP_TOOLS.md). Rewrite one record with `get`, `upsert`, and `list_activity`.

`bootstrap`, `search`, `lookup`, `get`, `working_set`, `upsert`, `delete`, `link`, `unlink`, `inspect_ontology`, `manage_type`, `manage_relation`, `list_activity`, `undo`.

- Destructive tools (`delete`, `unlink`, `undo`, `manage_type` retire) need a key with destructive scope. Ordinary upsert and link do not. A key without that scope returns `{ error, suggestion }`.
- Identity is UUID. If you already have a UUID and need the record (payload, data, edges, if-match), call `get`. `get` does not return activity. If you already have a UUID and need the open work around it, call `working_set`. `lookup` then `working_set` is the name → act path. How a bot rewrites one record: [Rewrite one record](#rewrite-one-record).
- Updates (`upsert` with an existing id, `link`) and destructive node or edge writes (`delete`, `unlink`, and `undo` of a node or edge row) are if-match: pass `base_updated_at` / endpoint timestamps from `get`. Compared at millisecond precision (same instant `get` returns). Mismatch → `{ error, suggestion }` (get and retry), never “node not found.” A stale delete leaves the node live. Two connections racing one node leave one winner and one mismatch. Not a write-ACL. Changing `type` on upsert revalidates every live incident edge against the new type (and the neighbor’s current type). An edge the ontology would now refuse → `{ error, suggestion }` (unlink that edge with if-match, then retry). The write does not drop edges and does not leave an invalid leftover. `delete` refuses when a live record still holds a declared `ref` field pointing at that id → `{ error, suggestion }` (clear `data.<field>` with upsert and if-match, then retry). Those fields stay pointers, not edges. `link` accepts one edge or a capped `edges[]` (1–20). The whole batch validates, then one transaction writes all edges or none. One activity receipt per written edge. Each edge carries both endpoint timestamps; a later edge does not inherit CAS from an earlier edge that named the same node. Shared endpoints still use one agreed timestamp; missing or disagreeing timestamps refuse the batch. Linking does not change `node.updated_at`. `undo` still writes a compensating row when the invert is safe; that compensating row is not reversible. Type and relation undo have no node timestamp from `get`.
- `manage_type` can retire an unused authored type (`action: "retire"`). That call needs a key with destructive scope. System seed types cannot be retired. Live nodes of that type refuse; leftover soft-deleted nodes follow type-create undo (`purge_deleted: true` or restore those deletes first). A type owns `fields` (the field template), view declarations (`id` plus optional `filter` / `sort` / `group`), `default_view`, `hue`, and `glyph`. `json_schema` is compiled from `fields` (`additionalProperties: true`; `needed` is not JSON Schema `required`). Seed types already declare views (`task` defaults to `board`) and first-paint hue/glyph. The Viewer reads that contract; it does not infer views or hardcode a type catalog. System seed types may edit description, `fields`, hue, glyph, and the query on views they already declare. Their slug, kind, parent_types, label, and ordered view **ids** stay locked. Authored types keep the wider patch, including the view id list. Seed apply fills **missing** seed fields and missing seed hue/glyph only; it does not overwrite a user edit.
- `upsert` **replaces** `payload` when that field is passed (omit it and the body stays). It **merges** `data` on update (partial patch does not wipe other keys). Create accepts `idempotency_key` so a retry does not twin a node. Create (no `id`) runs the same `lookup` matcher on the new title, type-scoped. Exact title or unique exact alias returns those write-ready candidates and does not write unless `allow_duplicate: true`. Token, fuzzy, and space-compacted matches warn (`duplicate_warnings`) and do not block. Same-name entities stay allowed with that override. Update/CAS behavior is unchanged. When a type has `json_schema`, upsert validates merged `data` and returns `{ error, suggestion }` on a miss. A bot that rewrites a record passes the new short `payload` and `base_updated_at` from `get`.
- `upsert` (create, and update when the title changes) returns `suggested_links` from Postgres FTS on the new title — not embeddings. Each item is `{ kind, target: { id, type, title }, reason }` where `kind` is a live relation slug and `target` is a live node that already exists. Spine types with `parent_types` get the live hierarchy relation (`kind: hierarchy`, seed `child_of`) to an allowed parent whose title matches; a title that matches a live node whose type sits in an associative relation’s `target_types` (seed `about` → `person`) gets that relation; otherwise the unconstrained associative (empty source and target, seed `relates_to`). Skip self and already-linked pairs. A node with a live hierarchy parent is not offered a second parent (targeted / unconstrained suggestions may still appear). Cap 5. Empty graph or no match → `[]`. **Never creates an edge** and never adds a type or relation. `link` is how an accepted suggestion becomes an edge. `get` may return the same list for a node that still has no edges. A seed slug rename does not change these rules when `kind`, `parent_types`, and `target_types` stay the same.
- Activity stores `actor` / `actor_label` from the authenticated key (who wrote). Clients cannot set those fields. Viewer journal writes stamp the user. Not a permission matrix. Every node write leaves a row (`create` / `update` / `delete`) with `before` / `after` snapshots of that node (`payload`, `data`, title, type, status). Blob snapshots store `payload.blob_id` plus blob metadata, not file bytes. `list_activity` `{ target: <node id> }` is the diary for that node. Newest first. Default limit 50, max 200. `since` is a time window (`created_at >=`), not a page. After a full page, send `next` as `cursor`. `count` matches the same filters. `get` does not include these rows.
- `search` is Postgres FTS (title + `data` + extracted inline payload text; Latin accents folded). `query` is optional when `type`, `status`, `under` (child_of parent), `since`, `url`, `repo`, `receipt`, `due` (`overdue` | `today` in America/New_York), `due_on_or_before`, `due_on_or_after`, or `data_equals` is set, so agents can list without a word. `data_equals` is JSONB equality on one or a few top-level `data` keys (not a column per key). Hits include `due` when `data.due` is set. Default `limit` 20, max 100. `count` is the total for those filters. After a full page, send `next` as `cursor`. `since` is a time window (`updated_at >=`), not a page. Empty `{}` and `{ cursor }` with no filter refuse. A string `search.url` refuses from `tools/call` with `{ error, suggestion }`. `tools/list` advertises `{ system, id }`, not a string. Not embeddings. No `list_nodes`.
- `lookup` resolves one or more names in one request and returns a result per input (`exact`, `alias`, `candidate`, `ambiguous`, `no_match`). Unique UUID, unique folded title (`name_norm`: case, accent, punctuation, whitespace), or unique user-authored `data.aliases` entry may bind a UUID. Token and fuzzy matches are always `candidate`. Duplicate exact titles and alias/title collisions are `ambiguous`. Each useful candidate includes `id`, `type`, canonical `title`, `updated_at`, `match`, `confidence`, and sits on the surrounding `candidates` list so a later confirm/link/upsert can if-match. `confidence` ranks; it is not a calibrated probability and does not authorize a write. For `candidate` or `ambiguous`, ask the user to confirm a UUID before any mutation that depends on the identity; `get` is safe for inspection. `lookup` never writes, merges, creates, or picks an ambiguous candidate. Compact/no-space equality is candidate-only. Matching is type-scoped when `type` is supplied. Not embeddings. No hidden nickname list. After a bound UUID, `working_set` is the one agenda read around that node.
- `working_set` is a read-only rooted agenda. Given one live node id, it returns lean open work around that root (dues first), plus the parent chain when the type has `parent_types`. Walks follow the live ontology: hierarchy down (`kind: hierarchy` and equivalent `semantic_parent_slug` children) for types that can be parents (they appear in someone’s `parent_types`); targeted associatives plus unconstrained associatives for an about-target (the root slug sits in some relation’s `target_types`; no invented hierarchy); hierarchy plus all associatives for event-like types with `start`/`end` roles. Defaults: open-only (`active`; pass `include_completed` for done), depth 1 (max 2), hard cap 40, America/New_York overdue, spine-root (`kind: spine` and empty `parent_types`) bound by a 14-day due window. Honest empty is `{ items: [] }`. Several live edges to the same neighbor yield one row (`about` or `supports` over `relates_to`). Unknown or deleted id is `{ error, suggestion }` like `get`. No writes, no payload bodies, no `suggested_links`. `search` stays the vault-wide list. `get` stays one node.
- `data.aliases` is an optional string array on any node. `upsert` validates it only when the incoming `data` patch includes `aliases` (`[]` clears; malformed patch refuses, including values that fold empty after `name_norm`). A successful aliases write leaves a well-formed non-empty array, or `[]`. Unrelated updates leave legacy values alone. `lookup` ignores malformed legacy aliases. Alias dedupe uses the same `name_norm` as SQL lookup.
- `task`, `goal`, and `spend` accept optional `data.due` (`YYYY-MM-DD`) via the `due` date field (role `date`). On `spend`, display is Date — the calendar day of the line, not a task deadline. Compiled `json_schema` enforces the date when present; nodes without due still upsert. Extra `data` keys still write. `due: null` clears. A `ref` field stores a typed UUID and does not create an edge. Delete of that target refuses while a live record still holds the id in a declared `ref` field.
- Live records are unique on upsert `url { system, id }` for `gmail` | `calendar` | `drive`. That ref is which Drive, Gmail, or Calendar object. Look up with `search` `{ url }` (then `get`). Store the ref only — do not fetch or mirror those systems’ bodies.
- Live records are unique on `data.repo.{system,id}` for `github`. That ref is which GitHub object. Look up with `search` `{ repo }` (then `get`). Store the ref only. GitHub is not a Drive/Sheet. [Url, repo, and link](#url-repo-and-link).
- `data.url` is an optional https address on any type. It is how the Viewer opens a file that stays the source of truth. It is not the Drive / Gmail / Calendar url, and not a second identity.
- After a bot sends mail or clears a calendar event, the same record holds `data.receipt` `{ system, id, kind }`. That is done after send or clear. [Mail and calendar receipt](#mail-and-calendar-receipt).
- No `get_vault_health` / `run_maintenance` / `audit_links` tools — those jobs are instance routines the user can run ([`VAULT_HEALTH.md`](./VAULT_HEALTH.md): host script [`scripts/keep-vault-up.sh`](../scripts/keep-vault-up.sh) plus the weekday 9:15 written report, [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/))
- No rewrite tool. `get` + `list_activity` + `upsert` is the loop. [Rewrite one record](#rewrite-one-record).

## Rewrite one record

A record is what is true now, short. History stays in activity.

`get` returns that record: type, title, status, `payload`, `data`, metadata, `created_at`, `updated_at` for if-match, incident edges with neighbor titles, optional blob metadata, and `suggested_links`. It does not return activity rows. It does not grow a diary on the node.

**`payload`** is the written body. Inline body, or blob metadata when the file lives on disk. A rewrite passes a new `payload` and replaces that body. Omit `payload` and the body stays.

**`data`** is the structured bag (due, repo, url (https), receipt, aliases, typed fields). An update merges keys. It is not the diary.

A named **bot** rewrites the record on purpose. One record at a time. Not a background job. The server does not invent the body.

1. `get` `{ id }` — the record as it stands, plus `updated_at`.
2. `list_activity` `{ target: <that id> }` — the writes (`before` / `after`). Page until `next` is omitted. `count` is the matching total, not a stop rule. A last page can be shorter than `count` and still be done. `since` is a time window, not a page.
3. Keep what still matters. Invent nothing.
4. `upsert` that same id with the new short `payload`, any `data` patch that still belongs, and `base_updated_at` from `get`. The write leaves a new activity row.

A bad body is rebuilt the same way. Activity already holds the snapshots. The bot reads them, writes a short body, and `get` shows that record. `undo` of the rewrite restores the previous body while that row is reversible.

`working_set` is not this loop. It stays the open-work agenda around one id. Age-decay on that agenda is **out** of this amendment. The walk already loads each neighbor as a full node, so `updated_at` is already in memory. A later stale bound would be the same cheap class as the spine-root 14-day due window. This pass does not invent that window. The rewrite loop does not need it.

## Mail and calendar receipt

When a bot sends mail or clears a calendar event, **done** is a graph fact on that record. Store the ref only.

The user is the human who runs this vault on this machine. Named roles are bots. An agent is anything that can reach the vault.

Gmail and Calendar stay the source of truth. The vault does not hold message or event bodies.

### Url is not this fact

`url` `{ system, id }` is which Drive, Gmail, or Calendar object. Live records are unique on that pair for `gmail` | `calendar` | `drive`. `url: null` on upsert clears uniqueness. `search` `{ url }` finds that record. Extra keys on that object are not a contract. The url reads as `system` and `id` only. There is no `kind` on that url. Link is the edge tool.

Activity is the diary of vault writes (`before` / `after` on `create` / `update` / `delete`). `get` does not return those rows. A snapshot that happens to contain a url is not sent mail and not a cleared event.

`status: "completed"` is vault work state. It is not a mail or calendar receipt.

Url plus activity do not make done. Do not hang `kind` on url. Do not treat an activity row as done.

### Shape

One optional key on `data`, same JSONB bag as due. Not a column. Not a table. Receipt uses `get`, `search`, and `upsert`.

```text
data.receipt: { system, id, kind }
```

- **`system`** — `gmail` | `calendar`
- **`id`** — that system’s stable id (the sent message, or the event that is gone)
- **`kind`** — `sent` | `cleared`

Pairing is closed: `sent` goes with `gmail`. `cleared` goes with `calendar`. One receipt object on the record. The latest receipt is done; earlier receipts stay in activity. `receipt: null` clears. Missing receipt is allowed. Incomplete or unknown values refuse.

Live records are unique on `data.receipt.{system,id}`. That uniqueness is independent of url. The same calendar id may be url on a record (this task is that event) and later receipt `cleared` on the same record (the event is gone).

Store the ref only. Do not fetch or mirror Gmail or Calendar bodies into `payload` or `data`.

### Write after send or clear

A named bot writes the receipt after the move in Gmail or Calendar. One node at a time. The server does not invent the receipt.

1. Send the message, or clear the event, in Gmail or Calendar.
2. `get` `{ id }` — the record and `updated_at`.
3. `search` `{ receipt: { system, id } }` — if a live record already holds that receipt, `get` that id. Do not twin.
4. `upsert` the same record with `data.receipt` `{ system, id, kind }` and `base_updated_at` from `get`. Merge keeps due and the other live keys. Omit `payload` unless the written body also changes.
5. The write leaves an activity row. That row is the diary of the patch, not the done fact. `undo` of the upsert restores the previous `data` while the row is reversible. It does not unsend mail or restore a calendar event.

Fixture writes (no personal ids, no bodies):

```text
upsert id=<task uuid> base_updated_at=<from get>
data: { receipt: { system: "gmail", id: "msg-fixture-sent-1", kind: "sent" } }

upsert id=<task uuid> base_updated_at=<from get>
data: { receipt: { system: "calendar", id: "evt-fixture-1", kind: "cleared" } }
```

### How get and search see done

`get` returns `node.data.receipt`. A well-formed receipt is done on the record.

`search` `{ receipt: { system, id } }` looks up the unique live receipt, then `get`. Same tool as url lookup. No `list_nodes`. A miss means that receipt is free to write.

`search` `{ url }` is which Drive, Gmail, or Calendar object, not done. `search` `{ repo }` is which GitHub object, not done.

FTS already walks string values in `data`, so a query of that id or kind can hit. Hits stay id / type / title / snippet / `due`. They do not grow a `receipt` field. `data_equals` matches top-level string keys only and does not match the receipt object.

### Out

No new store. No mail or event bodies in the vault. No `kind` on url. No embeddings.

## Project spend

`spend` is a seed type: one recorded money line (a bid or a payment). Artifact. `parent_types`: `["project"]`. Hue `teal`, glyph `Receipt`. Views: `list` (`default_view: "list"`). The Viewer opens it from that declared view. `inspect_ontology` and `bootstrap` list it.

Prefer hanging it under a `project` via `child_of` (child → parent; at most one). A spend does not need a project parent — do not invent a dummy project to record a line. If you hang it, it must be a `project`, not `area` or `goal`. `upsert` the line; `link` it to a project when there is one. `search` `{ type: "spend", under: <project uuid> }` lists the lines under that project.

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

- Host programs: Postgres 16 + Foundation server (`pnpm start`), same user, one data folder
- Durable files under `FOUNDATION_DATA`
- Localhost MCP at `http://127.0.0.1:8787/mcp` with `Authorization: ApiKey <key>`. `FOUNDATION_API_KEY` is the bootstrap root key. Named keys live in `$FOUNDATION_DATA/api-keys.json` (hashes only). Mint with `scripts/mint-api-key.sh`.
- Window at `/view` (not a second store). The person types the vault key. When `FOUNDATION_VIEW_KEY` is set, that is the vault key; MCP keys do not open the window. When unset, the house key (`FOUNDATION_API_KEY` / named keys) still opens it. MCP / health / agent blobs on `127.0.0.1:8787` and `/view` on `8788` (`http://127.0.0.1:8788/view`). Off-box is `VIEW_HOST=0.0.0.0` (`http://<this-host>:8788/view`). Unlock with the vault key, HttpOnly cookie `Path=/view`. After unlock: Home is Today (always, even at journal count 0), Recents (5, newest first), open tasks (5, due-urgency), and type folders for types that have live objects. Collection and Detail are pages in the content host. A journal opens a writing page (title + markdown body, autosave, if-match). Search is a rail overlay. The rail is Home and Search. A click on a record or graph node opens that object's detail page — not a docked inspector. Types carry hue and glyph; Viewer reads them. Dark is first paint; Light and System are real choices. A stored `paper` choice reads as Light. The cookie does not unlock `/mcp` or `/blobs/:id`. Contract: [`VIEWER.md`](./VIEWER.md).
- Blobs: `$FOUNDATION_DATA/blobs/<uuid>`; ingest on `upsert`; bytes via `GET /blobs/:id`

## Locked (do not reopen)

- **FTS now** — embeddings/hybrid search is later optional work, not current search

## Non-goals (v1)

- Mobile app, Watch, Apple auth, billing, iCloud vault sync
- Multi-tenant SaaS, complex OAuth for third parties
- Dual write to a markdown vault + database (one store)
- Proposal/approve inbox for ontology changes
- Write-ACL / default-deny beyond the API key and its scopes
- Bank / card import, a second ledger, double-entry accounting, a rollup tool, or stored remaining on `project`
- Mail, calendar, Drive, or GitHub bodies in the vault (those systems stay source of truth; the graph holds url, `data.repo`, `data.url`, and `data.receipt` refs only)

## Contributor checklist

Typecheck and tests pass. Destructive MCP tools stay behind destructive scope on the key. Do not put vault contents, `FOUNDATION_DATA` files, or graph dumps in pull requests. When a change alters the graph or vault shape, update [`ARCHITECTURE.md`](./ARCHITECTURE.md) in the same PR.
