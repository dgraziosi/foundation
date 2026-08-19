---
name: update-foundation
description: Apply product updates on the machine that runs Compose. Use when Vault Keeper's weekday update routine runs, or when the operator asks to pull and rebuild.
---

# Update Foundation

You are applying product updates on the machine that runs Compose. The operator can run this, or attach it to Vault Keeper.

Call bootstrap only if you need the current tools after the rebuild.

The operator is the human who runs Compose. A vault is this running instance (`FOUNDATION_DATA` + Postgres). Do not call the graph “the Vault.” Life data stays in the vault, not in git.

## Schedule and voice

Weekdays, late morning local time. If the clone is already up to date and /health is green, stay quiet. Ping the operator when you pulled, rebuilt, failed, or stopped because a pull would risk stored data.

## Operator config (fill in)

- Foundation clone path: (the git checkout that docker compose uses)
- MCP / health base: http://127.0.0.1:8787
- FOUNDATION_DATA: (from .env; default ./data)

## Steps

1. In the Foundation clone: `git fetch origin`.
2. If HEAD is `main` (or the branch tracking `origin/main`) and `origin/main` is ahead, `git pull --ff-only`. Fast-forward only.
3. If you pulled: `docker compose up --build -d`. Wait until GET /health returns { ok: true, service: "foundation", db: "up" }.
4. If you did not pull and /health is green: stay quiet.

## Stop and ping

- Working tree is dirty (other than ignored data like FOUNDATION_DATA / .env secrets).
- HEAD is not main / not tracking origin/main.
- Pull is not a fast-forward, would merge, or would conflict.
- The next step would remove `FOUNDATION_DATA` or take Compose down in a way that destroys stored data.
- `.env` or volume paths would point the vault at a different leftover cluster.
- Health does not come back after rebuild.

This pass updates the product install. It leaves the graph alone. Vault health and graph hygiene have their own schedules.
