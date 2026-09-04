# Detail

Detail is one non-journal record as a page in the content host. It is not a docked inspector. A click on a record or a graph node opens `/view/nodes/<uuid>`. For a note, task, or other display type: title, body, structure, and properties show. Values do not edit. A journal with inline markdown is [Journal write](./journal-write.md), not this chrome.

## Sub-features

- `detail-open` fills the main pane at `/view/nodes/<uuid>` with `[data-surface="detail-page"]` and the record title as the heading (non-journal, or a journal that is not inline markdown).
- `detail-missing` shows **Not found.** for a bad or unknown id.
- `detail-properties` shows type, status, fields, related records, location, and timestamps. **Open** appears only when `data.url` is a well-formed https address.
- `detail-structure` shows Structure when there are children, or an ancestor chain the type asks for.
- `detail-close` closes the detail tab and activates the tab to its left, or Home when that was the last one.

## How to get to it (user POV)

- Choose a Recents row, an open-task row, a collection row/card/cell/board card/calendar item/outline row, a search hit, a related record on another detail page, or a graph node.
- Go to `/view/nodes/<uuid>` after Unlock.

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked.
- A first-day vault has no user records. Use `detail-missing` with a made-up UUID, or skip `detail-open` and say there was no live record. Do not upsert a fake life to force a title.

- **Missing.** Open `/view/nodes/00000000-0000-4000-8000-000000000000`. Copy **Not found.**
- **HTTP missing.** `GET /view/api/nodes/00000000-0000-4000-8000-000000000000` with the vault key (view-key-file when present). Status `404`. Body `{"error":"Not found"}`.
- **Open from Home or collection.** When a real record exists on this vault, choose its title. Path `/view/nodes/<uuid>`. Heading is that title. `[data-surface="detail-page"]` is present. Properties column heading **Properties**.
- **Open from search.** From the search overlay, choose a hit. Same detail page. Overlay closes.
- **Close.** Choose the strip button `aria-label="Close <title>"` after a click-open (the tab label is that title). A deep-link to `/view/nodes/:id` keeps the tab label `Detail`, so the control is `Close Detail`.
- **HTTP get.** `GET /view/api/nodes/<uuid>` with the vault key (view-key-file when present). Body includes `node.title`, `node.type`, `node.status`, `node.data`. Display only.
- **Proof.** Screenshot the detail heading and Properties, or save the 404 body for `detail-missing`. Feature id `detail-missing` is enough on a first-day vault.

## Gotchas

- Properties live on this page. There is no inspector pane beside Home.
- **Open** is `data.url` (https). It is not which Drive / Gmail / Calendar object. That identity is upsert `url { system, id }`, looked up with MCP `search { url }`.
- Blob body in the window is `GET /view/blobs/:id` (cookie or Authorization). Agents still use `GET /blobs/:id` with the header.
- Do not prove detail by calling MCP `get` only. The user path is the page or `/view/api/nodes/:id`.
- A journal with inline `text/markdown` does not get this chrome. The same `/view/nodes/:id` route renders [Journal write](./journal-write.md) (`[data-surface="journal-page"]`, no Properties). Do not score that as a failed `detail-open`.
