# Vault backup

The product ships [`scripts/backup-vault.sh`](../scripts/backup-vault.sh). Vault Keeper (or the operator) runs it. Health checks the path; it does not dump. Dumps stay out of git.

A **vault** is one instance (`FOUNDATION_DATA` + Postgres). Do not call the graph “the Vault.”

## What it writes

Driven only by env:

- `FOUNDATION_DATA` — the vault (default `./data`)
- `BACKUP_ROOT` — optional. Default: a sibling of the data dir (`./foundation-backups` when `FOUNDATION_DATA` is `./data`). Never inside `FOUNDATION_DATA`.

Each run (Compose stays up):

1. Online `pg_dump` of the Compose `db` service (user `foundation`, database `foundation`) to `$BACKUP_ROOT/sql/foundation-YYYYMMDD.sql` (mode `0600`)
2. `rsync -a --delete` `$FOUNDATION_DATA/blobs/` → `$BACKUP_ROOT/blobs/` (one tree, not a dated copy)
3. `$BACKUP_ROOT/MANIFEST` — date, dump size, blob count, product git SHA when the checkout has one, checksum of that day’s dump. No node titles, no graph payloads, no life text.

It skips `uploads/`. It does not copy the live `postgres/` cluster. The day’s dump stays in a temp file until blobs are rsynced and `MANIFEST` is written from that temp dump; only then are the dump and `MANIFEST` moved into place. Same-day success overwrites that day’s SQL. SQL files older than 14 days are pruned; the last remaining dump is never deleted. If dump, rsync, or `MANIFEST` fails, temps are deleted and the last good dump and `MANIFEST` stay in place.

```bash
# from the clone, with Compose up
set -a && source .env && set +a
./scripts/backup-vault.sh
```

## Restore (throwaway only)

Do not restore into a live vault. Use a throwaway data dir and a different Compose project name.

```bash
# from the clone that has docker-compose.yml
set -a && source .env && set +a

export FOUNDATION_DATA=./restore-data
export COMPOSE_PROJECT_NAME=foundation-restore
mkdir -p "$FOUNDATION_DATA/blobs"
rsync -a "$BACKUP_ROOT/blobs/" "$FOUNDATION_DATA/blobs/"

# Fresh Postgres in the throwaway dir. Load the dump before the app starts.
docker compose up -d db
# wait until the db service is healthy
docker compose exec -T db psql -U foundation -d foundation < "$BACKUP_ROOT/sql/foundation-YYYYMMDD.sql"

docker compose up -d foundation
```

Then check:

1. `GET /health` — `{ "ok": true, "service": "foundation", "db": "up" }`
2. `get` a node you expect in that dump
3. Fetch one blob: `GET /blobs/:id` with the API key

Tear down the throwaway project when you are done (`docker compose down`). Leave the live vault’s `FOUNDATION_DATA` and Compose project as they are.
