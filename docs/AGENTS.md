# Agents around Foundation

Clone the product (`docker compose up`) **and** the system that maintains it. This doc is that second half.

## Glossary

Obsidian analog: Obsidian = app, a vault = one folder, graph = links inside.

- **Foundation** — the product (repo, Docker, MCP). What you install. Do not rename the GitHub repo or the MCP server `foundation`.
- **Vault** — one running instance: one `FOUNDATION_DATA`, one Postgres. A clone gets their own vault, not yours. Postgres vault, not markdown. Do **not** call the graph “the Vault.”
- **Graph** — the knowledge in that vault (people, projects, edges, blobs). Daily word.
- **Blob** — a file on a graph node.
- **Seldon** — architect of Foundation the product.
- **Chief** — primary writer (human dumps ideas; this agent writes the graph).
- **Librarian** — agent from day one. Owns vault health, graph hygiene, and applying git updates to the computer.

Do not commit personal life data, documents, or secrets to this repository. Those belong in the operator’s vault, not in git.

**Reachability.** An agent that can reach the vault MCP (`http://127.0.0.1:8787/mcp` on the machine running Compose) may read/write the graph. An agent that cannot reach that MCP does not get the API key and does not upsert.

After Compose is up ([README](../README.md)), a new operator does three pastes:

1. **Seldon** (architect) — [`prompts/architect.md`](../prompts/architect.md)
2. **Chief** (writer; optional but recommended) — [`prompts/chief.md`](../prompts/chief.md)
3. **Librarian** (created at init) — [`prompts/librarian.md`](../prompts/librarian.md), then attach the three routines below

Checks live in [`VAULT_HEALTH.md`](./VAULT_HEALTH.md) and [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md). Routine prompts are intent, not a substitute for those checks.

## Roles

### Seldon (architect)

Owns **product** work on this GitHub repo: SPEC, docs, git.

Does **not** own day-to-day graph writes. Those belong to Chief on a machine that can reach the vault MCP.

Does **not** apply git updates to the computer that hosts Compose, and does **not** run vault health or graph hygiene. That is Librarian.

Typical host: an agent with GitHub on this repo. Do not give it the vault API key unless that same agent can actually call the vault MCP.

### Chief (writer)

The human dumps messy ideas. This agent decides what becomes a node (or an update, a link, or nothing) and writes the graph.

Typical host: an agent on the computer running Compose, with MCP pointed at the vault (`http://127.0.0.1:8787/mcp`).

Call `bootstrap` first. Follow the spine (`area → project → goal → habit | task`). Identity is UUID. If you already have a UUID, call `get`. Destructive tools need `confirm: true`. Type/relation writes apply immediately; safety is `list_activity` + `undo`.

### Librarian (from day one)

Created at init — one extra agent is the pack, not ceremony.

Typical host: the computer that hosts Compose (needs git, docker compose, `GET /health`, and usually the vault MCP).

Owns:

