# Agents around Foundation

After Compose is up, a clone **may** stand up named agents. That recipe is optional. This doc is that second half — not product ontology.

A clone can name agents this way (Asimov-flavored): **Seldon** (architect), **Chief** (graph-writer), **Librarian** (instance-keeper). Those names are the recipe, not the product. The locked public terms stay Foundation / vault / graph / blob / agent / operator.

## Glossary

Short analog: app / folder / links → Foundation / vault / graph.

- **Foundation** — the product
- **vault** — one instance (`FOUNDATION_DATA` + Postgres)
- **graph** — the knowledge in that vault
- **blob** — a file on a node
- **agent** — anything that can reach the vault MCP
- **operator** — the human who runs Compose. Only the human. Never Librarian, never Chief, never “the agent that manages the vault.”

Do not call the graph “the Vault.” Do not rename the GitHub repo or the MCP server `foundation`.

Do not commit personal life data, documents, or secrets to this repository. Those belong in the operator’s vault, not in git.

Vault health, graph hygiene, and applying product updates are **instance routines** (also: vault routines). The operator can run them, or attach them to an instance-keeper agent. They are not MCP tools, and they do not make that agent the operator.

**Reachability.** An agent that can reach the vault MCP (`http://127.0.0.1:8787/mcp` on the host running Compose) may read/write the graph. An agent that cannot reach that MCP does not get the API key and does not upsert.

If you use this recipe, after Compose is up ([README](../README.md)) the operator pastes three agents:

1. **Seldon** (architect) — [`prompts/architect.md`](../prompts/architect.md)
2. **Chief** (graph-writer; optional but recommended) — [`prompts/chief.md`](../prompts/chief.md)
3. **Librarian** (instance-keeper) — [`prompts/librarian.md`](../prompts/librarian.md), then attach the three instance routines below

Checks live in [`VAULT_HEALTH.md`](./VAULT_HEALTH.md) and [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md). Routine prompts are intent, not a substitute for those checks.

## Optional named agents

### Seldon (architect)

Owns **product** work on this GitHub repo: SPEC, docs, git.

Does **not** own day-to-day graph writes. Those belong to Chief on a host that can reach the vault MCP.

Does **not** apply product updates on the host running Compose, and does **not** run vault health or graph hygiene. Those instance routines are Librarian’s (or the operator’s, if they run them by hand).

Typical host: an agent with GitHub on this repo. Do not give it the vault API key unless that same agent can actually call the vault MCP.

### Chief (graph-writer)

The operator dumps messy ideas. This agent decides what becomes a node (or an update, a link, or nothing) and writes the graph.

Typical host: an agent on the host running Compose, with MCP pointed at the vault (`http://127.0.0.1:8787/mcp`).

Call `bootstrap` first. Prefer the spine (`area → project → goal → habit | task`); it is a framework, not a hard gate — `task` may `child_of` `project`. Identity is UUID. If you already have a UUID, call `get`. Destructive tools need `confirm: true`. Type/relation writes apply immediately; safety is `list_activity` + `undo`.

### Librarian (instance-keeper)

If you use this recipe, create Librarian when you stand up the vault. Librarian is an agent, not the operator.

Typical host: the host running Compose (needs git, docker compose, `GET /health`, and usually the vault MCP).

Owns these **instance routines**:

1. **Vault health** — weekdays, morning local. Instance ops. Quiet if green. [`VAULT_HEALTH.md`](./VAULT_HEALTH.md), [`prompts/vault-health.md`](../prompts/vault-health.md)
2. **Graph hygiene** — weekly. Duplicate titles, zero-edge nodes, type soup. Report only unless the operator asked to repair in that conversation. [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md), [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md)
3. **Apply product updates** — weekdays, late morning local. On the host running Compose: `git fetch` / `git pull --ff-only` on main, `docker compose up --build -d`, wait for `/health`. Quiet if already up to date. After a real pull of `origin/main`, an optional agent that reads git (no vault key) runs [`prompts/repo-leak-scan.md`](../prompts/repo-leak-scan.md) (report-only; quiet if clean). Monday backup: run that scan if nothing was pulled that week. [`prompts/update-foundation.md`](../prompts/update-foundation.md)

When Librarian applies: `git fetch` / `git pull --ff-only` on `main` and `docker compose up --build -d`, wait for `/health`. **Never** `docker compose down -v`. **Never** delete `FOUNDATION_DATA`. Never `git pull --force`. Vault health and graph hygiene stay Librarian’s scheduled instance routines on the new code.

Product bugs and enhancements (wrong search, tool errors, docs vs the running vault) go to Seldon. Librarian does **not** patch the repo.

## Constraints (all roles)

- **No write-ACL / default-deny.** The API key is the gate.
- **No email.** Failure pings stay in the operator’s chat. Healthy runs stay quiet.
- **Reachability.** An agent that can reach the vault MCP may read/write; one that cannot does not get the API key and does not upsert. In this recipe: Seldon works on git; Chief writes the graph; Librarian maintains the vault on the host running Compose. The operator is still the human.
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

### 2. Chief (graph-writer)

Create an agent on the host running Compose, with MCP server `foundation` pointed at the vault:

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

### 3. Librarian (instance-keeper)

Create an agent on the host running Compose (git + Docker + `GET /health`; MCP `foundation` at `http://127.0.0.1:8787/mcp` the same as Chief). Paste [`prompts/librarian.md`](../prompts/librarian.md).

Then attach **three instance routines**. Fill in the operator config blocks (data dir, optional well-known nodes, optional backup path, clone path). Those blocks are for the human; Librarian is not the operator.

#### 3a. Vault health — weekdays, morning local

If healthy: stay silent. If failed: ping. Paste [`prompts/vault-health.md`](../prompts/vault-health.md). Read [`VAULT_HEALTH.md`](./VAULT_HEALTH.md) once so “healthy” is not improvised.

#### 3b. Graph hygiene — weekly

If green: stay silent. If you found something: ping (report only). Paste [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md). Read [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md).

#### 3c. Apply product updates — weekdays, late morning local

If already up to date and `/health` is green: stay silent (except the Monday leak-scan backup). Paste [`prompts/update-foundation.md`](../prompts/update-foundation.md). After a real pull, an optional agent that reads git (no vault key) runs [`prompts/repo-leak-scan.md`](../prompts/repo-leak-scan.md).

## Where prompts live

| File | Paste into |
| --- | --- |
| [`prompts/architect.md`](../prompts/architect.md) | Seldon (architect) agent description |
| [`prompts/chief.md`](../prompts/chief.md) | Chief (graph-writer) agent description |
| [`prompts/librarian.md`](../prompts/librarian.md) | Librarian (instance-keeper) agent description |
| [`prompts/vault-health.md`](../prompts/vault-health.md) | Weekday morning vault-health instance routine |
| [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md) | Weekly graph-hygiene instance routine |
| [`prompts/update-foundation.md`](../prompts/update-foundation.md) | Weekday late-morning apply-product-updates instance routine |
| [`prompts/repo-leak-scan.md`](../prompts/repo-leak-scan.md) | Optional agent after a pull (reads git, no vault key): secrets / personal data scan |
