# Foundation redesign map

Decision document for Danny / Chief. Product contract: [`docs/SPEC.md`](./SPEC.md). This map is what to build **instead of cloning Momentum**.

Studied: [`dgraziosi/Momentum-React-Native`](https://github.com/dgraziosi/Momentum-React-Native) branch **`replit-agent`** (not stale `main`), especially `lib/shared-types/src/schema/{notes,hierarchy,ontology,templates,habits}.ts`, `artifacts/api-server/src/tools/*`, `artifacts/api-server/src/auth/mcp.ts`, `artifacts/api-server/src/services/link-validator.ts`, `artifacts/api-server/src/db/{note-types,relation-types,vault-activity}.ts`. Ideas extracted; **no Momentum source trees copied into this repo**.

---

## 1. What Momentum got right (keep the idea)

These are kernel ideas, not product features. Keep the *shape*; rewrite the *code*.

| Idea | Why it matters for Foundation |
| --- | --- |
| **Typed graph, not a notes dump** | Nodes have a type; edges have a relation type. Agents get structure instead of tag soup. |
| **Type + relation registries as data** | Vocabulary grows without schema migrations. System seeds + instance-authored rows. |
| **Starter spine** | Day-one vocabulary: `area → project → goal → habit \| task`. Area is the vault root (Momentum already retired `core_value` into `area`). |
| **Hierarchy vs associative edges** | Spine placement is constrained; everything else can `relates_to` / `supports` / `inspired_by` / `references` the spine without a per-type matrix explosion. |
| **Link validation with suggestions** | Self-link, duplicate, symmetry, type constraints, directionality. On failure, tell the agent the valid verbs and whether swapping source/target would work. Do **not** silently succeed as `relates_to`. |
| **Activity log + undo** | Append-only rows with `before`/`after` snapshots, `reversible`, single-use undo. This is the safety net that replaces a human approve inbox. |
| **MCP as a first-class surface** | Streamable HTTP, API key, `confirm: true` on destructive tools, zod input/output as the single source of truth (`defineTool` pattern). |
| **Postgres + a vector path** | FTS now; `pgvector` later. One store (no dual-write markdown vault). |
| **Soft delete** | Delete is reversible; restore via undo (or an explicit restore if undo TTL expired). |
| **Habit as a node type** | Frequency / tracking live on the node (`data`), not a separate product. Completions can be child nodes or `data` later — not five dedicated MCP tools in v1. |

---

## 2. What to discard (and why)

Momentum is a multi-surface consumer product (mobile + web + in-app chat + MCP + billing) that grew an ontology. Foundation is the inverse: an ontology that agents use. Discard by default.

### Product / SaaS / chat-era

- Mobile, Watch, Apple auth, RevenueCat, iCloud vault sync, push, quiet hours, notification governance
- Multi-tenant RLS, OAuth for third parties, subscription gate on MCP, per-user tool-disable catalog
- Replit hosting glue, MCP Apps HTML renderer, ChatGPT `search`/`fetch` extras
- In-app chat, check-ins / guides, feed, briefings, nudges, housekeeping schedulers, “vault keeping” autonomy
- Gamification: XP, streaks, achievements, vacation mode
- Skills inventory (`get_skill`) — agents already have their own tools; Foundation should not ship a second procedure library

### Ontology governance we explicitly do not want

- **Proposal / approve inbox** (`list_pending`, `decide_proposal`, `ontology_proposals`, `attention_events`, decline cooldowns, autonomy levels assisted/balanced/full)
- Emergence primitive that turns MCP type/relation writes into Pending cards
- Person-promotion queue, place-note, reorganize/merge/split as first-class product, structure proposals

Agents **mutate types and relations directly**. The activity log is the receipt; undo is the brake.

### Data-model accidents

- **Three places for the same edge:** `notes.parent` column + `notes.relations` JSON + `edges` table. Foundation: **edges table is the only source of truth**.
- **Permalink as agent identity.** Agents should use UUIDs. Optional human slug later; never the primary key.
- **Markdown-only `content` string.** Foundation payloads are typed (`text/markdown`, `text/html`, `application/json`, blobs).
- **Separate decaying `memories` store.** The graph *is* durable memory. No parallel STM/MTM/LTM with decay rates.
- **UI-coupled type fields:** icon, hue, color, XP, `template_schema` building blocks, `default_view` / `allowed_views` / `body_components`, folder view-types
- **Life-domain Area catalog** (`work` / `money` / `health` / … as a *type-library taxonomy* with opt-in enablement). This is a second meaning of “area” and fights the graph-root `area` type. Do not seed it. If a human later wants “Health” as a life domain, that is an **`area` node**, not a type-registry lane.
- **Giant artifact library** (account, transaction, budget, subscription, metric, measurement, occasion, course, media, place, possession, document, maintenance, recipe, workout, …). Seed a small set; agents add the rest.
- **Note `kind` column** (hierarchy vs artifact) as stored data — derive from the type registry.
- **AI enrichment columns** (`agent_analysis`, compiled summaries, `ai_added_tags`, ripple cross-references, embedding model on the note row). Search/embeddings are a later slice, not note payload.
- **Dual write to a markdown vault.** One Postgres store.

### MCP sprawl (~60 tools on the wire)

Do not port: `present_*`, `web_search`, `search_conversations`, `upload_asset` / chunked upload, `manage_vacation_mode`, `get_memories` / `add_memory`, `get_user_context` / `update_user_context`, `get_vault_health`, `suggest_parent`, `manage_view`, `propose_structure` / `manage_structure`, `place_note`, `propose_check_in` / `run_check_in`, `run_maintenance`, `propose_reorganize`, `create_person_from_mentions`, `get_skill`, habit-log pentad, `batch_update_notes`, `preview_rename`, `audit_links` / `cleanup_dangling_links` as v1 tools.

Hierarchy walk and “what’s related” fold into `get` (include incident edges) and `search` (type filter). Parent suggestion is an agent reasoning job once `bootstrap` explains the spine.

---

## 3. Proposed Foundation architecture

Single-user process on localhost / Docker. Agents are the API. Optional thin viewer later against the same HTTP API.

```text
┌─────────────────────────────────────────────────────────┐
│  MCP clients (Grok Bot, Cursor, Claude, …)              │
│  Authorization: ApiKey <token>                          │
└───────────────────────────┬─────────────────────────────┘
                            │ Streamable HTTP  /mcp
┌───────────────────────────▼─────────────────────────────┐
│  apps/server                                            │
│    MCP transport + 12 tools                             │
│    optional REST (same domain functions)                │
│    API key auth, confirm-gate on destructive tools      │
└─────────────┬───────────────────────────┬───────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────────┐   ┌───────────────────────────┐
│  packages/schema        │   │  packages/db              │
│  seeds, types,          │   │  postgres + migrations    │
│  link/hierarchy rules   │   │  nodes, edges, registries │
└─────────────────────────┘   │  activity, blobs          │
                              └─────────────┬─────────────┘
                                            ▼
                              ┌───────────────────────────┐
                              │  Postgres 16              │
                              │  pgvector installed,      │
                              │  unused until search v2   │
                              │  volume: $FOUNDATION_DATA │
                              └───────────────────────────┘
```

### Packages (v1)

| Package | Role |
| --- | --- |
| `packages/schema` | Zod types, seed ontology, hierarchy parent rules, link validator. No I/O. |
| `packages/db` | Postgres access, migrations, blob filesystem paths. |
| `apps/server` | MCP server (`@modelcontextprotocol/sdk`), HTTP, tool handlers. |

No `lib/core` color/nav/feed package. No mobile/web apps. No `shared-types` megapackage.

Monorepo: `pnpm` workspaces, TypeScript, Node 22. One `docker-compose.yml` at repo root: `db` + `foundation`.

### Runtime

- **Postgres preferred** (SPEC). SQLite is a conscious later opt-out if we drop vectors; do not start there.
- **Auth v1:** one API key from env (`FOUNDATION_API_KEY`). No OAuth, no users table required. Optional `owner_id` column defaulting to a constant for a future multi-profile split — not RLS.
- **Data isolation:** all durable files under `FOUNDATION_DATA` (compose volume). Never write into agent profile / memory directories on a Grok Bot computer.
- **Blobs:** local directory `$FOUNDATION_DATA/blobs/<uuid>` in v1. Object storage is out of scope.
- **Install:** `docker compose up`, set API key, point MCP client at `http://127.0.0.1:8787/mcp`.

### What we port as *tests*, not source

Golden cases worth re-expressing in Foundation tests (rewritten against our schema):

- Link validator: self-link, exact duplicate, symmetric duplicate, matrix miss + suggestion, directionality, `relates_to` upgrade to hierarchy when types match
- Hierarchy: `getParentType(project) === area`, lesson may hang under area, artifacts do not require a parent
- Activity: undo of create / update / link / type-create restores snapshots; second undo fails

Do **not** copy handler files, `auth/mcp.ts` session machinery, or the emergence primitive.

---

## 4. Proposed data model

### 4.1 Node

A node is the only “thing.” There is no parallel Note / Memory / Check-in object.

```text
nodes
  id            uuid PK
  type          text NOT NULL  → node_types.slug
  title         text NOT NULL
  status        text NOT NULL DEFAULT 'active'
                -- active | completed | archived  (keep small)
  payload       jsonb NOT NULL
  data          jsonb NOT NULL DEFAULT '{}'
  metadata      jsonb NOT NULL DEFAULT '{}'
  created_at    timestamptz NOT NULL
  updated_at    timestamptz NOT NULL
  deleted_at    timestamptz NULL
```

**Payload** (display / body — SPEC principle 2):

```json
{
  "media_type": "text/markdown | text/html | application/json | text/plain | …",
  "storage": "inline | blob",
  "body": "<optional inline string>",
  "blob_id": "<optional uuid>"
}
```

Example: a trip itinerary is a `trip` node with `payload.media_type = "text/html"` and inline `body`. Agents re-show the HTML; they do not round-trip it through markdown.

**`data`** is type-shaped structured fields (habit frequency, trip dates). Optional JSON Schema on the type row; v1 validates only if a schema is present.

**`metadata`** is agent/system bookkeeping (source, actor label). Not a second body.

No `permalink`, `parent`, `relations`, `content`, `habit_metadata`, `media`, `agent_analysis`, `kind`, `aliases` columns.

### 4.2 Edge

```text
edges
  id              uuid PK
  from_id         uuid NOT NULL → nodes.id
  to_id           uuid NOT NULL → nodes.id
  relation_type   text NOT NULL → relation_types.slug
  metadata        jsonb NOT NULL DEFAULT '{}'
  created_at      timestamptz NOT NULL
  UNIQUE (from_id, to_id, relation_type)
```

Hierarchy is edges, not a parent column. Spine placement uses `child_of` (source = child, target = parent). At most one `child_of` per source node (enforced). Associative edges are unbounded.

### 4.3 Type registry

```text
node_types
  slug            text PK
  label           text NOT NULL
  description     text NOT NULL DEFAULT ''
  kind            text NOT NULL  -- spine | artifact
  parent_types    text[] NOT NULL DEFAULT '{}'
                  -- allowed child_of targets; empty = no hierarchy parent
  json_schema     jsonb NULL     -- optional schema for nodes.data
  is_system       boolean NOT NULL
  created_at      timestamptz
  updated_at      timestamptz
```

System rows are the seed. Agents insert/update non-system rows immediately (and may update descriptions of system rows; they may not delete system slugs — retire by `archived` flag if we need it later).

**Starter types (seed):**

| slug | kind | parent_types | notes |
| --- | --- | --- | --- |
| `area` | spine | — | Vault root. Life domain + what you value. |
| `project` | spine | `area` | |
| `goal` | spine | `project` | |
| `habit` | spine | `goal` | `data` may hold frequency / tracking |
| `task` | spine | `goal` | |
| `lesson` | artifact | `area` | May also `child_of` a project/goal; seed parent is area |
| `person` | artifact | — | Target of `about` |
| `journal` | artifact | — | |
| `idea` | artifact | — | |
| `note` | artifact | — | Universal capture sink |
| `trip` | artifact | — | Motivating payload example (HTML itinerary) |

Agents add `meeting`, `recipe`, `decision`, … when needed. No enable/disable library matrix.

### 4.4 Relation registry

```text
relation_types
  slug                  text PK
  label                 text NOT NULL
  description           text NOT NULL DEFAULT ''
  kind                  text NOT NULL  -- hierarchy | associative
  source_types          text[] NOT NULL DEFAULT '{}'  -- empty = any
  target_types          text[] NOT NULL DEFAULT '{}'
  is_symmetric          boolean NOT NULL DEFAULT false
  semantic_parent_slug  text NULL
  is_system             boolean NOT NULL
  created_at            timestamptz
  updated_at            timestamptz
```

**Starter relations:**

| slug | kind | constraint (seed) | symmetric |
| --- | --- | --- | --- |
| `child_of` | hierarchy | source ∈ {project, goal, habit, task, lesson}; target ∈ parent_types of source | no |
| `relates_to` | associative | any → any | yes |
| `supports` | associative | any → spine | no |
| `inspired_by` | associative | any → any | no |
| `references` | associative | any → any | no |
| `about` | associative | any → `person` | no |

Drop Momentum names `serves_value`, `belongs_to_project`, `supports_goal` — they are `core_value`-era leftovers. One hierarchy verb + type-level `parent_types` is enough for agents.

`semantic_parent_slug` (keep the idea): a more specific relation may declare `relates_to` as parent so validators can warn on redundancy. v1: warn, do not block.

### 4.5 Link validation (port the concept, not the frozen matrix)

Pipeline, in order:

1. Unknown `relation_type` → error, list known slugs
2. Self-link → error
3. Exact duplicate `(from, to, relation)` → error
4. Symmetric duplicate (reverse already exists) → error
5. Registry source/target constraints
6. If `child_of`: source type’s `parent_types` must include target type; at most one `child_of` per source
7. Optional: if agent sent `relates_to` but `child_of` is the unique valid hierarchy placement, **suggest** `child_of` (do not silently rewrite unless a `upgrade: true` flag is set — default off so agents see the lesson)

Return `{ error, suggestion }` so the client can retry. Same contract Momentum’s link validator used; smaller rule set.

### 4.6 Blobs

```text
blobs
  id            uuid PK
  media_type    text NOT NULL
  byte_size     int NOT NULL
  sha256        text NOT NULL
  path          text NOT NULL   -- relative to FOUNDATION_DATA
  created_at    timestamptz
```

v1 milestone can ship **inline payloads only** (HTML itineraries fit). Blob table is slice 9.

### 4.7 Activity log

Keep Momentum’s safety-critical shape; drop `proposal_id` and the actor enum tied to harness/check-in/reorganize.

```text
activity
  id              uuid PK
  actor           text NOT NULL   -- agent | user | system
  actor_label     text NULL       -- "Cursor", "Grok Bot", …
  action          text NOT NULL   -- create | update | delete | restore
                                  -- link | unlink | type_change | relation_change
  target_kind     text NOT NULL   -- node | edge | type | relation
  target_id       text NULL
  before          jsonb NULL
  after           jsonb NULL
  reversible      boolean NOT NULL
  undo_token      uuid NULL
  token_expires_at timestamptz NULL
  undone_at       timestamptz NULL
  rationale       text NULL
  created_at      timestamptz NOT NULL
```

**Undo v1 must actually invert** (Momentum’s MCP undo only restored `parent`/`type`/`status` and bounced everything else to `restore_note`). Foundation invert map:

| action | inverse |
| --- | --- |
| create node | soft-delete |
| update node | restore `before` payload/data/title/type/status |
| delete node | clear `deleted_at` (restore) |
| link | delete that edge |
| unlink | re-insert edge from `before` |
| type/relation create | delete registry row if unused; else refuse |
| type/relation update | restore `before` row |

Undo of undo is a new compensating row (`reversible = false`). Expired tokens refuse. Destructive MCP tools still require `confirm: true` *in addition to* the log.

Soft-delete keeps incident edges so restore is `clear deleted_at`. `get` and `link` validation ignore edges whose endpoints are deleted. Inserting a new `child_of` drops a stale `child_of` to a deleted parent so the unique index matches the live graph, and writes an `unlink` activity row with a `before` snapshot of the dropped edge.

### 4.8 Search (v1 vs later)

- **v1:** Postgres FTS on `title` + extracted text from inline payloads (strip HTML tags for `text/html`; stringify JSON). Filter by `type`, exclude `deleted_at`.
- **Later:** `embeddings` table (`node_id`, `chunk_index`, `embedding vector`, `model`) + hybrid rank. Do not block the first milestone.

### 4.9 What we are not modeling in v1

Users, RLS policies, sessions table, proposal/attention tables, memories, habit_logs as a product table (use nodes or `data`), note_revisions (activity snapshots are enough), saved views, push tokens.

---

## 5. Proposed slim MCP tool list

Twelve tools. Names are stable; descriptions stay one sentence on the wire. Full parameter sketches: [`docs/MCP_TOOLS.md`](./MCP_TOOLS.md).

| Tool | Purpose |
| --- | --- |
| `bootstrap` | Return starter ontology, how to extend it, and current type/relation inventory. Call first. |
| `search` | Find nodes by text query and optional type filter. |
| `get` | Fetch a node by id, including payload and incident edges. |
| `upsert` | Create or update a node (title, type, payload, data, status). |
| `delete` | Soft-delete a node. Requires `confirm: true`. |
| `link` | Create a typed edge after validation. |
| `unlink` | Remove a typed edge. Requires `confirm: true`. |
| `inspect_ontology` | List type and relation registry rows (system + authored). |
| `manage_type` | Create or update a node type. Applies immediately. |
| `manage_relation` | Create or update a relation type. Applies immediately. |
| `list_activity` | Read the activity log (filter by action, target, since). |
| `undo` | Reverse a reversible activity row by id. Requires `confirm: true`. |

**Intentionally not separate tools:** restore (use `undo`), neighborhood / hierarchy tree (use `get` + `search`), habit logging, blob upload, embeddings admin.

**Handler contract (keep from Momentum):** each tool has one zod input schema and one output schema; JSON Schema on the wire is derived; invalid input never reaches the domain; errors are `{ error, suggestion? }`.

**Bootstrap payload (normative for agents):** spine diagram, seed types/relations, “you may `manage_type` / `manage_relation` without approval”, “destructive tools need `confirm`”, “identity is UUID”, “payloads may be HTML/JSON/markdown”.

---

## 6. Migration / port plan (ordered slices)

Implement in this order. Each slice should be mergeable and testable. **Do not scaffold the full app in this PR.**

| Slice | Deliverable | Hits SPEC milestone? |
| --- | --- | --- |
| **0. This redesign** | `docs/REDESIGN.md` + tool stub + README pointers | Decision gate |
| **1. Repo skeleton** | pnpm workspaces, `packages/schema`, `packages/db`, `apps/server`, `docker-compose.yml`, env sample, `FOUNDATION_DATA` | Install path exists |
| **2. Schema + seed** | Migrations for nodes/edges/registries/activity; seed spine + artifact types + relations | Data model real |
| **3. MCP hello** | Streamable HTTP `/mcp`, API key, `bootstrap` only | `docker compose up` yields MCP |
| **4. Nodes + payloads** | `upsert` / `get` / `delete`; markdown + HTML + JSON inline payloads | HTML itinerary round-trip |
| **5. Edges + validation** | `link` / `unlink`; `child_of` uniqueness; suggestion errors | area → project link |
| **6. Ontology mutation** | `inspect_ontology` / `manage_type` / `manage_relation`; no proposal queue | Agent adds a type and uses it |
| **7. Activity + undo** | Log every mutation; `list_activity` / `undo` with real inverses | Activity shows those mutations |
| **8. Search** | FTS `search` | Search the itinerary back |
| **9. Compose polish** | README install < 15 min; health endpoint; volume perms | README success criterion |
| **10. Blobs** | `storage: blob` + local files (optional if inline is enough) | Large HTML/files |
| **11. Embeddings** | pgvector + hybrid search (optional) | Open decision |
| **12. Thin viewer** | Mac/web read-only against the API (deferred) | Non-goal for v1 |

Slice 3–9 is the first milestone in SPEC. Stop there before any viewer, embeddings, or habit-log sugar.

**Port discipline:** when implementing a slice, read the Momentum file for the *rule*, write new Foundation code, add a test that names the rule. Never copy a handler file across.

---

## 7. Explicit improvements vs Momentum (this use case)

1. **Agents are the product.** Twelve tools, bootstrap-first, UUID identity, no chat presentation tools, no token-budget compaction ladder.
2. **Ontology is writable.** Type/relation changes apply now. Safety is activity + undo, not a Pending inbox designed for a phone.
3. **Payloads are first-class.** HTML trip itineraries (and JSON, blobs) live on the node. Momentum’s `content: string` is a markdown vault leftover.
4. **One graph, one store.** No memories table, no parent column, no relations JSON, no dual vault. Edges are the truth.
5. **Area means one thing.** Graph-root life domain. Not a type-library lane (`work`/`money`/…) and not a retired `core_value`.
6. **Hierarchy names match the spine.** `child_of` + `parent_types` on the type. No `serves_value`.
7. **Single-user box.** API key, Docker Compose, data directory. No RLS theater, OAuth, RevenueCat, Replit, or Apple.
8. **Undo that works.** Snapshots invert create/update/delete/link/unlink/registry edits — the promise Momentum’s activity log made and the MCP undo tool only partially kept.
9. **Open to self-host.** Boring install; no mobile/billing surface to strip.

---

## 8. Risks / open questions

### Risks

- **Type soup.** Unbounded `manage_type` can recreate the tag-soup problem. Mitigation: `bootstrap` strongly steers to the spine; `inspect_ontology` is cheap; we can later add a `retire_type` that refuses if nodes exist. Do not reintroduce an approve queue.
- **Undo vs multi-agent races.** Two agents mutating the same node: last write wins; undo restores *that* activity’s `before`, which may not be “the other agent’s intent.” Accept for v1; document it.
- **HTML in the graph.** Fine for agents. A future viewer must treat payload HTML as untrusted (sanitize or iframe). Do not block v1.
- **FTS quality.** HTML/JSON extraction will be crude. Milestone only needs “search it back,” not semantic recall.
- **Grok Bot disk.** Blobs + Postgres on a small box. Keep inline-first; blob slice has size limits.
- **Scope creep from Momentum muscle memory.** Every “just port `get_vault_health`” request should lose to this document.

### Open questions (need a call, not a guess)

1. **License** — still TBD in SPEC.
2. **Habit completions in v1** — `data.logs[]` on the habit node vs a `habit_log` artifact type vs defer entirely. Recommendation: defer dedicated logging; agents `upsert` the habit’s `data` or add `note` children until someone feels the pain.
3. **`child_of` auto-upgrade** — default off (suggestion only) vs on (Momentum-like). Recommendation: **off**. Agents should learn the spine verb.
4. **Status enum** — three values (`active` / `completed` / `archived`) vs Momentum’s seven. Recommendation: three. Draft/on-hold can be `data` or a later type field.
5. **Embeddings in milestone 1** — SPEC leaves this open. Recommendation: **FTS only** for slices 1–9; install `pgvector` in Compose so slice 11 does not migrate the image.
6. **REST alongside MCP** — useful for a future viewer and curl debugging. Recommendation: thin REST that calls the same domain functions, not a second contract. Can wait until slice 9.
7. **Multi-profile later** — one DB per person vs `owner_id`. Recommendation: one DB / one key for v1; don’t paint into a corner (keep `owner_id` nullable unused).
8. **Lesson parent** — seed `parent_types: [area]` only, or `[area, project, goal]` to match Momentum’s looser lesson hang. Recommendation: `[area, project, goal]`.
9. **Symmetric `relates_to` storage** — store one direction only (canonical `from_id < to_id`) vs store as written and reject reverse. Recommendation: store as written; reject reverse duplicate (Momentum behavior).

---

## 9. Approval checkpoint

If this map is accepted:

- Slice 1–9 proceeds as the first implementation PR series.
- Momentum remains a **reference**, never a submodule or vendor dump.
- New tools require a SPEC + REDESIGN amendment, not a drive-by port.

If rejected, say which section (tools, hierarchy verb, payload shape, undo invert map) and we revise this document before any scaffold.
