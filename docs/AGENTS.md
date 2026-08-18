# Starter recipes

After Compose is up, paste these three bots into your harness. They use the vault MCP and the thirteen tools already on the server.

`GET http://127.0.0.1:8787/health` should return `{ "ok": true, "service": "foundation", "db": "up" }`. How to attach MCP (URL, API key, confirm with `bootstrap` or a simple `search`): [`HARNESS.md`](./HARNESS.md).

Each recipe uses the same locked headings: Job, Responsibilities, Standards, Routines, Skills, Handoffs.

## Chief of Staff

Paste [`prompts/chief.md`](../prompts/chief.md). This is the bot you talk to. It files what matters in the vault and keeps you current on what is open and due. Give it the vault MCP on the machine that runs Compose.

## Vault Keeper

Paste [`prompts/vault-keeper.md`](../prompts/vault-keeper.md). Same machine, same vault MCP. Then attach:

1. Vault health — [`prompts/vault-health.md`](../prompts/vault-health.md). Read [`VAULT_HEALTH.md`](./VAULT_HEALTH.md). Nightly backup is `scripts/backup-vault.sh`. Health checks `BACKUP_ROOT`; it does not create a dump.
2. Graph hygiene — [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md). Read [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md).
3. Product updates — [`prompts/update-foundation.md`](../prompts/update-foundation.md). On the machine that runs Compose: `git fetch` / `git pull --ff-only` on main, `docker compose up --build -d`, wait for `/health`.

Fill in the operator config (data dir, optional well-known nodes, `BACKUP_ROOT`, clone path). Vault Keeper keeps `FOUNDATION_DATA` in place and leaves Compose volumes intact.

## Executive Assistant

Paste [`prompts/executive-assistant.md`](../prompts/executive-assistant.md). Give it mail, calendar, and the vault MCP so it can read due dates.

## Another bot

Chief of Staff copies [`prompts/bot-template.md`](../prompts/bot-template.md), fills the six headings, and pastes the result into the operator’s harness. The create-bot skill is [`skills/create-bot/SKILL.md`](../skills/create-bot/SKILL.md).

## Where prompts live

| File | Paste into |
| --- | --- |
| [`prompts/chief.md`](../prompts/chief.md) | Chief of Staff |
| [`prompts/vault-keeper.md`](../prompts/vault-keeper.md) | Vault Keeper |
| [`prompts/executive-assistant.md`](../prompts/executive-assistant.md) | Executive Assistant |
| [`prompts/vault-health.md`](../prompts/vault-health.md) | Weekday morning vault-health routine |
| [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md) | Weekly graph-hygiene routine |
| [`prompts/update-foundation.md`](../prompts/update-foundation.md) | Weekday product-update routine |
| [`prompts/repo-leak-scan.md`](../prompts/repo-leak-scan.md) | Optional git-tree scan for secrets (no vault key) |
