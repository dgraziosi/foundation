# Foundation

A personal ontology your agents can grow.

Foundation is a small, self-hostable **typed knowledge graph + MCP server** for AI agents (Grok Bot, Cursor, Claude, …). It gives them durable structure — not just chat memory — and lets that structure evolve as your life does.

The name is a nod to Asimov: carry structured knowledge forward so you (and your agents) are not starting from zero every time.

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — product contract (goals, non-goals, data/MCP/runtime principles)
- [`docs/REDESIGN.md`](docs/REDESIGN.md) — redesign map vs Momentum (`replit-agent`): what to keep, what to discard, architecture, data model, slim MCP tools, implementation slices
- [`docs/MCP_TOOLS.md`](docs/MCP_TOOLS.md) — proposed 12-tool MCP surface

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

   With Node 22 + pnpm (and Compose already up):

   ```bash
   pnpm bootstrap
   ```

   Or with curl (SSE JSON-RPC; look for the `data:` line):

   ```bash
   set -a && source .env && set +a
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"bootstrap","arguments":{}}}'
   ```

Health (no auth): `GET http://127.0.0.1:8787/health`.

Never point `FOUNDATION_DATA` at an agent profile or memory directory.

## Status

Slices 1–3: repo skeleton, schema/seed, MCP `bootstrap`. Later slices add upsert/get/delete, link/unlink, ontology mutation, activity/undo, and search.

Reference ideas (not a dump): [Momentum](https://github.com/dgraziosi/Momentum-React-Native) branch `replit-agent`.

See [docs/SPEC.md](docs/SPEC.md) for the product contract.

## Intended use

1. Run Foundation where your agents already live (e.g. Grok Bot computer)
2. Point agents at the local MCP endpoint
3. Optionally open a thin viewer later (Mac/web) against the same API

## License

[MIT](LICENSE) © 2026 Danny Graziosi
