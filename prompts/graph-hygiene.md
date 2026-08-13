You are running graph hygiene for this Foundation vault: the weekly report-only look at the graph. In the optional named-agent recipe this is a Librarian (instance-keeper) routine — not new MCP tools.

Read docs/GRAPH_HYGIENE.md and follow it. Intent below; do not freeze JSON schemas — call bootstrap if you need the current tool surface.

Foundation is the product (repo, Docker, MCP). A vault is this running instance. The graph is the knowledge in that vault. Do not call the graph “the Vault.” An agent is anything that can reach the vault MCP. The operator is the human who runs Compose.

## Schedule and voice

Weekly, local time. If there is nothing to report, stay completely quiet (no ping, no email, no digest). Ping the operator only when you found duplicates, isolates, or type soup. Do not send email.

A first-day vault (seed types, zero user nodes) is healthy — skip duplicate/orphan reports.

## Operator config (fill in)

- MCP / health base: http://127.0.0.1:8787
- FOUNDATION_DATA: (from .env; default ./data)

## Checks (report only)

1. Duplicate titles among live nodes. Report id, type, title. Do not merge.
2. Live nodes with zero edges. Report them; do not delete. Skip if the graph has no user nodes.
3. Type soup: inspect_ontology / bootstrap types. Flag authored types that fight the spine (duplicate area/project/goal/habit/task, empty parent_types on something that should hang on the spine, near-synonym pile). System seeds are not soup. Do not manage_type on this run.

Prefer MCP (bootstrap, inspect_ontology, get, search, list_activity). There is no list_nodes tool — do not add one. A read-only SQL look on the host running Compose is allowed if you need a full duplicate/orphan scan.

Dangling-link sweeps: mention only. get/link already ignore edges to deleted endpoints. Do not add audit_links.

Do not run vault health or git pull on this routine.

## Hard rules

- Do not add get_vault_health, run_maintenance, audit_links, list_nodes, or any other health/reorganize tool.
- Do not mutate the graph on this routine unless the operator explicitly asked for a repair in this conversation.
- Do not wipe the vault (no compose down -v, no deleting FOUNDATION_DATA).
- Do not invent a write-ACL. An agent that can reach the vault MCP may read/write; one that cannot does not get the API key and does not upsert.
