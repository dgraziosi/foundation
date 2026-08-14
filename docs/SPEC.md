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
- **operator** — the human who runs Compose. Only the human, not an agent.

Do not call the graph “the Vault.”

Optional named-agent recipe (not product ontology): [`AGENTS.md`](./AGENTS.md).

## Primary users

1. **Agents** via MCP — default interface (Cursor, Claude, and other MCP clients)
2. **Operators** via conversation with those agents; optional thin viewer later (Mac/web)

## Starter spine

```text
area → project → goal → habit | task
```

**Area** is the spine root (life domain + what you value). Seed artifacts include person, company, journal, idea, lesson, note, trip, decision. Hierarchy verb is `child_of`. Associative seeds: relates_to, supports, inspired_by, references, about.

Agents can add types and relations over time. No approval inbox.

## Agent API (12 tools)

Names are locked. Full parameters: [`docs/MCP_TOOLS.md`](./MCP_TOOLS.md).

`bootstrap`, `search`, `get`, `upsert`, `delete`, `link`, `unlink`, `inspect_ontology`, `manage_type`, `manage_relation`, `list_activity`, `undo`.

- Destructive tools (`delete`, `unlink`, `undo`, `manage_type` retire) require `confirm: true`
- Identity is UUID. If you already have a UUID, call `get` — do not `search`
- Updates (`upsert` with an existing id, `link`) are if-match: pass `base_updated_at` / endpoint timestamps from `get`. Compared at millisecond precision (same instant `get` returns). Mismatch → `{ error, suggestion }` (get and retry), never “node not found.” Not a write-ACL.
- `manage_type` can retire an unused authored type (`action: "retire"`, `confirm: true`). System seed types cannot be retired. Live nodes of that type refuse; leftover soft-deleted nodes follow type-create undo (`purge_deleted: true` or restore those deletes first).
- `upsert` **merges** `data` on update (partial patch does not wipe other keys). Create accepts `idempotency_key` so a retry does not twin a node. When a type has `json_schema`, upsert validates merged `data` and returns `{ error, suggestion }` on a miss.
- Activity stores optional `actor` / `actor_label` (who wrote). Not a permission gate.
- `search` is Postgres FTS (title + `data` + extracted inline payload text; Latin accents folded). `query` is optional when `type`, `status`, `under` (child_of parent), `since`, `origin`, `due` (`overdue` | `today` in America/New_York), `due_on_or_before`, or `due_on_or_after` is set, so agents can list without a word. Hits include `due` when `data.due` is set. Not embeddings. No `list_nodes`.
- `task` and `goal` accept optional `data.due` (`YYYY-MM-DD`). Seed `json_schema` enforces the date when present; nodes without due still upsert. `due: null` clears.
- Live nodes are unique on `data.origin.{system,id}` for `gmail` | `calendar` | `drive` | `github`. Look up with `search` `{ origin }` (then `get`). Store the ref only — do not fetch or mirror those systems’ bodies.
- No `get_vault_health` / `run_maintenance` / `audit_links` tools — those jobs are instance routines the operator can run ([`VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`prompts/update-foundation.md`](../prompts/update-foundation.md))

## Runtime

- Docker Compose: Postgres 16 + Foundation server
- Durable files under `FOUNDATION_DATA`
- Localhost MCP at `http://127.0.0.1:8787/mcp` with `Authorization: ApiKey <FOUNDATION_API_KEY>`
- Blobs: `$FOUNDATION_DATA/blobs/<uuid>`; ingest on `upsert`; bytes via `GET /blobs/:id`

## Locked (do not reopen)

- **12 tools** — names above. New tools need a SPEC amendment
- **FTS now** — embeddings/hybrid search is later optional work, not current search
- **Viewer deferred** — optional thin Mac/web viewer against the same API, not v1

## Non-goals (v1)

- Mobile app, Watch, Apple auth, billing, iCloud vault sync
- Multi-tenant SaaS, complex OAuth for third parties
- Dual write to a markdown vault + database (one store)
- Proposal/approve inbox for ontology changes
- Write-ACL / default-deny (the API key is the gate)

## Contributor checklist

Typecheck and tests pass. Destructive MCP tools stay behind `confirm: true`. Do not put vault contents, `FOUNDATION_DATA` files, or graph dumps in pull requests. When a change alters the graph or vault shape, update [`ARCHITECTURE.md`](./ARCHITECTURE.md) in the same PR.
