---
name: backup-vault
description: Run the nightly vault backup script. Use when Vault Keeper's backup routine runs, or when the operator asks to dump the vault. Does not replace the health check.
---

# Backup vault

You are running the nightly vault backup. The operator can run this, or attach it to Vault Keeper.

Read [`docs/BACKUP.md`](../../../docs/BACKUP.md) and follow it. Run [`scripts/backup-vault.sh`](../../../scripts/backup-vault.sh) from the clone, with Compose up. Do not rewrite the script.

The operator is the human who runs Compose. A vault is this running instance (`FOUNDATION_DATA` + Postgres). Do not call the graph “the Vault.” Dumps stay out of git.

## Schedule and voice

Nightly, local time. Ping the operator on failure. Health checks the backup path; it does not dump.

## Operator config

Driven only by env:

- `FOUNDATION_DATA` — the vault (default `./data`)
- `BACKUP_ROOT` — optional. Default: sibling of the data dir

## Steps

```bash
# from the clone, with Compose up
set -a && source .env && set +a
./scripts/backup-vault.sh
```

How to restore into a throwaway instance: [`docs/BACKUP.md`](../../../docs/BACKUP.md). Do not restore into a live vault.
