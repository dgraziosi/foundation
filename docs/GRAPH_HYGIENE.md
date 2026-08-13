# Graph hygiene

Weekly, report-only look at the **graph** in this vault. Quiet if green. Not vault health. Not an MCP tool.

## Glossary

Same locked terms as [`VAULT_HEALTH.md`](./VAULT_HEALTH.md): Foundation = product; vault = this instance (`FOUNDATION_DATA` + Postgres); graph = the knowledge in that vault; blob = file on a node; Librarian = day-one agent. Do **not** call the graph “the Vault.”

Stand-up: [`AGENTS.md`](./AGENTS.md). Agent: [`prompts/librarian.md`](../prompts/librarian.md). Paste: [`prompts/graph-hygiene.md`](../prompts/graph-hygiene.md).

## What it is

A **quiet Librarian routine** (weekly, local time). It reports:

- Duplicate titles
- Nodes with zero edges
- Type soup (authored types that fight the spine)

When everything is fine, it stays silent. It pings the operator **only when it found something**. It does **not** mutate unless the operator asked for a repair **in that conversation**. Still not a new MCP tool.

Do not add `get_vault_health`, `run_maintenance`, `propose_reorganize`, `audit_links`, or `cleanup_dangling_links`. Do not add `list_nodes`.

## What it is not

- **Not vault health.** Process, `FOUNDATION_DATA`, canaries, and backup freshness are [`VAULT_HEALTH.md`](./VAULT_HEALTH.md).
- **Not update-the-computer.** Git pull + compose rebuild is [`prompts/update-foundation.md`](../prompts/update-foundation.md).
- **Not a mutation pass.** No `upsert` / `delete` / `unlink` / `undo` / `manage_type` on the quiet run.
- **Not email.** No digest. Ping only when there is something to report.
- **Not a write-ACL.** The API key is the gate.
- **Reachability.** Run from Librarian on the computer that can reach the vault MCP.

A first-day vault (seed types, zero user nodes) is **healthy**. Zero user nodes is not “type soup” and not a pile of orphans. Skip duplicate/orphan reports when there is nothing to scan.

## Weekly checks (report only)

Intent only — call `bootstrap` if you need the current tool surface. Prefer MCP. A read-only SQL look via `docker compose exec` on the computer that hosts Compose is allowed when MCP cannot enumerate the whole graph (there is no `list_nodes` tool). Do not add one. `search` can list by `type` / `status` / `under` without a query (limit 100); that is a sample, not a full dump.

### 1. Duplicate titles

Live nodes (`deleted_at` is null) that share the same title (case-insensitive is enough). Report id, type, title. Do not merge them.

If you cannot scan (no SQL), use `search` with type filters (no query) as a sample, say so, and stop a full-graph check — do not invent a tool.

### 2. Nodes with zero edges

Live nodes with no incident edges. Seed-only / empty graph: skip. Person/note/trip with no links yet can be real; report them, don’t delete them.

`get` returns incident edges for a node you already know. For a full pass, read-only SQL on the computer that hosts Compose is OK.

### 3. Type soup

`inspect_ontology` (or `bootstrap` types). Flag authored types that fight the spine: duplicate the job of `area` / `project` / `goal` / `habit` / `task`, empty `parent_types` on something that should hang on the spine, or a growing pile of near-synonyms. System seeds are not soup.

Report slug, kind, parent_types. Do not `manage_type` on this routine.

### Mention only (do not tool)

`get` / `link` already ignore edges whose endpoints are deleted. A future pass can look at orphans. Not `audit_links` / `cleanup_dangling_links` on the wire.

## How to check (existing surface)

| Check | Use |
| --- | --- |
| Types vs spine | `bootstrap` / `inspect_ontology` |
| A known node’s edges | `get` |
| Title recall or list by type/status/under | `search` (query optional when a filter is set; not a dump of the whole graph) |
| Full duplicate / zero-edge scan | Read-only SQL on the computer that hosts Compose, if needed |
| Recent writes (context, not a fail) | `list_activity` |

## Failure / findings ping

List what you found (duplicates, isolates, soup) with enough ids/titles for the operator to decide. Smallest next look — not a silent rewrite. If they ask to repair in this conversation, then you may mutate with the usual confirm gates. Do not email. Do not wipe the vault.
