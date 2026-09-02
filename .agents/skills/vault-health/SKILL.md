---
name: vault-health
description: Weekday 9:15 written report for a running Foundation vault. Use when Vault Keeper's health report runs, or when the user asks if the instance is up. The host script keeps the vault up; this pass only writes the report.
---

# Vault health

You are writing the weekday vault-health report. The user can run this, or attach it to Vault Keeper.

Read docs/VAULT_HEALTH.md and follow the written-report section. Call bootstrap if you need the current tools.

You are not the host script. Do not start Postgres or the app. Do not install a schedule. Do not wake a bot to curl /health on a timer. That job is [`scripts/keep-vault-up.sh`](../../../scripts/keep-vault-up.sh). It starts the two host programs, curls `/health`, and fails on an empty cluster next to a real one. First-day 0 user records is healthy. `/health` green is not enough.

The user is the human who runs this vault on this machine. A vault is this running instance (`FOUNDATION_DATA` + Postgres). Do not call the graph “the Vault.”

## Schedule and voice

Weekdays, 9:15 user-local. If every check passes, stay quiet. Ping the user only on failure.

Keeping the vault up is the host script on this machine’s own schedule. Not this pass. Quiet when health is green and the live folder is the intended real cluster.

## User config (fill in; blank means skip that check)

- MCP / health base: http://127.0.0.1:8787
- FOUNDATION_DATA: (from .env; default ./data) — this path is the vault
- Well-known node ids or titles: (optional; skip if unset)
- Backup path: BACKUP_ROOT (default: sibling of the data dir; skip only if the user unset it)
- Backup stale after: 48 hours (only if BACKUP_ROOT is set)

## Checks (in order)

1. GET /health — HTTP 200 and { ok: true, service: "foundation", db: "up" }. If this fails, ping. Do not start the host programs.
2. FOUNDATION_DATA is the real vault: not an agent profile or memory directory, and not an empty leftover Postgres cluster (missing/empty postgres dir, no PG_VERSION, host cannot read PG_VERSION, empty live next to a backup or second tree that has people). Do not mkdir the live path on that miss. A first-day vault with seed types and 0 user records is healthy unless well-known nodes were configured.
3. If well-known nodes are configured, get/search them and confirm they exist (not soft-deleted). If none configured, skip.
4. Backup path defaults to BACKUP_ROOT. Skip only if the user unset it. If set, the path is present and the newest artifact is newer than 48 hours. Newest artifact may be `foundation-YYYYMMDD.sql.age`. Health checks; it does not dump. Nag if the dump is missing or old.

This pass is the weekday written report. The host script, Dream, the weekly graph report, and product updates have their own schedules.

This routine reports. It changes the graph only when the user asked for a repair in this conversation.
