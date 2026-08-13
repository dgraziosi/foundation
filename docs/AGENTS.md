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

After Compose is up ([README](../README.md)), a new operator does three pastes:

1. **Seldon** (architect) — [`prompts/architect.md`](../prompts/architect.md)
2. **Chief** (writer; optional but recommended) — [`prompts/chief.md`](../prompts/chief.md)
3. **Librarian** (created at init) — [`prompts/librarian.md`](../prompts/librarian.md), then attach the three routines below

Checks live in [`VAULT_HEALTH.md`](./VAULT_HEALTH.md) and [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md). Routine prompts are intent, not a substitute for those checks.

## Roles

### Seldon (architect)

Owns **product** work on this GitHub repo: SPEC, cloud agents, the merge bar.

Does **not** own day-to-day graph writes. Those belong to Chief on a machine that can reach box MCP.

Does **not** apply git updates to the computer that hosts the vault. That is Librarian.

Typical host: Cursor cloud agent on this repo (or your fork) — **not** a VM that pretends it can `upsert` to `127.0.0.1` on someone else’s box.

### Chief (writer)

The human dumps messy ideas. This agent decides what becomes a node (or an update, a link, or nothing) and writes the graph.

Typical host: the same computer that runs Compose, with MCP `foundation` at `http://127.0.0.1:8787/mcp`.

Call `bootstrap` first. Follow the spine (`area → project → goal → habit | task`). Identity is UUID. If you already have a UUID, call `get`. Destructive tools need `confirm: true`. Type/relation writes apply immediately; safety is `list_activity` + `undo`.

### Librarian (from day one)

Created at init — one extra agent is the pack, not ceremony.

Typical host: the computer that hosts Compose (needs git, docker compose, `GET /health`, and usually box MCP).

Owns:

1. **Vault health** — weekdays, morning local. Instance ops. Quiet if green. [`VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`prompts/vault-health.md`](../prompts/vault-health.md)
2. **Graph hygiene** — weekly. Duplicate titles, zero-edge nodes, type soup. Report only unless the operator asked to repair in that conversation. [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md)
3. **Update the computer** — weekdays, late morning local. `git fetch` / `git pull --ff-only` on main, `docker compose up --build -d`, wait for `/health`. Quiet if already up to date. After a real pull of `origin/main`, launch a Cursor cloud agent with [`prompts/repo-leak-scan.md`](../prompts/repo-leak-scan.md) (report-only; quiet if clean). Monday backup: launch that scan if nothing was pulled that week. [`prompts/update-foundation.md`](../prompts/update-foundation.md)

## Seldon ↔ Librarian

Seldon ships product on git. Librarian applies those commits on the box.

- **Seldon pings Librarian only after a whole batch is on main** — one ping, with PR numbers and SHAs. Not per draft. Drafts stay off the box.
- Librarian then `git fetch` / `git pull --ff-only` on main and `docker compose up --build -d`, wait for `/health`. Never `compose down -v`. Never delete `FOUNDATION_DATA`.
- The weekday late-morning update routine is the backup if Seldon did not ping.
- Product bugs Librarian finds (wrong search, tool errors, docs vs box) go to **Seldon**. Librarian does not patch the repo.

## Constraints (all roles)

- **No write-ACL / default-deny.** The API key is the gate.
- **No email.** Failure pings stay in Grok Bot / Cursor. Healthy runs stay quiet.
- **Cloud agents must not write graph data** from VMs that cannot reach box MCP. Seldon works on git; Chief writes the graph; Librarian maintains the vault on the box.
- **No new MCP tools** for health, reorganize, or `audit_links`. No `get_vault_health`.
- **Do not wipe the vault.** No `docker compose down -v`, no deleting `FOUNDATION_DATA`.
- **Do not assume a live graph.** A fresh compose with seed types and zero user nodes is a valid vault.
- **Do not call the graph “the Vault.”**
- **Git is the product.** Do not commit personal life data, documents, or secrets to this repository. Those belong in the operator’s vault, not in git. After pulling product updates, Librarian launches a cloud agent to scan the tree and recent diffs for secrets and personal data. Report-only; quiet if clean. Seldon / cloud agents must not put vault contents, `FOUNDATION_DATA` files, or graph dumps in pull requests.

## Stand-up (copy-paste)

Prereq: README install through `docker compose up` and MCP config. `GET http://127.0.0.1:8787/health` returns `{ "ok": true, "service": "foundation", "db": "up" }`.

Paste the prompt files as agent descriptions. Do not invent a thirteenth MCP tool.

### 1. Seldon (architect)

Create a Cursor cloud agent (or Grok Bot agent) on this repo. Paste [`prompts/architect.md`](../prompts/architect.md).

Give it GitHub on this repo. Do **not** give it a Foundation API key unless it can actually call box MCP (almost never true for cloud VMs).

### 2. Chief (writer)

Create a **local** agent (Grok Bot computer or Cursor on the box) with MCP server `foundation`:

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

Create a **local** agent on the computer that hosts Compose (git + Docker + `GET /health`; MCP `foundation` at `http://127.0.0.1:8787/mcp` the same as Chief). Paste [`prompts/librarian.md`](../prompts/librarian.md).

Then attach **three routines**. Fill in the operator config blocks (data dir, optional well-known nodes, optional backup path, clone path).

#### 3a. Vault health — weekdays, morning local

If healthy: stay silent. If failed: ping. Paste [`prompts/vault-health.md`](../prompts/vault-health.md). Read [`VAULT_HEALTH.md`](./VAULT_HEALTH.md) once so “healthy” is not improvised.

#### 3b. Graph hygiene — weekly

If green: stay silent. If you found something: ping (report only). Paste [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md). Read [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md).

#### 3c. Update the computer — weekdays, late morning local

If already up to date and `/health` is green: stay silent (except the Monday leak-scan backup). Paste [`prompts/update-foundation.md`](../prompts/update-foundation.md). After a real pull, launch a cloud agent with [`prompts/repo-leak-scan.md`](../prompts/repo-leak-scan.md).

## Where prompts live

| File | Paste into |
| --- | --- |
| [`prompts/architect.md`](../prompts/architect.md) | Seldon (architect) agent description |
| [`prompts/chief.md`](../prompts/chief.md) | Chief (writer) agent description |
| [`prompts/librarian.md`](../prompts/librarian.md) | Librarian agent description (create at init) |
| [`prompts/vault-health.md`](../prompts/vault-health.md) | Weekday morning vault-health routine |
| [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md) | Weekly graph-hygiene routine |
| [`prompts/update-foundation.md`](../prompts/update-foundation.md) | Weekday late-morning update-the-computer routine |
| [`prompts/repo-leak-scan.md`](../prompts/repo-leak-scan.md) | Cloud agent after a pull (and Monday backup): secrets / personal data scan |
