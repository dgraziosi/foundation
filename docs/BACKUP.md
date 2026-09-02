# Vault backup

The product ships [`scripts/backup-vault.sh`](../scripts/backup-vault.sh). That script is a host cron/script, not a bot wake. Vault Keeper’s backup skill is [`.agents/skills/backup-vault/`](../.agents/skills/backup-vault/): it nags if the dump is missing or old. Health checks the path; it does not dump. Dumps stay out of git.

A **vault** is one instance (`FOUNDATION_DATA` + Postgres). Do not call the graph “the Vault.”

## What it writes

Driven by env, else the clone `.env` (same as keep-up). Relative paths are under the clone.

- `FOUNDATION_DATA` — the vault (default `./data` under the clone)
- `DATABASE_URL` — localhost Postgres from the environment or the clone `.env`. No silent default. Copy `.env.example` and fill the password.
- `BACKUP_ROOT` — optional. Also read from the clone `.env`. Default: a sibling of the data dir (`./foundation-backups` when `FOUNDATION_DATA` is `./data`). Relative paths are under the clone. Never inside `FOUNDATION_DATA`.

Each run (the vault stays up):

1. Online `pg_dump` of localhost Postgres (the URL in `.env`) to a temp file, then `$BACKUP_ROOT/sql/foundation-YYYYMMDD.sql` (mode `0600`) only after the rest of the run succeeds
2. `rsync -a --delete` `$FOUNDATION_DATA/blobs/` into a staging tree (not into `$BACKUP_ROOT/blobs/`)
3. `$BACKUP_ROOT/MANIFEST` — date, dump size, blob count from the staging tree, product git SHA when the checkout has one, checksum of that day’s dump. No node titles, no graph payloads, no life text.
4. After the dump and `MANIFEST` are in place, swap the staging tree into `$BACKUP_ROOT/blobs/` (one tree, not a dated copy)

It skips `uploads/`. It does not copy the live `postgres/` cluster. Same-day success overwrites that day’s SQL and ends with one blob tree that matches live (including deletions). SQL files older than 14 days are pruned; the last remaining dump is never deleted. If dump, staging rsync, `MANIFEST`, or the final swap fails — or any later step aborts — temps and every `blobs.staging.*` tree are deleted. If dump and `MANIFEST` had already been moved, the previous same-day copies are restored; if this was the first dump of the day, those new files are removed. `$BACKUP_ROOT/blobs/` stays as it was. A retry does not accumulate staging directories.

```bash
# from the clone, with Postgres and the app up
set -a && source .env && set +a
./scripts/backup-vault.sh
```

Put that script on this machine’s nightly schedule. Do not put a live path into git.

## Restore (throwaway only)

Do not restore into a live vault. Use a throwaway data folder.

```bash
# from the clone
set -a && source .env && set +a

export FOUNDATION_DATA=./restore-data
mkdir -p "$FOUNDATION_DATA/blobs"
rsync -a "$BACKUP_ROOT/blobs/" "$FOUNDATION_DATA/blobs/"

# Fresh Postgres in the throwaway folder. Load the dump before the app starts.
# Start Postgres with that folder's postgres tree, then:
psql "$DATABASE_URL" < "$BACKUP_ROOT/sql/foundation-YYYYMMDD.sql"

pnpm start
```

Then check:

1. `GET /health` — `{ "ok": true, "service": "foundation", "db": "up" }`
2. `get` a node you expect in that dump
3. Fetch one blob: `GET /blobs/:id` with the API key

Stop the throwaway app, then that Postgres. Leave the live vault’s `FOUNDATION_DATA` as it is.

## Already on Compose

Dump while that stack is still up. Stop Compose. Install host Postgres 16 (Mac or Linux; the package name is unknown in this repo). Point `FOUNDATION_DATA` at one data folder. Restore the dump into a host cluster in that folder, or start Postgres on the existing `postgres/` tree if it is already there. Start Postgres, then `pnpm start`. Do not write a live instance story into git.