1. **Vault health** — weekdays, morning local. Instance ops. Quiet if green. [`VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`prompts/vault-health.md`](../prompts/vault-health.md)
2. **Graph hygiene** — weekly. Duplicate titles, zero-edge nodes, type soup. Report only unless the operator asked to repair in that conversation. [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md)
3. **Update the computer** — weekdays, late morning local. `git fetch` / `git pull --ff-only` on main, `docker compose up --build -d`, wait for `/health`. Quiet if already up to date. After a real pull of `origin/main`, an optional agent that reads git (no vault key) runs [`prompts/repo-leak-scan.md`](../prompts/repo-leak-scan.md) (report-only; quiet if clean). Monday backup: run that scan if nothing was pulled that week. [`prompts/update-foundation.md`](../prompts/update-foundation.md)

## Seldon ↔ Librarian

Tight loop. Seldon ships product on git. Librarian applies it on the computer that hosts Compose and keeps the instance healthy. They do not share jobs.

**Seldon → Librarian** (one ping, only after a whole Foundation batch is on `main`):

- Do not ping Librarian per draft, per PR, or mid-batch. Drafts stay off the computer that hosts Compose.
- When the batch is on `main`, send **one message**: PR numbers + SHAs. That ping means: product landed; apply it (git-pull onto the computer that hosts Compose). Vault health and graph hygiene stay Librarian’s scheduled routines on the new code — Seldon does not run them and does not ping for each one.
- Librarian then `git fetch` / `git pull --ff-only` on `main` and `docker compose up --build -d`, wait for `/health`. **Never** `docker compose down -v`. **Never** delete `FOUNDATION_DATA`.
- The weekday late-morning update routine is the backup if Seldon did not ping.

**Librarian → Seldon:**

- Product bugs and enhancements (wrong search, tool errors, docs vs the running vault) go to **Seldon**.
- Librarian does **not** patch the repo. No drive-by PRs, no force-push, no history rewrite.

## Constraints (all roles)

- **No write-ACL / default-deny.** The API key is the gate.
- **No email.** Failure pings stay in the operator’s chat. Healthy runs stay quiet.
- **Reachability.** An agent that can reach the vault MCP may read/write; one that cannot does not get the API key and does not upsert. Seldon works on git; Chief writes the graph; Librarian maintains the vault on the computer that hosts Compose.
- **No new MCP tools** for health, reorganize, or `audit_links`. No `get_vault_health`.
- **Do not wipe the vault.** No `docker compose down -v`, no deleting `FOUNDATION_DATA`.
- **Do not assume a live graph.** A fresh compose with seed types and zero user nodes is a valid vault.
- **Do not call the graph “the Vault.”**
- **Git is the product.** Do not commit personal life data, documents, or secrets to this repository. Those belong in the operator’s vault, not in git. After pulling product updates, an optional agent that reads git (no vault key) scans the tree and recent diffs for secrets and personal data. Report-only; quiet if clean. Do not put vault contents, `FOUNDATION_DATA` files, or graph dumps in pull requests.

## Stand-up (copy-paste)

Prereq: README install through `docker compose up` and MCP config. `GET http://127.0.0.1:8787/health` returns `{ "ok": true, "service": "foundation", "db": "up" }`.

Paste the prompt files as agent descriptions. Do not invent a thirteenth MCP tool.

### 1. Seldon (architect)

Create an agent with GitHub on this repo. Paste [`prompts/architect.md`](../prompts/architect.md).

Do **not** give it the vault API key unless that same agent can actually call the vault MCP.

### 2. Chief (writer)

Create an agent on the computer running Compose, with MCP server `foundation` pointed at the vault:

```json
{
  "mcpServers": {
    "foundation": {
      "url": "http://127.0.0.1:8787/mcp",
      "headers": {
        "Authorization": "ApiKey YOUR_KEY"
      }
    }
  }
}
```

Paste [`prompts/chief.md`](../prompts/chief.md).

### 3. Librarian (from day one)

Create an agent on the computer that hosts Compose (git + Docker + `GET /health`; MCP `foundation` at `http://127.0.0.1:8787/mcp` the same as Chief). Paste [`prompts/librarian.md`](../prompts/librarian.md).

Then attach **three routines**. Fill in the operator config blocks (data dir, optional well-known nodes, optional backup path, clone path).

#### 3a. Vault health — weekdays, morning local

If healthy: stay silent. If failed: ping. Paste [`prompts/vault-health.md`](../prompts/vault-health.md). Read [`VAULT_HEALTH.md`](./VAULT_HEALTH.md) once so “healthy” is not improvised.

#### 3b. Graph hygiene — weekly

If green: stay silent. If you found something: ping (report only). Paste [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md). Read [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md).

#### 3c. Update the computer — weekdays, late morning local

If already up to date and `/health` is green: stay silent (except the Monday leak-scan backup). Paste [`prompts/update-foundation.md`](../prompts/update-foundation.md). After a real pull, an optional agent that reads git (no vault key) runs [`prompts/repo-leak-scan.md`](../prompts/repo-leak-scan.md).

## Where prompts live

| File | Paste into |
| --- | --- |
| [`prompts/architect.md`](../prompts/architect.md) | Seldon (architect) agent description |
| [`prompts/chief.md`](../prompts/chief.md) | Chief (writer) agent description |
| [`prompts/librarian.md`](../prompts/librarian.md) | Librarian agent description (create at init) |
| [`prompts/vault-health.md`](../prompts/vault-health.md) | Weekday morning vault-health routine |
| [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md) | Weekly graph-hygiene routine |
| [`prompts/update-foundation.md`](../prompts/update-foundation.md) | Weekday late-morning update-the-computer routine |
| [`prompts/repo-leak-scan.md`](../prompts/repo-leak-scan.md) | Optional agent after a pull (reads git, no vault key): secrets / personal data scan |
