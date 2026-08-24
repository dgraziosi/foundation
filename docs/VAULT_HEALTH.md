# Vault health

Two quiet jobs for a running Foundation **vault** (the instance). Quiet if green. Not the graph. Not an MCP tool. Not a bot wake to keep the process up.

1. **Keep the vault up** — a small script on this machine’s own schedule, every 15 minutes. Curls `/health`. If down, starts Compose once. Nags only when Docker is missing or health still fails.
2. **Weekday 9:15 written report** — Vault Keeper. Process + db, the data dir is the real vault, optional canaries, backup freshness. Does not start Compose.

## Glossary

Short analog: app / folder / links → Foundation / vault / graph.

- **Foundation** — the product
- **vault** — one instance (`FOUNDATION_DATA` + Postgres)
- **graph** — the knowledge in that vault
- **blob** — a file on a node
- **agent** — anything that can reach the vault MCP
- **user** — the human who runs Compose

Do not call the graph “the Vault.”

The user can run the written report, or attach it to Vault Keeper ([`AGENTS.md`](./AGENTS.md)). Skill: [`.agents/skills/vault-health/`](../.agents/skills/vault-health/). The host script keeps the vault up. The skill is the written report.

## Compose stays

The vault is a folder, Postgres, and the Foundation process. Compose is how a clone starts those today (`docker compose up --build`). `restart: unless-stopped` already restarts a container when Docker itself is still running. That line does nothing when Docker is quit, missing from this machine, or not on `PATH`. Port `8787` is refused. The data dir is still there.

A tighter Compose restart policy cannot start Docker. The product does not ship a second official way to run Postgres and the app as host processes. The host script notices when the vault is down and tries Compose once.

Do not add `get_vault_health`, `run_maintenance`, `propose_reorganize`, `audit_links`, or `cleanup_dangling_links`. Those jobs are this note and [graph hygiene](./GRAPH_HYGIENE.md), not MCP tools.

Graph-side report (duplicate titles, zero-edge nodes, type soup) is **not** this note. That is weekly [graph hygiene](./GRAPH_HYGIENE.md). Git pull, compose rebuild, and the post-pull git-tree leak scan are **not** this note. Those are [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/) and [`.agents/skills/repo-leak-scan/`](../.agents/skills/repo-leak-scan/). Dream rewrites the record from today's activity; that pass has its own clock.

## Keep the vault up

A **machine job**. Not a bot. Not a weekday-only check. No bot wake. Curl is cheap; a bot every few minutes is not.

Every **15 minutes**, all 7 days, user-local, on the machine that runs Compose. Put the script on that machine’s schedule (cron on Linux or Mac, or the equivalent). Do not put a live schedule or a home path into git.

Run in order:

1. `GET /health` — unauthenticated. Default `http://127.0.0.1:8787/health`. Expect HTTP 200 and:

   ```json
   { "ok": true, "service": "foundation", "db": "up" }
   ```

   Fail if the request errors, status is not 200, `ok` is not true, `service` is not `foundation`, or `db` is not `up`.

2. If that is green: **stop. Write nothing.**

3. If Docker is not on this machine, or Compose cannot talk to it: **nag.** Do not invent another start path.

4. From the clone that has `docker-compose.yml`: `docker compose up -d` **once**. Not `--build` (that is product updates). Do not loop. Do not `down`. Do not mkdir `FOUNDATION_DATA`. Do not write the graph.

5. Wait until `GET /health` is green, or about one minute.

6. If health came back: **stop. Write nothing.**

7. If health still fails: **nag.**

Nag on stderr. Say what failed and the smallest next look (start Docker, then from the clone: `docker compose up -d`). Leave the graph and `FOUNDATION_DATA` as they are. The product does not send mail. If the machine’s scheduler mails stderr, that is the nag. The weekday 9:15 report also pings in chat if `/health` is still down that morning.

Save a script with those steps on the machine. Point the schedule at that script. Use a clone path on that machine; do not commit that path.

```
*/15 * * * * /path/to/the/clone/keep-vault-up.sh
```

## Weekday 9:15 written report

A **quiet report** (weekdays, **9:15** user-local). Attach it to Vault Keeper, or run it. It uses HTTP, the host filesystem, and existing MCP tools the same way a careful user would. When everything is fine, it stays silent. It pings the user **only on failure**. It does **not** start Compose. The host script should have already tried.

Do not `upsert`, `delete`, `unlink`, `undo`, or `manage_type` unless the user asked for a repair in that conversation. Report; don’t rewrite the graph unattended.

Not email. No digest. Pings stay in the user’s chat.

Not a write-ACL. The API key is the gate.

Run this report from a process that can hit `http://127.0.0.1:8787` on the host running Compose.

