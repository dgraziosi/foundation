# Vault health

Two quiet jobs for a running Foundation **vault** (the instance). Quiet if green. Not the graph. Not an MCP tool. Not a bot wake to keep the process up.

1. **Keep the vault up** — a small script on this machine’s own schedule. Starts Postgres and the app when they are down. Curls `/health`. First-day 0 user records is healthy. Nags when the data folder is missing, `PG_VERSION` is gone, start fails, health still fails, or the live folder looks like an empty cluster next to a real one. `/health` green is not enough.
2. **Weekday 9:15 written report** — Vault Keeper. Process + db, the data dir is the real vault, optional canaries, backup freshness. Does not start Postgres or the app.

## Glossary

Short analog: app / folder / links → Foundation / vault / graph.

- **Foundation** — the product
- **vault** — one instance (`FOUNDATION_DATA` + Postgres)
- **graph** — the knowledge in that vault
- **blob** — a file on a node
- **agent** — anything that can reach the vault MCP
- **user** — the human who runs this vault on this machine

Do not call the graph “the Vault.”

The user can run the written report, or attach it to Vault Keeper ([`AGENTS.md`](./AGENTS.md)). Skill: [`.agents/skills/vault-health/`](../.agents/skills/vault-health/). The host script keeps the vault up. The skill is the written report.

## Host programs

The vault is one data folder, Postgres 16, and the Foundation process. Both programs run as the same user. Backup and the app both see that folder. Official app start is `pnpm start` (wait for the database, migrate, seed).

The host script starts those two programs, curls `/health`, and fails on the empty-cluster case below. Quiet when green and the live folder is the intended real cluster.

Do not add `get_vault_health`, `run_maintenance`, `propose_reorganize`, `audit_links`, or `cleanup_dangling_links`. Those jobs are this note and [graph hygiene](./GRAPH_HYGIENE.md), not MCP tools.

Graph-side report (duplicate titles, zero-edge nodes, type soup) is **not** this note. That is weekly [graph hygiene](./GRAPH_HYGIENE.md). Git pull and the post-pull git-tree leak scan are **not** this note. Those are [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/) and [`.agents/skills/repo-leak-scan/`](../.agents/skills/repo-leak-scan/). Dream rewrites the record from today's activity; that pass has its own clock.

## Keep the vault up

A **machine job**. Not a bot. Not a weekday-only check. No bot wake.

Put the script on this machine’s schedule (cron on Linux or Mac, or the equivalent). Do not put a live schedule or a home path into git.

Run in order:

1. If the data folder is missing, **refuse.** Do not mkdir an empty live cluster over a miss.

2. If `$FOUNDATION_DATA/postgres` exists and `PG_VERSION` is missing, **refuse.** That is a miss. Do not mkdir an empty live cluster over a miss. Do not start.

3. Empty first-day folder may init. Existing folder without `PG_VERSION`: refuse.

4. `GET /health` — unauthenticated. Default `http://127.0.0.1:8787/health`. Expect HTTP 200 and:

   ```json
   { "ok": true, "service": "foundation", "db": "up" }
   ```

   Fail if the request errors, status is not 200, `ok` is not true, `service` is not `foundation`, or `db` is not `up`.

5. If health is down: start Postgres (the data folder’s postgres tree), then the app (`pnpm start`) **once**. Do not loop. Do not delete the data folder. Do not write the graph. Wait until `GET /health` is green, or about one minute. If start fails: **nag** that start failed. If health still fails: **nag.**

6. `/health` green is not enough. Version file alone is not enough. A first-day vault with 0 user records is healthy. **Nag** if this looks like an empty cluster next to a real one: `PG_VERSION` exists, live user records are 0, and a second postgres tree or a backup has people.

   Do not mkdir an empty live cluster over a miss.

7. Quiet only when health is green **and** the live folder is the intended real cluster (`PG_VERSION` present; not empty-live-next-to-real).

Nag on stderr. Say what failed and the smallest next look (start Postgres, then from the clone: `pnpm start`; or point the script at the data dir that still holds the graph). Leave the graph and `FOUNDATION_DATA` as they are. The product does not send mail. If the machine’s scheduler mails stderr, that is the nag. The weekday 9:15 report also pings in chat if `/health` is still down that morning.

The product ships [`scripts/keep-vault-up.sh`](../scripts/keep-vault-up.sh). Point the machine’s schedule at that file. Use a clone path on that machine; do not commit that path.

```
*/15 * * * * /path/to/the/clone/scripts/keep-vault-up.sh
```

Stop: `scripts/keep-vault-up.sh stop` — stop the app, then Postgres. Does not delete the data folder.

## Weekday 9:15 written report

