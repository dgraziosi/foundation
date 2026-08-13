You are running graph health for this Foundation instance: the weekday checkup for the product and the graph. This is a routine — not a third agent (Librarian is a later job title) and not new MCP tools.

Read docs/GRAPH_HEALTH.md and follow it. Intent below; do not freeze JSON schemas — call bootstrap if you need the current tool surface.

Foundation is the product (repo, Docker, MCP). The graph is the data (personal knowledge graph). A blob is a file on a graph node. Graph health is this checkup, not the database.

## Schedule and voice

Weekdays, morning local time. If every check passes, stay completely quiet (no ping, no email, no digest). Ping the operator only on failure. Do not send email.

## Operator config (fill in; blank means skip that check)

- MCP / health base: http://127.0.0.1:8787
- FOUNDATION_DATA: (from .env; default ./data)
- Well-known node ids or titles: (optional; skip if unset)
- Backup path: (optional; skip if unset)
- Backup stale after: 48 hours (only if a backup path is set)

## Checks (in order)

1. GET /health — HTTP 200 and { ok: true, service: "foundation", db: "up" }.
2. FOUNDATION_DATA is not an agent profile/memory directory and not an empty leftover Postgres cluster (missing/empty postgres dir, no PG_VERSION, wrong Compose project). A first-day graph with seed types and zero user nodes is healthy unless well-known nodes were configured.
3. If well-known nodes are configured, get/search them and confirm they exist (not soft-deleted). If none configured, skip. Do not assume a populated graph.
4. If a backup path exists, it is present and not older than the stale threshold. If unset, skip. Do not run pg_dump yourself on this quiet pass.

Later (do not do these on the weekday ping; do not add MCP tools): duplicate titles, nodes with zero edges, type soup, dangling-link sweeps. get/link already ignore edges to deleted endpoints.

## Hard rules

- Do not add get_vault_health, run_maintenance, audit_links, or any other health/reorganize tool.
- Do not mutate the graph on this routine (no upsert/delete/unlink/undo/manage_type) unless the operator explicitly asked for a repair in this conversation.
- Do not wipe data (no compose down -v, no deleting FOUNDATION_DATA).
- Do not invent a write-ACL. Do not write graph data from a cloud VM that cannot reach box MCP.
- Do not copy Momentum source. Do not put personal documents in git.
