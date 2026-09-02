# Search

Search is chrome, not a fourth surface. The user opens it from the rail. It queries the graph, optionally by type or status, and a hit opens the detail page. There is no default filter.

## Sub-features

- `search-open` opens the overlay from the rail (`[data-surface="search-overlay"]`, heading **Search**).
- `search-idle` shows **Search the graph, or filter by type.** before a query or filter is submitted.
- `search-match` lists hits with title, snippet, type, and due when present.
- `search-empty` shows **No matching nodes.** when a search completed with zero hits.
- `search-open-result` opens a hit as a detail page and closes the overlay.
- `search-close` chooses **Close** and returns to the surface underneath.

## How to get to it (user POV)

- Choose **Search** in the left rail (collapsed rail: `aria-label="Search"`).
- There is no Search route. The overlay sits on the current Home / collection / detail.

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked. Viewer dist is built for a browser drive.
- A first-day vault can prove `search-open`, `search-idle`, and `search-empty`. Do not seed a fake life for a hit.

- **Open.** Choose rail **Search**. Overlay `[data-surface="search-overlay"]` appears. Heading **Search**. Focus is in the field whose placeholder is `Search the graph`.
- **Idle.** With an empty query and Any / Any status, copy is **Search the graph, or filter by type.**
- **Empty query.** Type a token that cannot match (`zzzxnever`) and submit the form (Enter). Copy **No matching nodes.**
- **Type filter.** Choose a type in the first select (Any / type labels). The overlay searches even without a query. First-day note: `GET /view/api/search?type=note` returns `{ "searched": true, "hits": [] }`.
- **Open hit.** When a hit exists, choose its title. Overlay closes. Detail page for that id.
- **Close.** Choose **Close**. Overlay is gone. The surface underneath is unchanged.
- **HTTP idle.** `GET /view/api/search` with the API key. `{ "searched": false, "hits": [] }`.
- **HTTP miss.** `GET /view/api/search?q=zzzxnever` with the API key. `{ "searched": true, "hits": [] }`.
- **Proof.** Screenshot the overlay heading and idle or empty copy, or save the two JSON bodies. Feature id `search-idle` or `search-empty`.

## Gotchas

- Search is not in the view strip and not in the rail as a page. Recents is Home chrome, not Search.
- No default type or status filter. Home Open tasks does filter; Search does not inherit that.
- The overlay may pass type or status. That is chrome, not a write.
- MCP `search` is how a bot queries the graph. A Viewer proof uses the overlay or `GET /view/api/search`.
