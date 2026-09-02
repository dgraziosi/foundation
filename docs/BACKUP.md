# Vault backup

The product ships [`scripts/backup-vault.sh`](../scripts/backup-vault.sh). That script is a host cron/script, not a bot wake. Vault Keeper’s backup skill is [`.agents/skills/backup-vault/`](../.agents/skills/backup-vault/): it nags if the dump is missing or old. Health checks the path; it does not dump. Dumps stay out of git.

A **vault** is one instance (`FOUNDATION_DATA` + Postgres). Do not call the graph “the Vault.”

## What it writes

Driven by env, else the clone `.env` (same as keep-up). Relative paths are under the clone.

- `FOUNDATION_DATA` — the vault (default `./data` under the clone)
- `DATABASE_URL` — localhost Postgres from the environment or the clone `.env`. No silent default. Copy `.env.example` and fill the password.
- `BACKUP_ROOT` — optional. Also read from the clone `.env`. Default: a sibling of the data dir (`./foundation-backups` when `FOUNDATION_DATA` is `./data`). Relative paths are under the clone. Never inside `FOUNDATION_DATA`.
- `BACKUP_AGE_RECIPIENT` — required. The age public recipient. The dump refuses if this is unset. A file on disk is not plaintext SQL.
- `BACKUP_KEEP_DAYS` — optional. Default 14. Integer of 1 or more. Last dump is never deleted. A clone that wants a longer window sets this number.
- `BACKUP_OFFSITE` — optional. A directory on this machine that you copy or sync off this machine. After a good dump, the script rsyncs `sql/`, `MANIFEST`, and `blobs/` there. Never inside `FOUNDATION_DATA` or `BACKUP_ROOT`. This process does not pick a cloud.

Each run (the vault stays up):

1. Online `pg_dump` of localhost Postgres (the URL in `.env`) to a temp file. Scan that plaintext for node rows (`has_people`). Encrypt with `age` to `$BACKUP_ROOT/sql/foundation-YYYYMMDD.sql.age` (mode `0600`) only after the rest of the run succeeds. Do not install a plaintext `.sql`.
2. `rsync -a --delete` `$FOUNDATION_DATA/blobs/` into a staging tree (not into `$BACKUP_ROOT/blobs/`)
3. `$BACKUP_ROOT/MANIFEST` — date, dump path, dump size, blob count from the staging tree, `has_people`, product git SHA when the checkout has one, checksum of that day’s encrypted dump. No node titles, no graph payloads, no life text.
4. After the dump and `MANIFEST` are in place, swap the staging tree into `$BACKUP_ROOT/blobs/` (one tree, not a dated copy)
5. If `BACKUP_OFFSITE` is set, rsync `sql/`, `MANIFEST`, and `blobs/` there

It skips `uploads/`. It does not copy the live `postgres/` cluster. Same-day success overwrites that day’s dump and ends with one blob tree that matches live (including deletions). Dumps older than `BACKUP_KEEP_DAYS` (default 14) are pruned; leftover plaintext `.sql` and encrypted `.sql.age` names are both pruned; the last remaining dump is never deleted. The first encrypted night does not wipe leftover plaintext. If dump, encrypt, staging rsync, `MANIFEST`, or the final swap fails — or any later step aborts — temps and every `blobs.staging.*` tree are deleted. If dump and `MANIFEST` had already been moved, the previous same-day copies are restored; if this was the first dump of the day, those new files are removed. `$BACKUP_ROOT/blobs/` stays as it was. A retry does not accumulate staging directories.

`age` is required. The package name is unknown in this repo.

```bash
# from the clone, with Postgres and the app up
set -a && source .env && set +a
./scripts/backup-vault.sh
```

Put that script on this machine’s nightly schedule. Do not put a live path into git.

## Restore (throwaway)

Practice restore in a throwaway data folder. Leave the live vault’s `FOUNDATION_DATA` as it is.

```bash
# from the clone
set -a && source .env && set +a

export FOUNDATION_DATA=./restore-data
mkdir -p "$FOUNDATION_DATA/blobs"
rsync -a "$BACKUP_ROOT/blobs/" "$FOUNDATION_DATA/blobs/"

# Fresh Postgres in the throwaway folder. Decrypt, then load the dump before the app starts.
# Start Postgres with that folder's postgres tree, then:
age -d -i "$BACKUP_AGE_IDENTITY" -o /tmp/foundation-restore.sql \
  "$BACKUP_ROOT/sql/foundation-YYYYMMDD.sql.age"
psql "$DATABASE_URL" < /tmp/foundation-restore.sql
rm -f /tmp/foundation-restore.sql

pnpm start
```

Then check:

1. `GET /health` — `{ "ok": true, "service": "foundation", "db": "up" }`
2. `get` a node you expect in that dump
3. Fetch one blob: `GET /blobs/:id` with the API key

Stop the throwaway app, then that Postgres.

## Restore (in place)

Load a dated dump onto this vault. This `FOUNDATION_DATA` and this `DATABASE_URL` only. No other machine.

```bash
# from the clone
set -a && source .env && set +a
./scripts/restore-vault.sh --in-place --confirm YYYYMMDD
```

The script writes `$FOUNDATION_DATA/.restore-lock` so `scripts/keep-vault-up.sh` will not start this instance while restore runs. Decrypt uses `BACKUP_AGE_IDENTITY`. Confirm is the dump day (`YYYYMMDD`).

Then check `/health`, `get` a node you expect, and one blob.

## Already on Compose

Dump while that stack is still up. Stop Compose. Install host Postgres 16 (Mac or Linux; the package name is unknown in this repo). Point `FOUNDATION_DATA` at one data folder. Restore the dump into a host cluster in that folder, or start Postgres on the existing `postgres/` tree if it is already there. Start Postgres, then `pnpm start`. Do not write a live instance story into git.
