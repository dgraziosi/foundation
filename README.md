# Foundation

A personal ontology your agents can grow.

Foundation is a small, self-hostable **typed knowledge graph + MCP server** for AI agents (Grok Bot, Cursor, Claude, …). It gives them durable structure — not just chat memory — and lets that structure evolve as your life does.

The name is a nod to Asimov: carry structured knowledge forward so you (and your agents) are not starting from zero every time.

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — product contract (goals, non-goals, data/MCP/runtime principles)
- [`docs/REDESIGN.md`](docs/REDESIGN.md) — redesign map vs Momentum (`replit-agent`): what to keep, what to discard, architecture, data model, slim MCP tools, implementation slices
- [`docs/MCP_TOOLS.md`](docs/MCP_TOOLS.md) — 12-tool MCP surface

## What it is

- **Nodes** with types (e.g. area → project → goal → habit/task, plus whatever emerges)
- **Typed links** between them
- **Flexible payloads** (markdown, HTML, JSON, …) so a trip itinerary can live in the graph as HTML
- **MCP-first** API so agents read and write the graph directly
- Agents may **create and update types and relations** as needed (activity log for undo); no approve/reject inbox required

## What it is not

- Not a mobile app, billing system, or full Momentum product clone
- Not a second brain you have to maintain by hand (agents are the primary users)
- Not a hosted SaaS you must buy — run it on your own machine (including a Grok Bot computer)

## Install

Requires [Docker Compose](https://docs.docker.com/compose/) and a copy of this repo. Node 22 is only needed if you run the app on the host instead of in Compose.

1. Copy the env file and set an API key (do not commit `.env`):

   ```bash
   cp .env.example .env
   # set FOUNDATION_API_KEY to a long random string
   ```

2. Start Postgres 16 (pgvector image; vector unused for now) and the Foundation server. Durable files go under `FOUNDATION_DATA` (default `./data`):

   ```bash
   docker compose up --build
   ```

3. Point an MCP client at `http://127.0.0.1:8787/mcp` with:

   ```http
   Authorization: ApiKey <FOUNDATION_API_KEY>
   ```

   `Authorization: Bearer <FOUNDATION_API_KEY>` is accepted as an equivalent.

   Cursor / Claude-style MCP config:

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

4. Call `bootstrap` first. It returns the starter spine (`area → project → goal → habit | task`), seeded types/relations, and how to extend the ontology.

   After bootstrap, an agent can `upsert` an `area` and `project`, `link` them with `child_of`, store an HTML itinerary on a `trip` node (`payload.media_type = "text/html"`), `search` that itinerary back, `manage_type` a custom type, `list_activity` for receipts, and `undo` a reversible mutation. Destructive tools (`delete`, `unlink`, `undo`) require `confirm: true`.

   With Node 22 + pnpm (and Compose already up):

   ```bash
   pnpm bootstrap
   ```

   Or with curl (SSE JSON-RPC; look for the `data:` line):

   ```bash
   set -a && source .env && set +a
   ```

   **Health** (no auth): `GET http://127.0.0.1:8787/health` — `{ ok, service, db }`.

   **Bootstrap:**

   ```bash
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"bootstrap","arguments":{}}}'
   ```

   **Mutate → list_activity → search → undo** (replace UUIDs from the upsert/`list_activity` responses):

   ```bash
   # upsert an HTML itinerary
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"upsert","arguments":{"type":"trip","title":"Tokyo week","payload":{"media_type":"text/html","storage":"inline","body":"<html><body><h1>Itinerary</h1><p>Day 1: arrive NRT</p></body></html>"}}}}'

   # search the itinerary back
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search","arguments":{"query":"arrive NRT","type":"trip"}}}'

   # list receipts for that node
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_activity","arguments":{"action":"create","target":"<NODE_UUID>"}}}'

   # undo that create (soft-deletes; requires confirm)
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"undo","arguments":{"id":"<ACTIVITY_UUID>","confirm":true}}}'
   ```

   If Postgres fails to start on a bind-mounted data dir, Compose already runs a `db-init` step that `chown`s `$FOUNDATION_DATA/postgres` to uid 999. To reset local data: `docker compose down` and remove `./data` (this deletes the graph).

Never point `FOUNDATION_DATA` at an agent profile or memory directory.

## Status

Slices 1–9: repo skeleton, schema/seed, MCP `bootstrap`, nodes/payloads (`upsert` / `get` / `delete`), edges (`link` / `unlink`), ontology mutation (`inspect_ontology` / `manage_type` / `manage_relation`), activity + undo (`list_activity` / `undo` with real inverses), FTS `search`, compose polish. Later slices add blobs, embeddings, and a thin viewer.

Reference ideas (not a dump): [Momentum](https://github.com/dgraziosi/Momentum-React-Native) branch `replit-agent`.

See [docs/SPEC.md](docs/SPEC.md) for the product contract.

## Intended use

1. Run Foundation where your agents already live (e.g. Grok Bot computer)
2. Point agents at the local MCP endpoint
3. Optionally open a thin viewer later (Mac/web) against the same API

## License

[MIT](LICENSE) © 2026 Danny Graziosi
