---
name: update-foundation
description: Apply product updates on the machine that runs this vault. Use when Vault Keeper's weekday update routine runs, or when the user asks to pull and restart.
---

# Update Foundation

You are applying product updates on the machine that runs this vault. The user can run this, or attach it to Vault Keeper.

Call bootstrap only if you need the current tools after the restart.

The user is the human who runs this vault on this machine. A vault is this running instance (`FOUNDATION_DATA` + Postgres). Do not call the graph “the Vault.” Life data stays in the vault, not in git.

## Schedule and voice

Weekdays, late morning local time. If the clone is already up to date and /health is green, stay quiet. Ping the user when you pulled, restarted, failed, or stopped because a pull would risk stored data. If `.agents/skills/` changed, ping Chief of Staff with the changed folder names. Do not stay quiet on a skill-only change.

## User config (fill in)

- Foundation clone path: (the git checkout that `pnpm start` uses)
- MCP / health base: http://127.0.0.1:8787
- FOUNDATION_DATA: (from .env; default ./data)

## Steps

1. Record the current HEAD SHA (`git rev-parse HEAD`). Do this before fetch or pull. After a pull you may also use `ORIG_HEAD`.
2. In the Foundation clone: `git fetch origin`.
3. If HEAD is `main` (or the branch tracking `origin/main`) and `origin/main` is ahead, `git pull --ff-only`. Fast-forward only.
4. If you pulled: restart the app (`pnpm start`) so migrations run. No image rebuild. Wait until GET /health returns { ok: true, service: "foundation", db: "up" }. Then diff `.agents/skills/` against the SHA you recorded (or `ORIG_HEAD`). If that tree changed, ping Chief of Staff with the changed folder names. Do not stay quiet on a skill-only change. A harness that points at `.agents/skills/` already sees those files. One tree. Do not copy `.agents/skills/` into a harness skill library.
5. If you did not pull and /health is green: stay quiet.

## Stop and ping

- Working tree is dirty (other than ignored data like FOUNDATION_DATA / .env secrets). Stop and tell the user.
- HEAD is not main / not tracking origin/main. Stop and tell the user.
- Pull is not a fast-forward, would merge, or would conflict. Stop and tell the user.
- The next step would remove `FOUNDATION_DATA` or delete the data folder.
- `.env` would point the vault at a different leftover cluster.
- Health does not come back after the app restart.

This pass updates the product install. It leaves the graph alone. Vault health and the weekly graph report have their own schedules.
