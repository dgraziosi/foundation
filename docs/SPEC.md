# Foundation — product contract

Living spec. Keep this current as decisions land.

## Purpose

Foundation is a **personal ontology + MCP server** for AI agents. It is durable structured context (a typed graph) that agents read and write — not chat memory, not a notes app with an API bolted on.

Named after Asimov’s Foundation: carry structured knowledge forward so you and your agents are not starting from zero.

**Not for sale.** Open on GitHub so others can self-host for their own agents.

Do not commit personal life data, documents, or secrets to this repository. Those belong in the operator’s vault, not in git.

## Locked glossary

Short analog: app / folder / links → Foundation / vault / graph.

- **Foundation** — the product
- **vault** — one instance (`FOUNDATION_DATA` + Postgres)
- **graph** — the live network in that vault
- **ontology** — the vocabulary (types and relations)
- **blob** — a file on a node
- **agent** — anything that can reach the vault MCP
- **operator** — the human who runs Compose

Do not call the graph “the Vault.”

Starter recipes: [`AGENTS.md`](./AGENTS.md).

## Primary users

1. **Agents** via MCP — default interface (Cursor, Claude, and other MCP clients)
2. **Operators** via the read-only window on the same API (`/view`). Same graph as MCP. The window is not a second store. Surfaces, shell, tokens, and states: [`VIEWER.md`](./VIEWER.md).

## Starter spine

```text
area → project → goal → habit | task
```

Recommended structure: Area → project → goal → task. A habit hangs under a goal. A task may child_of a goal or a project. A spend hangs under a project.

**Area** is the spine root (life domain + what you value). The spine is preferred placement, not a hard gate: `task` may `child_of` `project` (skip a dummy goal). Prefer goal when there is a real outcome. `task` still cannot `child_of` `area`. Seed artifacts include person, place, company, journal, idea, lesson, note, trip, decision, spend. Hierarchy verb is `child_of`. Associative seeds: relates_to, supports, inspired_by, references, about.

