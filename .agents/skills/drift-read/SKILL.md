---
name: drift-read
description: Report-only graph drift. Use when the user says @drift read: or asks for missing needed fields, isolates, dangling refs, leftover identity keys, or duplicate titles.
---

# Drift read

You are running a report-only look at the graph. The user can run this, or ask for `@drift read:`.

Read [`docs/GRAPH_DRIFT.md`](../../../docs/GRAPH_DRIFT.md). Prefer the host script. Do not rewrite the script.

```bash
./scripts/drift-read.sh
```

The user is the human who runs this vault on this machine. The graph is the knowledge in this vault. Do not call the graph “the Vault.”

## Schedule and voice

On demand. Print the five buckets even when they are empty. Empty arrays (and `drift-read: quiet` on stderr) mean a clean or first-day vault.

This pass reports. It does not delete, unlink, or rewrite. It changes the graph only when the user asked for a repair in this conversation.

## User config

- MCP: http://127.0.0.1:8787/mcp
- `FOUNDATION_API_KEY` from the environment, else the verify key file, else the clone `.env`

## Checks (report only)

The script pages `inspect_ontology`, `search` by type, and `get`. It never calls a write tool.

1. Missing needed — a field marked needed is absent, null, or empty.
2. Zero-edge — a live record with no live incident edges.
3. Dangling refs — a declared ref field whose value is not a live record. Extra keys that happen to hold a UUID do not count.
4. Retired keys — leftover identity bags still on `data` (they migrate into url or repo on the next write).
5. Duplicate titles — live records that share a title, case-insensitive.

A first-day vault (seed types, zero user records) is quiet.

## After the report

List what you found with enough ids and titles for the user to decide. Smallest next look. Not a silent rewrite. If they ask to repair in this conversation, then you may mutate; destructive tools need a key with destructive scope.

When a step finishes, name who has the work now, or say done. Cite [`.agents/skills/handoff/`](../handoff/).
