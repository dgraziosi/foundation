# Vault-keeping

The periodic health checkup for a running Foundation instance and its graph. Not the database. Not an MCP tool.

## Glossary

- **Foundation** — the product (repo, Docker, MCP). What you clone. Do not rename the GitHub repo or the MCP server `foundation`.
- **Graph** — the data (people, companies, projects, decisions, places, blobs). Daily word. Encyclopedia Galactica is the Asimov analog, not the everyday name.
- **Vault-keeping** — this checkup (Seldon’s Time Vault analog). Not the database. Do not call the graph “the Vault” (collides with Momentum and with the Time Vault).
- **Blob** — a file on a graph node.
- **Seldon** — architect of Foundation the product.
- **Chief / writer** — human dumps ideas; this agent writes the graph.
- **Librarian** — later job title only. Start vault-keeping as a routine, not a third agent.

Stand-up: [`AGENTS.md`](./AGENTS.md). Paste: [`prompts/vault-keeper.md`](../prompts/vault-keeper.md).

## What it is

A **quiet agent routine** (weekdays, morning local). It uses HTTP and the existing MCP tools the same way a careful operator would. When everything is fine, it stays silent. It pings the operator **only on failure**.

It emulates the *job* Momentum split across `get_vault_health`, `run_maintenance`, and dangling-link cleanup — as reasoning on the box, not as new Foundation tools.

[`REDESIGN.md`](./REDESIGN.md) forbids those as v1 MCP tools. Do not add `get_vault_health`, `run_maintenance`, `propose_reorganize`, `audit_links`, or `cleanup_dangling_links`.

## What it is not

- **Not the database.** `$FOUNDATION_DATA` and Postgres hold the graph. Vault-keeping looks at them. It does not replace them, dual-write a markdown store, or invent a backup product.
- **Not a name for the graph.** Do not call the graph “the Vault.”
- **Not Momentum Vault.** Do not reuse that name for this repo, the MCP server (`foundation`), or packages.
- **Not a third agent.** Start as a routine on the writer (or Seldon, if that process can reach the box — usually it cannot). **Librarian** is a later job title, when this is a real weekly job. See [`AGENTS.md`](./AGENTS.md).
- **Not email.** No SMTP, no digest. Ping in Grok Bot / Cursor only when a check fails.
- **Not a write-ACL.** The API key is the gate. Do not invent default-deny.
- **Not a mutation pass.** The quiet weekday run does not `upsert`, `delete`, `unlink`, `undo`, or `manage_type` unless the operator asked for a repair in that conversation. Report; don’t rewrite the graph unattended.
- **Not a cloud-VM writer.** Cloud agents that cannot reach box MCP (`http://127.0.0.1:8787/mcp`) must not write graph data. Run this checkup from a process that can hit that URL.

## Quiet weekday checks

Run in order. Stop at the first hard failure and ping. Skip a check when its input is unset — a fresh clone with no well-known nodes and no backup path is allowed to be healthy.

Do **not** assume a live, populated graph. Do **not** `docker compose down -v`, delete `./data`, or otherwise wipe the instance.

### 1. `GET /health` — process + db

Unauthenticated. Expect HTTP 200 and:

```json
{ "ok": true, "service": "foundation", "db": "up" }
```

Default: `http://127.0.0.1:8787/health`.

Fail if the request errors, status is not 200, `ok` is not true, `service` is not `foundation`, or `db` is not `up`. That covers “Compose is up” and “Postgres answers `ping`.”

### 2. `FOUNDATION_DATA` is the real data dir

Read `.env` (or the operator’s configured path). Default is `./data`.

**Not agent-data.** Fail if the path is inside an agent profile or memory directory (Cursor project agent dirs, Grok Bot profile/memory, anything named like `agent-data`). Durable files belong under `FOUNDATION_DATA` only.

**Not an empty leftover cluster.** Fail if you are clearly looking at the wrong leftover, for example:

- Path missing while Compose claims to be healthy
- `$FOUNDATION_DATA/postgres` missing, empty, or with no `PG_VERSION` (not a Postgres cluster)
- A second leftover Compose project / volume the operator did not mean (wrong cwd, wrong project name, bind mount that isn’t the `.env` path)

A **first-day empty graph** (seed types/relations, zero user nodes) is **not** a failure. That is a new clone. Only treat “empty” as failure when the operator configured well-known nodes (check 3) or explicitly said this instance should already hold a graph.

### 3. Well-known nodes (if configured)

If the operator listed a couple of node UUIDs or stable titles in the routine prompt, `get` them (UUID) or `search` then `get` (title). Expect those nodes to exist and not be soft-deleted.

If the list is empty, **skip**. Do not invent nodes. Do not fail a fresh graph for lacking them.

### 4. Backup not missing/stale (if a backup path exists)

Foundation does not ship a backup tool. If the operator named a backup path (for example `$FOUNDATION_DATA/backups`, a `pg_dump` file, or a restic snapshot directory they already use), check:

- The path exists and is readable
- The newest artifact is newer than the operator’s stale threshold (default: 48 hours)

If no backup path is configured, **skip**. Do not nag. Do not dump the database from the quiet routine.

### Later (do not implement as MCP)

Mention only. Do **not** add tools for these in v1:

- Duplicate titles
- Nodes with zero edges
- Type soup (authored types that fight the spine)
- Dangling-link sweeps — `get` / `link` already ignore edges whose endpoints are deleted; a future pass can look at orphans. Not `audit_links` / `cleanup_dangling_links` on the wire.

When those become a **weekly job** (someone actually does the work), then the job title is Librarian. Until then, they stay out of the weekday ping.

## How to check (existing surface)

Intent only — tool JSON schemas change; call `bootstrap` and use what the server describes.

| Check | Use |
| --- | --- |
| Process + db | `GET /health` |
| Types still seeded | `bootstrap` or `inspect_ontology`. Seed-only is OK on day one. |
| Canary nodes | `get` / `search` |
| Recent writes (optional context, not a fail) | `list_activity` with a `since` window |
| Data dir | Host filesystem + `.env` `FOUNDATION_DATA` |
| Backup | Host filesystem, only if a path was configured |

Auth for `/mcp`: `Authorization: ApiKey <FOUNDATION_API_KEY>` (Bearer equivalent). `/health` needs no key.

## Failure ping

Say what failed, what you observed, and the smallest next look (restart Compose, fix `FOUNDATION_DATA`, restore from the operator’s backup). Do not email. Do not silently mutate. Do not open a PR about graph data.