Run in order. Stop at the first hard failure and ping. Skip a check when its input is unset — a fresh clone with no well-known nodes is allowed to be healthy. Backup freshness uses `BACKUP_ROOT`; skip that check only if the user unset it.

A first-day empty graph is a valid vault. Keep `FOUNDATION_DATA` in place and leave Compose volumes intact.

### 1. `GET /health` — process + db

Same contract as the host script. Default: `http://127.0.0.1:8787/health`. If this fails, ping. Do not run `compose up` from this report.

### 2. `FOUNDATION_DATA` is the real vault

Read `.env` (or the user’s configured path). Default is `./data`. This directory **is** the vault: Postgres cluster + blobs. Not agent-data. Not an empty leftover cluster.

**Not agent-data.** Fail if the path is inside an agent profile or memory directory. Durable files belong under `FOUNDATION_DATA` only.

**Not an empty leftover cluster.** Fail if you are clearly looking at the wrong leftover, for example:

- Path missing while Compose claims to be healthy
- `$FOUNDATION_DATA/postgres` missing, empty, or with no `PG_VERSION` (not a Postgres cluster)
- The host user who runs Compose cannot read `$FOUNDATION_DATA/postgres/PG_VERSION`
- A second leftover Compose project / volume the user did not mean (wrong cwd, wrong project name, bind mount that isn’t the `.env` path)

Do not create `$FOUNDATION_DATA/postgres` or `PG_VERSION` on that miss.

**Host can read the live dir.** After a real cluster exists, the host user who runs Compose can read `$FOUNDATION_DATA/postgres/PG_VERSION` and `$FOUNDATION_DATA/blobs`. That is enough for a host copy or backup. A data dir that is only mode 0700 is invisible to host copy and backup. Postgres still starts. First `compose up` on an empty data dir still inits.

The product grants that host user named POSIX ACL read on those paths after the cluster exists. Compose `db-init` calls `scripts/vault-data-dir.sh prepare` before mkdir. After the official image `chmod 00700` on `PGDATA`, `db-host-read` calls `grant`. The server calls `grant` again after it `chmod`s `blobs/`. It takes the uid from the owner of the clone, or `FOUNDATION_HOST_UID`, not a baked-in number. Unix mode stays 0700 or 0750, never world-writable. If the data dir cannot take a named ACL, Compose still starts. Host-side health fails while the host cannot read `PG_VERSION`.

**Not a first-run over a miss.** If `$FOUNDATION_DATA/postgres` exists and `PG_VERSION` is missing, refuse. That is not an empty first `compose up`. Do not mkdir an empty live cluster over the miss.

A **first-day empty graph** (seed types/relations, zero user nodes) is **not** a failure. That is a new clone’s vault. Only treat “empty” as failure when the user configured well-known nodes (check 3) or explicitly said this vault should already hold a graph.

### 3. Well-known nodes (if configured)

If the user listed a couple of node UUIDs or stable titles in the routine prompt, `get` them (UUID) or `search` then `get` (title). Expect those nodes to exist and not be soft-deleted.

If the list is empty, **skip**. Do not invent nodes. Do not fail a fresh graph for lacking them.

### 4. Backup not missing/stale

The product ships `scripts/backup-vault.sh`. Default backup path is `BACKUP_ROOT` (sibling of the data dir). Health checks that the path exists and the newest artifact is newer than 48 hours. Health does not dump.

If the user unset `BACKUP_ROOT`, **skip**. Do not nag.

How to take a dump and how to restore into a throwaway instance: [`BACKUP.md`](./BACKUP.md).

## How to check (existing surface)

Intent only — tool JSON schemas change; call `bootstrap` and use what the server describes.

| Check | Use |
| --- | --- |
| Process + db | `GET /health` |
| Start the stack once | Host script: `docker compose up -d` (not `--build`) |
| Types still seeded | `bootstrap` or `inspect_ontology`. Seed-only is OK on day one. |
| Canary nodes | `get` / `search` |
| Recent writes (optional context, not a fail) | `list_activity` with a `since` window |
| Data dir (the vault) | Host filesystem + `.env` `FOUNDATION_DATA`. Host-read check: `scripts/vault-data-dir.sh` (`foundation_vault_data_dir_health_pg_version`). Do not mkdir on a miss. |
| Backup | Host filesystem at `BACKUP_ROOT` (skip only if the user unset it) |

Auth for `/mcp`: `Authorization: ApiKey <FOUNDATION_API_KEY>` (Bearer equivalent). `/health` needs no key.

## Failure ping

**Host script:** stderr. What failed, and the smallest next look (start Docker, then `docker compose up -d` from the clone).

**Weekday report:** chat. What failed, what you observed, and the smallest next look (start Docker, fix `FOUNDATION_DATA`, restore from the user’s backup). Leave the graph and `FOUNDATION_DATA` as they are unless the user asked for a repair in this conversation.
