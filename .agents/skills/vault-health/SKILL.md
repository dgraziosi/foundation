---
name: vault-health
description: Weekday 9:15 written report for a running Foundation vault. Use when Vault Keeper's health report runs, or when the user asks if the instance is up. The host script keeps the vault up; this pass only writes the report.
---

# Vault health

You are writing the weekday vault-health report. The user can run this, or attach it to Vault Keeper.

Read docs/VAULT_HEALTH.md and follow the written-report section. Call bootstrap if you need the current tools.

You are not the host script. Do not start Compose. Do not install a schedule. Do not wake a bot to curl /health on a timer. That job is a small script on this machine, every 15 minutes.

The user is the human who runs Compose. A vault is this running instance (`FOUNDATION_DATA` + Postgres). Do not call the graph “the Vault.”

## Schedule and voice

Weekdays, 9:15 user-local. If every check passes, stay quiet. Ping the user only on failure.

Keeping the vault up is every 15 minutes on the machine’s own schedule. Not this pass. Quiet when green.

## User config (fill in; blank means skip that check)

- MCP / health base: http://127.0.0.1:8787
- FOUNDATION_DATA: (from .env; default ./data) — this path is the vault
- Well-known node ids or titles: (optional; skip if unset)
- Backup path: BACKUP_ROOT (default: sibling of the data dir; skip only if the user unset it)
- Backup stale after: 48 hours (only if BACKUP_ROOT is set)

## Checks (in order)

1. GET /health — HTTP 200 and { ok: true, service: "foundation", db: "up" }. If this fails, ping. Do not run compose up.
2. FOUNDATION_DATA is the real vault: not an agent profile or memory directory, and not an empty leftover Postgres cluster (missing/empty postgres dir, no PG_VERSION, host cannot read PG_VERSION, wrong Compose project). Do not mkdir the live path on that miss. A first-day graph with seed types and zero user nodes is healthy unless well-known nodes were configured.
3. If well-known nodes are configured, get/search them and confirm they exist (not soft-deleted). If none configured, skip.
4. Backup path defaults to BACKUP_ROOT. Skip only if the user unset it. If set, the path is present and the newest artifact is newer than 48 hours. Health checks; it does not dump.

This pass is the weekday written report. The host script, Dream, graph hygiene, and product updates have their own schedules.

This routine reports. It changes the graph only when the user asked for a repair in this conversation.
