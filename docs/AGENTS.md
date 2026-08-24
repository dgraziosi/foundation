# Starter recipes

After Compose is up, paste these three bots into your harness. They use the vault MCP and the fourteen tools already on the server.

`GET http://127.0.0.1:8787/health` should return `{ "ok": true, "service": "foundation", "db": "up" }`. How to attach MCP (URL, API key, confirm with `bootstrap` or a simple `search`): [`HARNESS.md`](./HARNESS.md).

Each recipe uses the same locked headings: Job, Responsibilities, Standards, Routines, Skills, Tools, Handoffs. Skills are named recipe folders under [`.agents/skills/`](../.agents/skills/). Tools are connectors and runtimes. Paste the bots. Their routines cite skill folders; do not paste those folders as extra bots.

## Chief of Staff

Paste [`prompts/chief.md`](../prompts/chief.md). This is the bot you talk to. It files what matters in the vault and keeps you current on what is open and due. Give it the vault MCP on the machine that runs Compose.

## Vault Keeper

Paste [`prompts/vault-keeper.md`](../prompts/vault-keeper.md). Same machine, same vault MCP. Its routines cite:

1. Vault health — [`.agents/skills/vault-health/`](../.agents/skills/vault-health/). Read [`VAULT_HEALTH.md`](./VAULT_HEALTH.md). Health checks `BACKUP_ROOT`; it does not create a dump.
2. Dream — [`.agents/skills/dream/`](../.agents/skills/dream/). Nightly vault pass at 02:00 user-local, all 7 nights. Run before backup when both exist. Rewrites the record from today's activity, closes what's done, and cleans obvious duplicates. Invents nothing.
3. Nightly backup — [`.agents/skills/backup-vault/`](../.agents/skills/backup-vault/). Runs `scripts/backup-vault.sh`.
4. Graph hygiene — [`.agents/skills/graph-hygiene/`](../.agents/skills/graph-hygiene/). Read [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md).
5. Product updates — [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/). On the machine that runs Compose: `git fetch` / `git pull --ff-only` on main, `docker compose up --build -d`, wait for `/health`.

Fill in the user config (data dir, optional well-known nodes, `BACKUP_ROOT`, clone path). Vault Keeper keeps `FOUNDATION_DATA` in place and leaves Compose volumes intact.

## Executive Assistant

Paste [`prompts/executive-assistant.md`](../prompts/executive-assistant.md). Give it mail, calendar, and the vault MCP so it can read due dates.

## Another bot

Chief of Staff uses [`.agents/skills/create-bot/`](../.agents/skills/create-bot/), fills the seven headings on the blank template in that folder, and pastes the result into the user’s harness.

## Where bots live

| File | Paste into |
| --- | --- |
| [`prompts/chief.md`](../prompts/chief.md) | Chief of Staff |
| [`prompts/vault-keeper.md`](../prompts/vault-keeper.md) | Vault Keeper |
| [`prompts/executive-assistant.md`](../prompts/executive-assistant.md) | Executive Assistant |

## Where skills live

Named skill folders under [`.agents/skills/`](../.agents/skills/). Do not paste these as bots. How a named harness loads that folder: [`HARNESS.md`](./HARNESS.md).

| Folder | Use |
| --- | --- |
| [`.agents/skills/create-bot/`](../.agents/skills/create-bot/) | Another bot from the blank template |
| [`.agents/skills/handoff/`](../.agents/skills/handoff/) | Name who has the work now, or say done |
| [`.agents/skills/foundation-mcp/`](../.agents/skills/foundation-mcp/) | Vault MCP — which call to use |
| [`.agents/skills/vault-health/`](../.agents/skills/vault-health/) | Weekday morning vault-health routine |
| [`.agents/skills/dream/`](../.agents/skills/dream/) | Nightly Dream pass (02:00 user-local) |
| [`.agents/skills/backup-vault/`](../.agents/skills/backup-vault/) | Nightly backup (`scripts/backup-vault.sh`) |
| [`.agents/skills/graph-hygiene/`](../.agents/skills/graph-hygiene/) | Weekly graph-hygiene routine |
| [`.agents/skills/update-foundation/`](../.agents/skills/update-foundation/) | Weekday product-update routine |
| [`.agents/skills/repo-leak-scan/`](../.agents/skills/repo-leak-scan/) | Optional git-tree scan for secrets (no vault key) |

## Everyday words

Write everyday English. Tester fails a new glossary word that is not a feature name, same as OPERATIONS voice. Feature brands only: Dream, Vault. Url and repo are ordinary words. Link is the edge verb.

- **record** — the node
- **activity** — the audit log
- **user** — the human who runs Compose
- **bot** — a named role

Do not mint Replay, Reconcile, Hygiene, Living, Code, Present, Current picture, or Pointer.

If you touch MCP or these words, every skill that cites the vault ships in the same PR. Tester fails a skill that still uses a retired word, same as OPERATIONS voice.
