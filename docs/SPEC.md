# Foundation — product contract

Living spec. Cloud agents and humans update this as decisions land.

## Purpose

Foundation is a **personal ontology + MCP server** for AI agents. It is durable structured context (a typed graph) that agents read and write — not chat memory, not a notes app with an API bolted on.

Named after Asimov’s Foundation: carry structured knowledge forward so you and your agents are not starting from zero.

**Not for sale.** Open on GitHub so others can self-host for their own agents.

Do not commit personal life data, documents, or secrets to this repository. Those belong in the operator’s vault, not in git.

## Locked glossary

Obsidian analog: Obsidian = app, a vault = one folder, graph = links inside.

- **Foundation** — the product (repo, Docker, MCP). What you install.
- **Vault** — one running instance: one `FOUNDATION_DATA`, one Postgres. A clone gets their own vault, not yours. Postgres vault, not markdown. Do **not** call the graph “the Vault.”
- **Graph** — the knowledge in that vault (people, projects, edges, blobs). Daily word.
- **Blob** — a file on a graph node.
- **Seldon** — architect of Foundation the product.
- **Chief** — primary writer (human dumps ideas).
- **Librarian** — agent from day one. Owns vault health, graph hygiene, and applying git updates to the computer.

## Primary users

1. **Agents** (Grok Bot, Cursor, Claude, …) via MCP — default interface
2. **Humans** via conversation with those agents; optional thin viewer later (Mac/web)

## Starter spine

```text
area → project → goal → habit | task
```

**Area** is the spine root (life domain + what you value). Seed artifacts include person, journal, idea, lesson, note, trip. Hierarchy verb is `child_of`. Associative seeds: relates_to, supports, inspired_by, references, about.

Agents can add types and relations over time. No approval inbox.

## Agent API (12 tools)

Names are locked. Full parameters: [`docs/MCP_TOOLS.md`](./MCP_TOOLS.md).

`bootstrap`, `search`, `get`, `upsert`, `delete`, `link`, `unlink`, `inspect_ontology`, `manage_type`, `manage_relation`, `list_activity`, `undo`.

- Destructive tools (`delete`, `unlink`, `undo`) require `confirm: true`
- Identity is UUID. If you already have a UUID, call `get` — do not `search`
- Updates (`upsert` with an existing id, `link`) are if-match: pass `base_updated_at` / endpoint timestamps from `get`. Mismatch → `{ error, suggestion }` (get and retry). Not a write-ACL.
- `upsert` **merges** `data` on update (partial patch does not wipe other keys). Create accepts `idempotency_key` so a retry does not twin a node.
- Activity stores optional `actor` / `actor_label` (who wrote). Not a permission gate.
- `search` is Postgres FTS (title + `data` + extracted inline payload text). Not embeddings
- No `get_vault_health` / `run_maintenance` / `audit_links` tools — those jobs are Librarian operator routines ([`VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md))

## Runtime

- Docker Compose: Postgres 16 + Foundation server
- Durable files under `FOUNDATION_DATA` (never an agent profile/memory directory)
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

## Merge bar

Typecheck and tests pass. Destructive MCP tools stay behind `confirm: true`. Cloud agents must not put vault contents, `FOUNDATION_DATA` files, or graph dumps in pull requests.
