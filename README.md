# Foundation

A personal ontology your agents can grow.

Foundation is a small, self-hostable **typed knowledge graph + MCP server** for AI agents (Grok Bot, Cursor, Claude, …). It gives them durable structure — not just chat memory — and lets that structure evolve as your life does.

The name is a nod to Asimov: carry structured knowledge forward so you (and your agents) are not starting from zero every time.

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

Scaffolding. Extracting the ontology kernel + MCP surface from [Momentum](https://github.com/dgraziosi/Momentum-React-Native) (`replit-agent`), then simplifying for this use case.

## Intended use

1. Run Foundation where your agents already live (e.g. Grok Bot computer)
2. Point agents at the local MCP endpoint
3. Optionally open a thin viewer later (Mac/web) against the same API

## License

TBD.
