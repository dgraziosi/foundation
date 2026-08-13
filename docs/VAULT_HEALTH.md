# Vault health

Weekday morning checkup for a running Foundation **vault** (the instance). Quiet if green. Not the graph. Not an MCP tool.

## Glossary

Obsidian analog: Obsidian = app, a vault = one folder, graph = links inside.

- **Foundation** — the product (repo, Docker, MCP). What you install. Do not rename the GitHub repo or the MCP server `foundation`.
- **Vault** — one running instance: one `FOUNDATION_DATA`, one Postgres. A clone gets their own vault, not yours. Postgres vault, not markdown. Do **not** call the graph “the Vault.”
- **Graph** — the knowledge in that vault (people, projects, edges, blobs). Daily word.
- **Blob** — a file on a graph node.
- **Seldon** — architect of Foundation the product.
- **Chief** — primary writer (human dumps ideas).
- **Librarian** — agent from day one. Owns vault health, [graph hygiene](./GRAPH_HYGIENE.md), and applying git updates to the computer.

Stand-up: [`AGENTS.md`](./AGENTS.md). Agent: [`prompts/librarian.md`](../prompts/librarian.md). Paste: [`prompts/vault-health.md`](../prompts/vault-health.md).

## What it is

A **quiet Librarian routine** (weekdays, morning local). Instance ops: process + db, the data dir is the real vault, optional canaries, optional backup freshness. It uses HTTP, the host filesystem, and existing MCP tools the same way a careful operator would. When everything is fine, it stays silent. It pings the operator **only on failure**.

Do not add `get_vault_health`, `run_maintenance`, `propose_reorganize`, `audit_links`, or `cleanup_dangling_links`. Those jobs are this routine and [graph hygiene](./GRAPH_HYGIENE.md), not MCP tools.

Graph-side report (duplicate titles, zero-edge nodes, type soup) is **not** this routine. That is weekly [graph hygiene](./GRAPH_HYGIENE.md). Git pull + compose rebuild is **not** this routine. That is [`prompts/update-foundation.md`](../prompts/update-foundation.md).

## What it is not

- **Not the graph.** `$FOUNDATION_DATA` and Postgres *are* the vault. The graph lives in them. Do not call the graph “the Vault.” Do not dual-write a markdown store or invent a backup product.
- **Librarian is day one.** Created at init. See [`AGENTS.md`](./AGENTS.md).
- **Not email.** No SMTP, no digest. Ping in Grok Bot / Cursor only when a check fails.
- **Not a write-ACL.** The API key is the gate. Do not invent default-deny.
- **Not a mutation pass.** The quiet weekday run does not `upsert`, `delete`, `unlink`, `undo`, or `manage_type` unless the operator asked for a repair in that conversation. Report; don’t rewrite the graph unattended.
- **Not a cloud-VM writer.** Cloud agents that cannot reach box MCP (`http://127.0.0.1:8787/mcp`) must not write graph data. Run this checkup from a process that can hit that URL (Librarian on the computer that hosts Compose).

## Quiet weekday checks

Run in order. Stop at the first hard failure and ping. Skip a check when its input is unset — a fresh clone with no well-known nodes and no backup path is allowed to be healthy.

Do **not** assume a live, populated graph. Do **not** `docker compose down -v`, delete `./data`, or otherwise wipe the vault.

### 1. `GET /health` — process + db

Unauthenticated. Expect HTTP 200 and:

```json
{ "ok": true, "service": "foundation", "db": "up" }
```

Default: `http://127.0.0.1:8787/health`.

Fail if the request errors, status is not 200, `ok` is not true, `service` is not `foundation`, or `db` is not `up`. That covers “Compose is up” and “Postgres answers `ping`.”

### 2. `FOUNDATION_DATA` is the real vault

Read `.env` (or the operator’s configured path). Default is `./data`. This directory **is** the vault: Postgres cluster + blobs. Not agent-data. Not an empty leftover cluster.

**Not agent-data.** Fail if the path is inside an agent profile or memory directory (Cursor project agent dirs, Grok Bot profile/memory, anything named like `agent-data`). Durable files belong under `FOUNDATION_DATA` only.

**Not an empty leftover cluster.** Fail if you are clearly looking at the wrong leftover, for example:

- Path missing while Compose claims to be healthy
- `$FOUNDATION_DATA/postgres` missing, empty, or with no `PG_VERSION` (not a Postgres cluster)
- A second leftover Compose project / volume the operator did not mean (wrong cwd, wrong project name, bind mount that isn’t the `.env` path)

A **first-day empty graph** (seed types/relations, zero user nodes) is **not** a failure. That is a new clone’s vault. Only treat “empty” as failure when the operator configured well-known nodes (check 3) or explicitly said this vault should already hold a graph.

### 3. Well-known nodes (if configured)

If the operator listed a couple of node UUIDs or stable titles in the routine prompt, `get` them (UUID) or `search` then `get` (title). Expect those nodes to exist and not be soft-deleted.

If the list is empty, **skip**. Do not invent nodes. Do not fail a fresh graph for lacking them.

### 4. Backup not missing/stale (if a backup path exists)

Foundation does not ship a backup tool. If the operator named a backup path (for example `$FOUNDATION_DATA/backups`, a `pg_dump` file, or a restic snapshot directory they already use), check:

- The path exists and is readable
- The newest artifact is newer than the operator’s stale threshold (default: 48 hours)

If no backup path is configured, **skip**. Do not nag. Do not dump the database from the quiet routine.

## How to check (existing surface)

Intent only — tool JSON schemas change; call `bootstrap` and use what the server describes.

| Check | Use |
| --- | --- |
| Process + db | `GET /health` |
| Types still seeded | `bootstrap` or `inspect_ontology`. Seed-only is OK on day one. |
| Canary nodes | `get` / `search` |
| Recent writes (optional context, not a fail) | `list_activity` with a `since` window |
| Data dir (the vault) | Host filesystem + `.env` `FOUNDATION_DATA` |
| Backup | Host filesystem, only if a path was configured |

Auth for `/mcp`: `Authorization: ApiKey <FOUNDATION_API_KEY>` (Bearer equivalent). `/health` needs no key.

## Failure ping

Say what failed, what you observed, and the smallest next look (restart Compose, fix `FOUNDATION_DATA`, restore from the operator’s backup). Do not email. Do not silently mutate. Do not open a PR about graph data. Do not wipe the vault.
