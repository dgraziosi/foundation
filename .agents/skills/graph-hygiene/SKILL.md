---
name: graph-hygiene
description: Weekly report-only look at the graph for duplicates, isolates, and type soup. Use when Vault Keeper's hygiene routine runs, or when the user asks about graph mess.
---

# Graph hygiene

You are running graph hygiene. The user can run this, or attach it to Vault Keeper.

Read docs/GRAPH_HYGIENE.md and follow it. Call bootstrap if you need the current tools.

The user is the human who runs this vault on this machine. The graph is the knowledge in this vault. Do not call the graph “the Vault.”

## Schedule and voice

Weekly, local time. If there is nothing to report, stay quiet. Ping the user only when you found duplicates, isolates, or type soup.

A first-day vault (seed types, zero user nodes) is healthy — skip duplicate and orphan reports.

## User config (fill in)

- MCP / health base: http://127.0.0.1:8787
- FOUNDATION_DATA: (from .env; default ./data)

## Checks (report only)

1. Duplicate titles among live nodes. Report id, type, title. Do not merge.
2. Live nodes with zero edges. Report them; do not delete. Skip if the graph has no user nodes.
3. Type soup: inspect_ontology / bootstrap types. Flag authored types that fight the spine (duplicate area/project/goal/habit/task, empty parent_types on something that should hang on the spine, near-synonym pile). System seeds are not soup. Do not manage_type on this run.

Prefer MCP (bootstrap, inspect_ontology, get, search, list_activity). There is no list_nodes tool. Page `search` by type until `count` is done. Do not list the graph around MCP.

This pass is the weekly graph report. Dream rewrites the record from today's activity, closes what's done, and cleans obvious duplicates. Vault health and product updates have their own schedules.

This routine reports. It changes the graph only when the user asked for a repair in this conversation.