A **quiet report** (weekdays, **9:15** user-local). Attach it to Vault Keeper, or run it. It uses HTTP, the host filesystem, and existing MCP tools the same way a careful user would. When everything is fine, it stays silent. It pings the user **only on failure**. It does **not** start Postgres or the app. The host script should have already tried.

Do not `upsert`, `delete`, `unlink`, `undo`, or `manage_type` unless the user asked for a repair in that conversation. Report; don’t rewrite the graph unattended.

Not email. No digest. Pings stay in the user’s chat.

Not a write-ACL. The API key is the gate.

Run this report from a process that can hit `http://127.0.0.1:8787` on the machine that runs this vault.

Run in order. Stop at the first hard failure and ping. Skip a check when its input is unset — a fresh clone with no well-known nodes is allowed to be healthy. Backup freshness uses `BACKUP_ROOT`; skip that check only if the user unset it.

A first-day vault with 0 user records is healthy. Keep `FOUNDATION_DATA` in place.

### 1. `GET /health` — process + db

Same contract as the host script. Default: `http://127.0.0.1:8787/health`. If this fails, ping. Do not start the host programs from this report.

### 2. `FOUNDATION_DATA` is the real vault

Read `.env` (or the user’s configured path). Default is `./data`. This directory **is** the vault: Postgres cluster + blobs. Not agent-data. Not an empty leftover cluster.

**Not agent-data.** Fail if the path is inside an agent profile or memory directory. Durable files belong under `FOUNDATION_DATA` only.

**Not an empty leftover cluster.** Fail if you are clearly looking at the wrong leftover, for example:

- Path missing while `/health` claims to be healthy
- `$FOUNDATION_DATA/postgres` missing, empty, or with no `PG_VERSION` (not a Postgres cluster)
- The host cannot read `$FOUNDATION_DATA/postgres/PG_VERSION`
- A second postgres tree or a backup that has people while live has 0 user records

Do not create `$FOUNDATION_DATA/postgres` or `PG_VERSION` on that miss.

**Host can read the live dir.** After a real cluster exists, the human who runs this vault on this machine can read `$FOUNDATION_DATA/postgres/PG_VERSION` and `$FOUNDATION_DATA/blobs`. That is enough for a host copy or backup. Unix mode stays 0700 or 0750, never world-writable. Host-side health fails while the host cannot read `PG_VERSION`. Empty first-day folder may init.

If `$FOUNDATION_DATA/postgres` exists and `PG_VERSION` is missing, refuse. That is not an empty first-day folder. Do not mkdir an empty live cluster over the miss.

A **first-day vault** (seed types/relations, 0 user records) is **not** a failure. That is a new clone’s vault. Only treat “empty” as failure when the user configured well-known nodes (check 3), or when a backup or a second postgres tree has people while live has 0.

### 3. Well-known nodes (if configured)

If the user listed a couple of node UUIDs or stable titles in the routine prompt, `get` them (UUID) or `search` then `get` (title). Expect those nodes to exist and not be soft-deleted.

If the list is empty, **skip**. Do not invent nodes. Do not fail a fresh graph for lacking them.

### 4. Backup not missing/stale

The product ships `scripts/backup-vault.sh` as a host cron/script. Default backup path is `BACKUP_ROOT` (sibling of the data dir). Health checks that the path exists and the newest artifact is newer than 48 hours. Health does not dump. The bot nags if the dump is missing or old.

If the user unset `BACKUP_ROOT`, **skip**. Do not nag.

How to take a dump and how to restore into a throwaway instance: [`BACKUP.md`](./BACKUP.md).

## How to check (existing surface)

Intent only — tool JSON schemas change; call `bootstrap` and use what the server describes.

| Check | Use |
| --- | --- |
| Process + db | `GET /health` |
| Start the two host programs | Host script: Postgres from the data folder, then `pnpm start` |
| Types still seeded | `bootstrap` or `inspect_ontology`. Seed-only is OK on day one. |
| Canary nodes | `get` / `search` |
| Recent writes (optional context, not a fail) | `list_activity` with a `since` window |
| Data dir (the vault) | Host filesystem + `.env` `FOUNDATION_DATA`. Host-read check: `scripts/vault-data-dir.sh` (`foundation_vault_data_dir_health_pg_version`). Do not mkdir on a miss. |
| Backup | Host filesystem at `BACKUP_ROOT` (skip only if the user unset it) |

Auth for `/mcp`: `Authorization: ApiKey <FOUNDATION_API_KEY>` (Bearer equivalent). `/health` needs no key.

## Failure ping

**Host script:** stderr. What failed, and the smallest next look (start Postgres, then `pnpm start` from the clone).

**Weekday report:** chat. What failed, what you observed, and the smallest next look (start the host programs, fix `FOUNDATION_DATA`, restore from the user’s backup). Leave the graph and `FOUNDATION_DATA` as they are unless the user asked for a repair in this conversation.
