# Foundation

A personal ontology your agents can grow.

Foundation is a small, self-hostable **typed knowledge graph + MCP server** for AI agents (Cursor, Claude, and other MCP clients). It gives them durable structure — not just chat memory — and lets that structure evolve as your life does.

The name is a nod to Asimov: carry structured knowledge forward so you (and your agents) are not starting from zero every time.

**Glossary (locked):** **Foundation** = the product. A **vault** = one instance (`FOUNDATION_DATA` + Postgres). The **graph** = the knowledge in that vault. A **blob** = a file on a node. An **agent** = anything that can reach the vault MCP. The **operator** = the human who runs Compose — only the human, not an agent. Do not call the graph “the Vault.” Short analog: app / folder / links → Foundation / vault / graph.

Do not commit personal life data, documents, or secrets to this repository. Those belong in the operator’s vault, not in git.

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — product contract
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — living vault and graph
- [`docs/MCP_TOOLS.md`](docs/MCP_TOOLS.md) — 12-tool MCP surface
- [`docs/AGENTS.md`](docs/AGENTS.md) — optional named-agent recipe (not product ontology)
- [`docs/VAULT_HEALTH.md`](docs/VAULT_HEALTH.md) — weekday instance checkup
- [`docs/GRAPH_HYGIENE.md`](docs/GRAPH_HYGIENE.md) — weekly graph report

## What it is

- **Nodes** with types (e.g. area → project → goal → habit/task, plus whatever emerges)
- **Typed links** between them
- **Flexible payloads** (markdown, HTML, JSON, files as blobs) so a trip itinerary can live in the graph as HTML and a PDF can live as `$FOUNDATION_DATA/blobs/<uuid>`
- **MCP-first** API so agents read and write the graph directly
- Agents may **create and update types and relations** as needed (activity log for undo); no approve/reject inbox required

## What it is not

- Not a mobile app, billing system, or hosted SaaS you must buy
- Not a second brain you have to maintain by hand (agents are the primary users)
- Run Compose on a machine your agents can reach at localhost MCP

## Install

Requires [Docker Compose](https://docs.docker.com/compose/) and a copy of this repo. Node 22 is only needed if you run the app on the host instead of in Compose.

1. Copy the env file and set an API key (do not commit `.env`):

   ```bash
   cp .env.example .env
   # set FOUNDATION_API_KEY to a long random string
   ```

2. Start Postgres and the Foundation server. Durable files go under `FOUNDATION_DATA` (default `./data`):

   ```bash
   docker compose up --build
   ```

   **Optional stand-up.** After Compose is up, the operator can run instance routines (vault health, graph hygiene, applying git updates) or attach named agents ([`docs/AGENTS.md`](docs/AGENTS.md)). What “healthy” means: [`docs/VAULT_HEALTH.md`](docs/VAULT_HEALTH.md). Graph report: [`docs/GRAPH_HYGIENE.md`](docs/GRAPH_HYGIENE.md). No new MCP tools.

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

4. Call `bootstrap` first. It returns the starter spine (`area → project → goal → habit | task` — preferred, not a hard gate for `task` → `project`), seeded types/relations, and how to extend the ontology.

   After bootstrap, an agent can `upsert` an `area` and `project`, `link` them with `child_of`, store an HTML itinerary on a `trip` node (`payload.media_type = "text/html"`), `search` that itinerary back, list open or overdue tasks with `search` `{ type: "task", status: "active" }` or `{ type: "task", due: "overdue" }` (no query), attach a PDF blob on a `note` (`payload.storage = "blob"`), `manage_type` a custom type (including retire of an unused authored type), `list_activity` for receipts, and `undo` a reversible mutation. Destructive tools (`delete`, `unlink`, `undo`, `manage_type` retire) require `confirm: true`. If you already have a UUID, call `get`. An empty lexical `search` is not a reason to upsert a duplicate.

   With Node 22 + pnpm (and Compose already up):

   ```bash
   pnpm bootstrap
   ```

   Or with curl (SSE JSON-RPC; look for the `data:` line):

   ```bash
   set -a && source .env && set +a
   ```

   **Health** (no auth): `GET http://127.0.0.1:8787/health` — `{ ok, service, db }`.

   **Blobs:** large files are `$FOUNDATION_DATA/blobs/<uuid>` (not git, not agent-data). Ingest with `upsert` (`payload.storage = "blob"` plus `bytes_base64`, or drop a file in `$FOUNDATION_DATA/uploads` and pass `source_path`). Cap 20MB. Fetch bytes: `GET /blobs/:id` with the API key. `get` returns blob metadata, not the file body.

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
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"upsert","arguments":{"type":"trip","title":"Sample itinerary","payload":{"media_type":"text/html","storage":"inline","body":"<html><body><h1>Itinerary</h1><p>Day 1: arrive NRT</p></body></html>"}}}}'

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

   **Store a small PDF as a blob** (synthetic example; `get` returns `blob_id` + sha256, not the bytes). Fetch bytes with `GET /blobs/<BLOB_ID>`:

   ```bash
   PDF_B64="$(printf '%s' '%PDF-1.1
trailer<</Root 1 0 R>>
%%EOF' | base64 -w0)"
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"upsert\",\"arguments\":{\"type\":\"note\",\"title\":\"Sample PDF\",\"payload\":{\"media_type\":\"application/pdf\",\"storage\":\"blob\",\"bytes_base64\":\"${PDF_B64}\"}}}}"

   curl -sS "http://127.0.0.1:8787/blobs/<BLOB_ID>" \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -o /tmp/sample.pdf
   ```

   Operator drop-box (no base64): copy a file into `$FOUNDATION_DATA/uploads/` then `upsert` with `payload.source_path` set to the filename. The server moves it to `blobs/<uuid>`. Compose `db-init` creates `uploads/` mode 1777 (sticky) so the host user can write on a bind mount; `blobs/` stays 0700.

   If Postgres fails to start on a bind-mounted data dir, Compose already runs a `db-init` step that `chown`s `$FOUNDATION_DATA/postgres` to uid 999. Never `docker compose down -v` as a casual step; that is how you destroy a vault. Never delete `FOUNDATION_DATA`.

Never point `FOUNDATION_DATA` at an agent profile or memory directory.

## Intended use

1. Run Compose on a machine your agents can reach at localhost MCP
2. Point agents at the local MCP endpoint
3. Optionally stand up named agents and instance routines ([`docs/AGENTS.md`](docs/AGENTS.md))

## License

[MIT](LICENSE) © 2026 Danny Graziosi
