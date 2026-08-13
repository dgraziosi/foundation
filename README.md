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

## Status

Design. The redesign map is in [`docs/REDESIGN.md`](docs/REDESIGN.md). Implementation (Docker Compose + MCP) starts after that map is approved — no app scaffold yet.

Reference ideas (not a dump): [Momentum](https://github.com/dgraziosi/Momentum-React-Native) branch `replit-agent`.

See [docs/SPEC.md](docs/SPEC.md) for the product contract.

## Intended use

1. Run Foundation where your agents already live (e.g. Grok Bot computer)
2. Point agents at the local MCP endpoint
3. Optionally open a thin viewer later (Mac/web) against the same API

## License

[MIT](LICENSE) © 2026 Danny Graziosi
