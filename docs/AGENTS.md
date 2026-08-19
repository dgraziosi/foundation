# Starter recipes

After Compose is up, paste these three bots into your harness. They use the vault MCP and the fourteen tools already on the server.

`GET http://127.0.0.1:8787/health` should return `{ "ok": true, "service": "foundation", "db": "up" }`. How to attach MCP (URL, API key, confirm with `bootstrap` or a simple `search`): [`HARNESS.md`](./HARNESS.md).

Each recipe uses the same locked headings: Job, Responsibilities, Standards, Routines, Skills, Handoffs. Paste the seats. Their routines cite skill folders; do not paste those folders as extra bots.

## Chief of Staff

Paste [`prompts/chief.md`](../prompts/chief.md). This is the bot you talk to. It files what matters in the vault and keeps you current on what is open and due. Give it the vault MCP on the machine that runs Compose.

## Vault Keeper

Paste [`prompts/vault-keeper.md`](../prompts/vault-keeper.md). Same machine, same vault MCP. Its routines cite:

1. Vault health — [`.agents/skills/vault-health/`](../.agents/skills/vault-health/). Read [`VAULT_HEALTH.md`](./VAULT_HEALTH.md). Health checks `BACKUP_ROOT`; it does not create a dump.
2. Nightly backup — [`.agents/skills/backup-vault/`](../.agents/skills/backup-vault/). Runs `scripts/backup-vault.sh`.
3. Graph hygiene — [`.agents/skills/graph-hygiene/`](../.agents/skills/graph-hygiene/). Read [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md).
4. Product updates — [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/). On the machine that runs Compose: `git fetch` / `git pull --ff-only` on main, `docker compose up --build -d`, wait for `/health`.

Fill in the operator config (data dir, optional well-known nodes, `BACKUP_ROOT`, clone path). Vault Keeper keeps `FOUNDATION_DATA` in place and leaves Compose volumes intact.

## Executive Assistant

Paste [`prompts/executive-assistant.md`](../prompts/executive-assistant.md). Give it mail, calendar, and the vault MCP so it can read due dates.

## Another bot

Chief of Staff uses [`.agents/skills/create-bot/`](../.agents/skills/create-bot/), fills the six headings on the blank template in that folder, and pastes the result into the operator’s harness.

## Where seats live

| File | Paste into |
| --- | --- |
| [`prompts/chief.md`](../prompts/chief.md) | Chief of Staff |
| [`prompts/vault-keeper.md`](../prompts/vault-keeper.md) | Vault Keeper |
| [`prompts/executive-assistant.md`](../prompts/executive-assistant.md) | Executive Assistant |

## Where skills live

Named skill folders under [`.agents/skills/`](../.agents/skills/). Do not paste these as seats. How a named harness loads that folder: [`HARNESS.md`](./HARNESS.md).

| Folder | Use |
| --- | --- |
| [`.agents/skills/create-bot/`](../.agents/skills/create-bot/) | Another seat from the blank template |
| [`.agents/skills/vault-health/`](../.agents/skills/vault-health/) | Weekday morning vault-health routine |
| [`.agents/skills/backup-vault/`](../.agents/skills/backup-vault/) | Nightly backup (`scripts/backup-vault.sh`) |
| [`.agents/skills/graph-hygiene/`](../.agents/skills/graph-hygiene/) | Weekly graph-hygiene routine |
| [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/) | Weekday product-update routine |
| [`.agents/skills/repo-leak-scan/`](../.agents/skills/repo-leak-scan/) | Optional git-tree scan for secrets (no vault key) |
