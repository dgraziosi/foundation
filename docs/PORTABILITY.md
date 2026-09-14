# Portability

Take a one-shot snapshot of a running vault, or bring notes and tasks in from another export. This is a host job. It is not an MCP tool and not a Viewer setting.

The graph stays the one store. There is no standing sync to a markdown folder, iCloud, or a second database.

## Export

The vault must already be up (`GET /health` green). From the clone root:

```bash
./scripts/foundation-export.sh --out ./snapshot
```

`FOUNDATION_API_KEY` comes from the environment, else this verify run’s key file, else the clone `.env`. The script does not print the key.

One run writes three formats under the directory you name:

| Path | What it holds |
| --- | --- |
| `foundation.json` | Live nodes and live edges (ids, types, titles, status, payload/data, relation_type + endpoints). Ontology inventory is read-only context. |
| `markdown/<type-slug>/*.md` | One Markdown file per live record. Title is the heading. Inline markdown is the body. Declared scalar `data` fields are YAML frontmatter. Blob payloads keep `blob_id` / path metadata only. |
| `csv/<type-slug>.csv` | One CSV per type that has live records. Columns are `id`, `title`, `status`, `updated_at`, then that type’s declared scalar fields. |

Choose formats with `--format json,markdown,csv` (any subset). Default is all three.

Export reads live records only. Soft-deleted records stay out. Search pages at 100 hits per type.

This snapshot is for you to keep or re-read. It is not a second vault.

## Import

```bash
./scripts/foundation-import.sh --from obsidian --source ./notes
./scripts/foundation-import.sh --from notion --source ./notion-export.zip
./scripts/foundation-import.sh --from apple-notes --source ./apple-notes
./scripts/foundation-import.sh --from google-tasks --source ./tasks.json
```

`--from` is one of `obsidian`, `notion`, `apple-notes`, `google-tasks`. `--source` is a folder, zip, JSON file, or CSV.

What lands on the graph (honest v1, not a perfect clone):

| Adapter | Source | Becomes |
| --- | --- | --- |
| Obsidian | Folder of `.md` files, optional YAML frontmatter | `note`, or `journal` when the filename is a `YYYY-MM-DD` daily note. Title + body. Frontmatter scalars go on `data`. |
| Notion | Markdown or HTML export folder or zip | `note` (title + body). Database schema fidelity stays out. |
| Apple Notes | Exported notes folder (Markdown or HTML) | `note` (title + body). |
| Google Tasks | Tasks JSON or CSV | `task` with title, optional `due` (`YYYY-MM-DD`), status `active` or `completed`. |

`--dry-run` calls MCP `upsert` with `dry_run: true` and writes nothing.

Creates add to the vault. They do not wipe what is already there. They do not delete records.

A re-run of the same file uses the same `idempotency_key` (`imp:<adapter>:<hash>`). The vault returns the existing record instead of a twin. `data.import_ref` stores `adapter:source` as an extra scalar. It is not `url`, `repo`, or `receipt`.

The writer is the authenticated import key (a bot), not `user`. Import calls existing MCP `upsert` over HTTP. `tools/list` stays 16. There is no export or import tool.

## Out of scope

- A new MCP tool, Viewer settings, onboarding, or capture chrome
- Continuous dual-write to a markdown vault
- Bank or card import, a second ledger
- Embeddings, SSE, memory, multi-tenant