A `spend` is one recorded money line under a project. Hang it with `child_of` that project. A project may hold optional `budget_amount` and `budget_currency` so an envelope can live on the project node. Field template, validation, and search: [Project spend](#project-spend).

Agents can add types and relations over time. No approval inbox.

## Agent API (14 tools)

These names are the current surface. Full parameters: [`docs/MCP_TOOLS.md`](./MCP_TOOLS.md). This amendment adds `working_set`. A further tool still needs a SPEC amendment.

`bootstrap`, `search`, `lookup`, `get`, `working_set`, `upsert`, `delete`, `link`, `unlink`, `inspect_ontology`, `manage_type`, `manage_relation`, `list_activity`, `undo`.

- Destructive tools (`delete`, `unlink`, `undo`, `manage_type` retire) require `confirm: true`
- Identity is UUID. If you already have a UUID and need the node (payload, edges, if-match), call `get`. If you already have a UUID and need the open work around it, call `working_set`. `lookup` then `working_set` is the name → act path.
- Updates (`upsert` with an existing id, `link`) are if-match: pass `base_updated_at` / endpoint timestamps from `get`. Compared at millisecond precision (same instant `get` returns). Mismatch → `{ error, suggestion }` (get and retry), never “node not found.” Not a write-ACL. `link` accepts one edge or a capped `edges[]` (1–20). The whole batch validates, then one transaction writes all edges or none. One activity receipt per written edge. Each edge carries both endpoint timestamps; a later edge does not inherit CAS from an earlier edge that named the same node. Shared endpoints still use one agreed timestamp; missing or disagreeing timestamps refuse the batch. Linking does not change `node.updated_at`.
- `manage_type` can retire an unused authored type (`action: "retire"`, `confirm: true`). System seed types cannot be retired. Live nodes of that type refuse; leftover soft-deleted nodes follow type-create undo (`purge_deleted: true` or restore those deletes first). A type owns `fields` (the field template), view declarations (`id` plus optional `filter` / `sort` / `group`), `default_view`, `hue`, and `glyph`. `json_schema` is compiled from `fields` (`additionalProperties: true`; `needed` is not JSON Schema `required`). Seed types already declare views (`task` defaults to `board`) and first-paint hue/glyph. The Viewer reads that contract; it does not infer views or hardcode a type catalog. System seed types may edit description, `fields`, hue, glyph, and the query on views they already declare. Their slug, kind, parent_types, label, and ordered view **ids** stay locked. Authored types keep the wider patch, including the view id list. Seed apply fills **missing** seed fields and missing seed hue/glyph only; it does not overwrite an operator edit.
- `upsert` **merges** `data` on update (partial patch does not wipe other keys). Create accepts `idempotency_key` so a retry does not twin a node. Create (no `id`) runs the same `lookup` matcher on the new title, type-scoped. Exact title or unique exact alias returns those write-ready candidates and does not write unless `allow_duplicate: true`. Token, fuzzy, and space-compacted matches warn (`duplicate_warnings`) and do not block. Same-name entities stay allowed with that override. Update/CAS behavior is unchanged. When a type has `json_schema`, upsert validates merged `data` and returns `{ error, suggestion }` on a miss.
- `upsert` (create, and update when the title changes) returns `suggested_links` from Postgres FTS on the new title — not embeddings. Each item is `{ kind, target: { id, type, title }, reason }` where `kind` is a seed relation (`child_of`, `about`, or `relates_to`) and `target` is a live node that already exists. Spine types with `parent_types` get `child_of` an allowed parent whose title matches; a title that looks like a person already in the graph gets `about`; otherwise `relates_to` a close title match. Skip self and already-linked pairs. A node with a live `child_of` is not offered a second parent (`about` / `relates_to` may still appear). Cap 5. Empty graph or no match → `[]`. **Never creates an edge** and never adds a type or relation. `link` is how an accepted suggestion becomes an edge. `get` may return the same list for a node that still has no edges.
- Activity stores optional `actor` / `actor_label` (who wrote). Not a permission gate.
- `search` is Postgres FTS (title + `data` + extracted inline payload text; Latin accents folded). `query` is optional when `type`, `status`, `under` (child_of parent), `since`, `origin`, `due` (`overdue` | `today` in America/New_York), `due_on_or_before`, `due_on_or_after`, or `data_equals` is set, so agents can list without a word. `data_equals` is JSONB equality on one or a few top-level `data` keys (not a column per key). Hits include `due` when `data.due` is set. Not embeddings. No `list_nodes`.
- `lookup` resolves one or more names in one request and returns a result per input (`exact`, `alias`, `candidate`, `ambiguous`, `no_match`). Unique UUID, unique folded title (`name_norm`: case, accent, punctuation, whitespace), or unique operator-authored `data.aliases` entry may bind a UUID. Token and fuzzy matches are always `candidate`. Duplicate exact titles and alias/title collisions are `ambiguous`. Each useful candidate includes `id`, `type`, canonical `title`, `updated_at`, `match`, `confidence`, and sits on the surrounding `candidates` list so a later confirm/link/upsert can if-match. `confidence` ranks; it is not a calibrated probability and does not authorize a write. For `candidate` or `ambiguous`, ask the operator to confirm a UUID before any mutation that depends on the identity; `get` is safe for inspection. `lookup` never writes, merges, creates, or picks an ambiguous candidate. Compact/no-space equality is candidate-only. Matching is type-scoped when `type` is supplied. Not embeddings. No hidden nickname list. After a bound UUID, `working_set` is the one agenda read around that node.
- `working_set` is a read-only rooted agenda. Given one live node id, it returns lean open work around that root (dues first), plus the parent chain when the type has `parent_types`. Walks follow the live ontology: hierarchy down (`child_of` and equivalent `kind: hierarchy` / `semantic_parent_slug` children) for types that can be parents (`goal`, `project`, `area`, and authored types in someone’s `parent_types`); `about` and `relates_to` for a person-like about-target (no invented `child_of`); hierarchy plus `relates_to` / `supports` for event-like types with `start`/`end` roles (`trip`). Defaults: open-only (`active`; pass `include_completed` for done), depth 1 (max 2), hard cap 40, America/New_York overdue, spine-root (`area`) bound by a 14-day due window. Honest empty is `{ items: [] }`. Several live edges to the same neighbor yield one row (`about` or `supports` over `relates_to`). Unknown or deleted id is `{ error, suggestion }` like `get`. No writes, no payload bodies, no `suggested_links`. `search` stays the vault-wide list. `get` stays one node.
- `data.aliases` is an optional string array on any node. `upsert` validates it only when the incoming `data` patch includes `aliases` (`[]` clears; malformed patch refuses, including values that fold empty after `name_norm`). A successful aliases write leaves a well-formed non-empty array, or `[]`. Unrelated updates leave legacy values alone. `lookup` ignores malformed legacy aliases. Alias dedupe uses the same `name_norm` as SQL lookup.
- `task`, `goal`, and `spend` accept optional `data.due` (`YYYY-MM-DD`) via the `due` date field (role `date`). On `spend`, display is Date — the calendar day of the line, not a task deadline. Compiled `json_schema` enforces the date when present; nodes without due still upsert. Extra `data` keys still write. `due: null` clears. A `ref` field stores a typed UUID pointer and does not create an edge.
- Live nodes are unique on `data.origin.{system,id}` for `gmail` | `calendar` | `drive` | `github`. Look up with `search` `{ origin }` (then `get`). Store the ref only — do not fetch or mirror those systems’ bodies.
- No `get_vault_health` / `run_maintenance` / `audit_links` tools — those jobs are instance routines the operator can run ([`VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/))

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

`project` has optional `budget_amount` (`number`) and `budget_currency` (`string`, same `USD` convention). The envelope lives on the project node. Seed apply fills those fields only when missing; it does not overwrite an operator edit. Remaining is budget minus paid lines — an agent reads those fields. Not a stored key and not a rollup tool.

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
- Read-only window at `/view` (same API key; not a second store). Compose publishes MCP / health / agent blobs on `127.0.0.1:8787` and `/view` on `8788` (`http://127.0.0.1:8788/view`; from another machine, `http://<this-host>:8788/view`). Unlock with the key, HttpOnly cookie `Path=/view`. After unlock: Home is the graph filling the leftover viewport (floor 460px), with Recents, open tasks, and type folders below. Collection and Detail are pages in the content host. Search is a rail overlay. The rail is Home and Search. A click on a record or graph node opens that object's detail page — not a docked inspector. Types carry hue and glyph; Viewer reads them. Dark is first paint; Light and System are real choices. A stored `paper` choice reads as Light. The cookie does not unlock `/mcp` or `/blobs/:id`. Contract: [`VIEWER.md`](./VIEWER.md).
- Blobs: `$FOUNDATION_DATA/blobs/<uuid>`; ingest on `upsert`; bytes via `GET /blobs/:id`

## Locked (do not reopen)

- **14 tools** — names above. This amendment adds `working_set` (rooted agenda read). A further tool still needs a SPEC amendment
- **FTS now** — embeddings/hybrid search is later optional work, not current search

## Non-goals (v1)

- Mobile app, Watch, Apple auth, billing, iCloud vault sync
- Multi-tenant SaaS, complex OAuth for third parties
- Dual write to a markdown vault + database (one store)
- Proposal/approve inbox for ontology changes
- Write-ACL / default-deny (the API key is the gate)
- Bank / card import, a second ledger, double-entry accounting, a rollup tool, or stored remaining on `project`

## Contributor checklist

Typecheck and tests pass. Destructive MCP tools stay behind `confirm: true`. Do not put vault contents, `FOUNDATION_DATA` files, or graph dumps in pull requests. When a change alters the graph or vault shape, update [`ARCHITECTURE.md`](./ARCHITECTURE.md) in the same PR.
