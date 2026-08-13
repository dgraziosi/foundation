# Foundation — Product & architecture spec

Living spec. Cloud agents and humans update this as decisions land.

## Purpose

Foundation is a **personal ontology + MCP server** for AI agents. It is durable structured context (a typed graph) that agents read and write — not chat memory, not a notes app with an API bolted on.

Named after Asimov’s Foundation: carry structured knowledge forward so you and your agents are not starting from zero.

**Not for sale.** Open on GitHub so others can self-host for their own agents (e.g. on a Grok Bot computer).

## Primary users

1. **Agents** (Grok Bot, Cursor, Claude, …) via MCP — default interface
2. **Humans** via conversation with those agents; optional thin viewer later (Mac/web)

## Goals

- One durable graph of a person’s life/work
- Clear starter vocabulary so day one is not tag soup
- Vocabulary can grow (types + relations) without painful migrations
- Flexible node payloads (markdown, HTML, JSON, files) — e.g. a trip itinerary stored and re-shown as HTML
- Runs well on a single-user machine (Grok Bot computer / Docker)
- Boring install: `docker compose up`, API key, point MCP client at it
- Iterate via Cursor cloud agents on this repo

## Non-goals (v1)

- Mobile app, Watch, Apple auth, RevenueCat, iCloud vault sync
- Multi-tenant SaaS, billing, complex OAuth for third parties
- Replit-specific hosting glue
- Dual write to a markdown vault + database (one store)
- Proposal/approve inbox for ontology changes (agents may mutate types/relations directly; keep an activity log + undo)
- Cloning Momentum’s full product surface

## Source material

Reference implementation ideas from [`dgraziosi/Momentum-React-Native`](https://github.com/dgraziosi/Momentum-React-Native) branch **`replit-agent`** (not stale `main`).

**Extract with judgment.** Do not copy at face value. Redesign for the goals above. Prefer delete and simplify over porting chat-era tool sprawl, multi-tenant auth, and UI-coupled paths.

Useful Momentum areas to study (then rethink):

- `lib/shared-types/src/schema/` — notes, hierarchy, ontology shapes
- Link validation / relation matrix concepts
- MCP tool surface under `artifacts/api-server/src/tools/` and auth under `artifacts/api-server/src/auth/mcp.ts`
- Area-as-root hierarchy (area → project → goal → habit/task)

## Starter ontology (default seed)

Spine (Life Map):

```text
area → project → goal → habit | task
```

Plus common artifact types as seeds (person, journal, idea, lesson, note, …) — exact set TBD in redesign. **Area** is the vault root (life domain + what you value); it replaces Momentum’s retired `core_value`.

Hierarchy relation seeds (names may be simplified in redesign):

- project/lesson → area
- goal → project
- habit/task → goal

Associative relations as seeds: relates_to, supports, inspired_by, references, about, …

Agents can add types and relations over time.

## Data model principles

1. **Node** = id, type, title, timestamps, metadata, **payload**
2. **Payload** is typed by content format (`text/markdown`, `text/html`, `application/json`, …) and/or storage (inline body vs blob ref)
3. **Edge** = from_id, to_id, relation_type, optional metadata
4. **Type registry** + **relation registry** are data (per instance), seeded from defaults
5. **Activity log** for creates/updates/deletes/type changes — enough to undo
6. Single-user v1: no RLS theater required; simple `user_id` or single-tenant DB is fine

## Agent API principles (MCP)

- Small, stable tool list aimed at agents (bootstrap, search, get, capture/upsert, link/unlink, list types/relations, manage type/relation, activity/undo)
- Destructive tools require explicit confirm
- Bootstrap tool returns starter ontology + how to extend it
- No requirement for a human proposal queue

## Runtime principles

- Postgres preferred (paths open for vectors later); SQLite only if we consciously drop vectors for v1
- Docker Compose for local/box bring-up
- Data and code under an isolated workspace path when running on Grok Bot computer — never write into agent profile/memory directories
- Localhost MCP + API key auth for v1

## Success criteria (first milestone)

- [x] `docker compose up` yields working MCP (`bootstrap` only in slices 1–3)
- [ ] Agent can create an `area`, a `project`, link them, store an HTML itinerary payload on a node, search it back
- [ ] Agent can add a new type and use it without a human approval step
- [ ] Activity log shows those mutations
- [ ] README explains install for another Grok Bot user in < 15 minutes of reading

## Decisions

- **License: MIT** (Copyright 2026 Danny Graziosi) — see `/LICENSE`

## Open decisions

Proposed answers live in [`docs/REDESIGN.md`](./REDESIGN.md) (especially §5 tools, §8 open questions). Until that map is approved, these remain open:

- Exact slim MCP tool names
- Whether v1 includes embeddings/hybrid search or text search only
- Optional viewer: defer until API is stable
