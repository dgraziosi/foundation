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
- **graph** — the knowledge in that vault
- **blob** — a file on a node
- **agent** — anything that can reach the vault MCP
- **operator** — the human who runs Compose

Do not call the graph “the Vault.”

Starter recipes: [`AGENTS.md`](./AGENTS.md).

## Primary users

1. **Agents** via MCP — default interface (Cursor, Claude, and other MCP clients)
2. **Operators** via this read-only window on the same API. The window is not a second store.

## Starter spine

```text
area → project → goal → habit | task
```

Recommended structure: Area → project → goal → task. A habit hangs under a goal. A task may child_of a goal or a project.

**Area** is the spine root (life domain + what you value). The spine is preferred placement, not a hard gate: `task` may `child_of` `project` (skip a dummy goal). Prefer goal when there is a real outcome. `task` still cannot `child_of` `area`. Seed artifacts include person, place, company, journal, idea, lesson, note, trip, decision. Hierarchy verb is `child_of`. Associative seeds: relates_to, supports, inspired_by, references, about.

Agents can add types and relations over time. No approval inbox.

## Agent API (13 tools)

Names are locked. Full parameters: [`docs/MCP_TOOLS.md`](./MCP_TOOLS.md).

`bootstrap`, `search`, `lookup`, `get`, `upsert`, `delete`, `link`, `unlink`, `inspect_ontology`, `manage_type`, `manage_relation`, `list_activity`, `undo`.

- Destructive tools (`delete`, `unlink`, `undo`, `manage_type` retire) require `confirm: true`
- Identity is UUID. If you already have a UUID, call `get` — do not `search`
- Updates (`upsert` with an existing id, `link`) are if-match: pass `base_updated_at` / endpoint timestamps from `get`. Compared at millisecond precision (same instant `get` returns). Mismatch → `{ error, suggestion }` (get and retry), never “node not found.” Not a write-ACL.
- `manage_type` can retire an unused authored type (`action: "retire"`, `confirm: true`). System seed types cannot be retired. Live nodes of that type refuse; leftover soft-deleted nodes follow type-create undo (`purge_deleted: true` or restore those deletes first).
- `upsert` **merges** `data` on update (partial patch does not wipe other keys). Create accepts `idempotency_key` so a retry does not twin a node. Create (no `id`) runs the same `lookup` matcher on the new title, type-scoped. Exact title or unique exact alias returns those write-ready candidates and does not write unless `allow_duplicate: true`. Token, fuzzy, and space-compacted matches warn (`duplicate_warnings`) and do not block. Same-name entities stay allowed with that override. Update/CAS behavior is unchanged. When a type has `json_schema`, upsert validates merged `data` and returns `{ error, suggestion }` on a miss.
- `upsert` (create, and update when the title changes) returns `suggested_links` from Postgres FTS on the new title — not embeddings. Each item is `{ kind, target: { id, type, title }, reason }` where `kind` is a seed relation (`child_of`, `about`, or `relates_to`) and `target` is a live node that already exists. Spine types with `parent_types` get `child_of` an allowed parent whose title matches; a title that looks like a person already in the graph gets `about`; otherwise `relates_to` a close title match. Skip self and already-linked pairs. A node with a live `child_of` is not offered a second parent (`about` / `relates_to` may still appear). Cap 5. Empty graph or no match → `[]`. **Never creates an edge** and never adds a type or relation. `link` is how an accepted suggestion becomes an edge. `get` may return the same list for a node that still has no edges.
- Activity stores optional `actor` / `actor_label` (who wrote). Not a permission gate.
- `search` is Postgres FTS (title + `data` + extracted inline payload text; Latin accents folded). `query` is optional when `type`, `status`, `under` (child_of parent), `since`, `origin`, `due` (`overdue` | `today` in America/New_York), `due_on_or_before`, `due_on_or_after`, or `data_equals` is set, so agents can list without a word. `data_equals` is JSONB equality on one or a few top-level `data` keys (not a column per key). Hits include `due` when `data.due` is set. Not embeddings. No `list_nodes`.
- `lookup` resolves one or more names in one request and returns a result per input (`exact`, `alias`, `candidate`, `ambiguous`, `no_match`). Unique UUID, unique folded title (`name_norm`: case, accent, punctuation, whitespace), or unique operator-authored `data.aliases` entry may bind a UUID. Token and fuzzy matches are always `candidate`. Duplicate exact titles and alias/title collisions are `ambiguous`. Each useful candidate includes `id`, `type`, canonical `title`, `updated_at`, `match`, `confidence`, and sits on the surrounding `candidates` list so a later confirm/link/upsert can if-match. `confidence` ranks; it is not a calibrated probability and does not authorize a write. For `candidate` or `ambiguous`, ask the operator to confirm a UUID before any mutation that depends on the identity; `get` is safe for inspection. `lookup` never writes, merges, creates, or picks an ambiguous candidate. Compact/no-space equality is candidate-only. Matching is type-scoped when `type` is supplied. Not embeddings. No hidden nickname list.
- `data.aliases` is an optional string array on any node. `upsert` validates it only when the incoming `data` patch includes `aliases` (`[]` clears; malformed patch refuses, including values that fold empty after `name_norm`). A successful aliases write leaves a well-formed non-empty array, or `[]`. Unrelated updates leave legacy values alone. `lookup` ignores malformed legacy aliases. Alias dedupe uses the same `name_norm` as SQL lookup.
- `task` and `goal` accept optional `data.due` (`YYYY-MM-DD`). Seed `json_schema` enforces the date when present; nodes without due still upsert. `due: null` clears.
- Live nodes are unique on `data.origin.{system,id}` for `gmail` | `calendar` | `drive` | `github`. Look up with `search` `{ origin }` (then `get`). Store the ref only — do not fetch or mirror those systems’ bodies.
- No `get_vault_health` / `run_maintenance` / `audit_links` tools — those jobs are instance routines the operator can run ([`VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`prompts/update-foundation.md`](../prompts/update-foundation.md))

## Runtime

- Docker Compose: Postgres 16 + Foundation server
- Durable files under `FOUNDATION_DATA`
- Localhost MCP at `http://127.0.0.1:8787/mcp` with `Authorization: ApiKey <FOUNDATION_API_KEY>`
- Read-only window at `http://127.0.0.1:8787/view` (same API key; not a second store)
- Blobs: `$FOUNDATION_DATA/blobs/<uuid>`; ingest on `upsert`; bytes via `GET /blobs/:id`

## Locked (do not reopen)

- **13 tools** — names above. New tools need a SPEC amendment
- **FTS now** — embeddings/hybrid search is later optional work, not current search

## Non-goals (v1)

- Mobile app, Watch, Apple auth, billing, iCloud vault sync
- Multi-tenant SaaS, complex OAuth for third parties
- Dual write to a markdown vault + database (one store)
- Proposal/approve inbox for ontology changes
- Write-ACL / default-deny (the API key is the gate)

## Contributor checklist

Typecheck and tests pass. Destructive MCP tools stay behind `confirm: true`. Do not put vault contents, `FOUNDATION_DATA` files, or graph dumps in pull requests. When a change alters the graph or vault shape, update [`ARCHITECTURE.md`](./ARCHITECTURE.md) in the same PR.
