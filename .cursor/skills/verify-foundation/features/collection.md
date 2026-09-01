# Collection

Collection is one type's records in the layouts that type declared. The user opens it from a Home type folder, from Open tasks **View all** (tasks), or from a view-strip tab. The window reads the type's views. It does not invent a layout.

## Sub-features

- `collection-open` opens `/view/types/<slug>` with the type label and the count after the active view's filter.
- `collection-empty` shows **Nothing yet.** when the type has no live records.
- `collection-filtered` shows **Nothing matches your filters.** when records exist but the active view filter hides them.
- `collection-views` lists only the view names that type declared (`aria-label="View"`).
- `collection-show-completed` toggles **Show completed** for this window only. It does not write. It does not change Home, Recents, or Search.
- `collection-open-record` opens a row, card, cell, board card, calendar item, outline row, or graph node as a detail page.
- `collection-no-views` shows **No views declared for this type.** when `views` is empty.

## How to get to it (user POV)

- Choose a type folder on Home.
- Choose Open tasks **View all** (task collection).
- Choose an already-open type tab in the view strip.
- Go to `/view/types/<slug>` after Unlock (for example `/view/types/task`, `/view/types/journal`).

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked.
- Seed types already declare views. `task` default is **board**. `journal` default is **list**. A first-day vault can still open `/view/types/task` and show **Nothing yet.**

- **Open tasks.** From Home, choose Open tasks **View all**, or go to `/view/types/task`. Heading includes **Task**. `[data-surface="view-strip"]` has a Task tab.
- **Empty.** On a type with no live records, copy is **Nothing yet.**
- **View switcher.** `aria-label="View"` lists only declared ids (task seed: Board, List, Calendar, Timeline, Outline). Choosing **List** keeps the same type and changes the layout, not the route.
- **Show completed.** `aria-label="Show completed"` is a toggle. It widens an active status filter for this window. Home Open tasks must not change.
- **Graph.** If the type names `graph`, that layout uses `[data-surface="graph"]` (floor 460px). Click a node: detail page. Right-click a node: local graph, depth 1–4, default 2.
- **HTTP.** `GET /view/api/types/task` with the API key. Body has `type.label`, `type.views`, `nodes`. First-day: `nodes` is `[]`.
- **Proof.** Screenshot the collection heading and empty copy, or save the type JSON. Feature id `collection-empty` or `collection-open`.

## Gotchas

- The window does not add a ninth layout. Declared set: list, card, table, board, calendar, timeline, outline, graph.
- Count in the heading is after the active view's filter, not always the live type count on Home folders.
- `journal` as a collection is a list of journal records. It is not journal write (forthcoming).
- Do not treat MCP `search { type }` as a collection proof. Drive `/view/types/<slug>` or `GET /view/api/types/<slug>`.
