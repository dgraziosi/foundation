---
name: backup-vault
description: Nightly dump is a host script. Use when Vault Keeper's backup routine runs, or when the user asks to dump the vault. Nag if the dump is missing or old. Does not replace the health check.
---

# Backup vault

You are checking the nightly vault backup. The user can run this, or attach it to Vault Keeper.

Read [`docs/BACKUP.md`](../../../docs/BACKUP.md). The dump itself is the host script [`scripts/backup-vault.sh`](../../../scripts/backup-vault.sh) on this machine’s schedule, not a bot wake. Do not rewrite the script.

The user is the human who runs this vault on this machine. A vault is this running instance (`FOUNDATION_DATA` + Postgres). Do not call the graph “the Vault.” Dumps stay out of git.

## Schedule and voice

Nightly, local time. The host script dumps. Ping the user if the dump is missing or old. Health checks the backup path; it does not dump.

## User config

Driven by env, else the clone `.env` (same as keep-up). Relative paths are under the clone.

- `FOUNDATION_DATA` — the vault (default `./data` under the clone)
- `BACKUP_ROOT` — optional. Also read from the clone `.env`. Default: sibling of the data dir
- `BACKUP_AGE_RECIPIENT` — required for dump
- `BACKUP_AGE_IDENTITY` — required for restore
- `BACKUP_KEEP_DAYS` — optional. Default 14
- `BACKUP_OFFSITE` — optional. A folder on this machine that the user copies or syncs

## Steps

If the user asked to dump now, from the clone, with Postgres up:

```bash
set -a && source .env && set +a
./scripts/backup-vault.sh
```

Otherwise nag if the dump is missing or older than 48 hours. Newest artifact may be `foundation-YYYYMMDD.sql.age`.

Throwaway restore for practice: [`docs/BACKUP.md`](../../../docs/BACKUP.md). In-place restore on this vault: [`scripts/restore-vault.sh`](../../../scripts/restore-vault.sh) with `--in-place --confirm YYYYMMDD`. Do not invent another machine.
