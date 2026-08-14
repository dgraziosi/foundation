You are applying product updates on the host running Compose: git fetch/pull the product, rebuild Compose, confirm /health. This is an instance routine the operator can run, or attach to an instance-keeper. In the optional named-agent recipe this is a Librarian (instance-keeper) routine — not new MCP tools. Librarian is not the operator.

Intent below; do not freeze JSON schemas. Call bootstrap only if you need the current tool surface after the rebuild.

Foundation is the product (this GitHub clone, Docker, MCP). A vault is this running instance (FOUNDATION_DATA + Postgres). The graph lives in the vault. Do not call the graph “the Vault.” An agent that can reach the vault MCP may read/write; one that cannot does not get the API key and does not upsert. The operator is the human who runs Compose — only the human.

Do not commit personal life data, documents, or secrets to this repository. Those belong in the operator’s vault, not in git. After pulling product updates, an optional agent that reads git (no vault key) scans the tree and recent diffs for secrets and personal data. Report-only; quiet if clean. Prompt: prompts/repo-leak-scan.md.

## Schedule and voice

Weekdays, late morning local time. If the clone is already up to date and /health is green, stay completely quiet (no ping, no email, no digest) **except** the Monday leak-scan backup. Ping the operator only when you pulled, rebuilt, failed, stopped because a pull would risk the vault, or the leak-scan agent found something.

## Operator config (fill in)

The operator (the human) sets these.

- Foundation clone path: (the git checkout that docker compose uses)
- MCP / health base: http://127.0.0.1:8787
- FOUNDATION_DATA: (from .env; default ./data) — never delete this

## Steps

1. In the Foundation clone: `git fetch origin`.
2. If HEAD is `main` (or the branch tracking `origin/main`) and `origin/main` is ahead, `git pull --ff-only`. Never `--force`. Never reset hard.
3. If you pulled: `docker compose up --build -d`. Wait until GET /health returns { ok: true, service: "foundation", db: "up" }. Then an optional agent that reads git (no vault key) runs [`prompts/repo-leak-scan.md`](repo-leak-scan.md) (report-only; quiet if clean).
4. If you did **not** pull: stay quiet **unless** it is Monday and nothing was pulled this week — then still run the leak-scan agent (the Monday backup). Health green and no pull on other weekdays: stay quiet.

## Stop and ping (do not continue)

- Working tree is dirty (other than ignored data like FOUNDATION_DATA / .env secrets you must not commit).
- HEAD is not main / not tracking origin/main.
- Pull is not a fast-forward, would merge, or would conflict.
- Anyone’s next step would be `docker compose down -v`, deleting FOUNDATION_DATA, or otherwise wiping the vault.
- `.env` or volume paths would point the vault at a different leftover cluster.
- Health does not come back after rebuild.

Do not upsert graph data on this routine. Do not run vault health or graph hygiene here (those are their own schedules). Product bugs go to the architect (Seldon in this recipe) — do not patch the repo.

## Hard rules

- Never force-pull. Never `docker compose down -v`. Never delete FOUNDATION_DATA.
- If pull would wipe the vault, stop and ping.
- Do not add get_vault_health or any other MCP tool.
- Do not invent a write-ACL. An agent that can reach the vault MCP may read/write; one that cannot does not get the API key and does not upsert.
- Do not open a PR about graph data.
- Leak-scan is report-only. Do not rewrite git history. Do not put findings’ secret values into git or a pull request.
