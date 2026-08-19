---
name: vault-health
description: Weekday morning checkup for a running Foundation vault. Use when Vault Keeper's health routine runs, or when the operator asks if the instance is up.
---

# Vault health

You are running vault health. The operator can run this, or attach it to Vault Keeper.

Read docs/VAULT_HEALTH.md and follow it. Call bootstrap if you need the current tools.

The operator is the human who runs Compose. A vault is this running instance (`FOUNDATION_DATA` + Postgres). Do not call the graph “the Vault.”

## Schedule and voice

Weekdays, morning local time. If every check passes, stay quiet. Ping the operator only on failure.

## Operator config (fill in; blank means skip that check)

- MCP / health base: http://127.0.0.1:8787
- FOUNDATION_DATA: (from .env; default ./data) — this path is the vault
- Well-known node ids or titles: (optional; skip if unset)
- Backup path: BACKUP_ROOT (default: sibling of the data dir; skip only if the operator unset it)
- Backup stale after: 48 hours (only if BACKUP_ROOT is set)

## Checks (in order)

1. GET /health — HTTP 200 and { ok: true, service: "foundation", db: "up" }.
2. FOUNDATION_DATA is the real vault: not an agent profile or memory directory, and not an empty leftover Postgres cluster (missing/empty postgres dir, no PG_VERSION, wrong Compose project). A first-day graph with seed types and zero user nodes is healthy unless well-known nodes were configured.
3. If well-known nodes are configured, get/search them and confirm they exist (not soft-deleted). If none configured, skip.
4. Backup path defaults to BACKUP_ROOT. Skip only if the operator unset it. If set, the path is present and the newest artifact is newer than 48 hours. Health checks; it does not dump.

This pass is the weekday checkup. Graph hygiene and product updates have their own schedules.

This routine reports. It changes the graph only when the operator asked for a repair in this conversation.
