# Graph drift

On-demand, report-only look at the **graph** in this vault. Prints five buckets. Not vault health. Not an MCP tool.

## Glossary

Same locked terms as [`VAULT_HEALTH.md`](./VAULT_HEALTH.md): Foundation = the product; vault = one instance (`FOUNDATION_DATA` + Postgres); graph = the knowledge in that vault; blob = a file on a node; agent = anything that can reach the vault MCP; user = the human who runs this vault on this machine. Do **not** call the graph “the Vault.”

The user can run this report. Skill: [`.agents/skills/drift-read/`](../.agents/skills/drift-read/). Host script: [`scripts/drift-read.sh`](../scripts/drift-read.sh).

## What it is

A **maintenance pass**. `@drift read:` (or the script) reports:

- Missing needed
- Zero-edge nodes
- Dangling refs
- Retired keys
- Duplicate titles

It always prints those five buckets. Empty arrays are a clean or first-day vault (`drift-read: quiet` on stderr). It does **not** mutate. Still not a new MCP tool.

Do not add `get_vault_health`, `run_maintenance`, `propose_reorganize`, `audit_links`, or `cleanup_dangling_links`. Do not add `list_nodes`.

## What it is not

- **Not vault health.** Process, `FOUNDATION_DATA`, canaries, and backup freshness are [`VAULT_HEALTH.md`](./VAULT_HEALTH.md).
- **Not weekly graph hygiene.** Type soup and the quiet weekly ping stay [`GRAPH_HYGIENE.md`](./GRAPH_HYGIENE.md). This pass is the five-bucket command.
- **Not Dream.** Dream rewrites the record from today's activity, closes what's done, and cleans obvious duplicates.
- **Not a mutation pass.** No `upsert` / `delete` / `unlink` / `undo` / `manage_type` on this run.
- **Not a SQL graph scan.** Page MCP. There is no `list_nodes` tool.

A first-day vault (seed types, zero user records) is **quiet**.

## How to run

From the clone, with `/health` green and a key that can read MCP:

```bash
./scripts/drift-read.sh
```

`FOUNDATION_API_KEY` comes from the environment, else this verify run’s key file, else the clone `.env`. The script does not print the key.

Stdout is JSON with the five buckets. Stderr says `drift-read: quiet` when every bucket is empty.

## Buckets (report only)

The script calls `inspect_ontology`, pages `search` `{ type }` until `next` is omitted, then `get` each id. Classifier: [`scripts/drift-read.py`](../scripts/drift-read.py).

### 1. Missing needed

A field with `needed: true` is absent, `null`, or `""`. Needed is a hint, not a write block. Seed `spend` needs amount, currency, and stage.

### 2. Zero-edge nodes

Live records whose `get` edges list is empty. Live edges only: both ends must be live.

### 3. Dangling refs

A **declared** `ref` field whose value is not a live record id. Extra `data` keys that hold a UUID do not count. After the retype/delete refuse, MCP writes cannot plant this leftover; a throwaway proof may plant it on the disposable vault, then this pass still reports it.

### 4. Retired keys

Leftover identity bags still present on `data`. They are not vault keys. The next `upsert` migrates a well-formed leftover into url or repo and strips the leftover key. This pass only names the record and the leftover key names.

### 5. Duplicate titles

Live records that share a title (case-insensitive). Report id, type, title. Do not merge.

## How to check (existing surface)

| Check | Use |
| --- | --- |
| Types and field templates | `inspect_ontology` |
| Live list by type | `search` `{ type }`, follow `next` |
| `data` and live edges | `get` |
| Full drift report | `scripts/drift-read.sh` |

`list_activity` is not required for these buckets.

## Failure / findings

List what you found with enough ids and titles for the user to decide. Smallest next look. Not a silent rewrite. If they ask to repair in this conversation, then you may mutate; destructive tools need a key with destructive scope.
