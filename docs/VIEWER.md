# Viewer

Read-only window on a running vault. Same ontology as MCP. Same objects. Same types. Same relations. The window does not write.

Live at `/view`. Unlock with the MCP API key. Session is an HttpOnly cookie, `Path=/view`. That cookie does not unlock `/mcp` or `/blobs/:id`. Ports: `8787` MCP, `8788` `/view`. Off-box unlock and session.

---

## What the window is

One chrome. A content host. Three surfaces. The ontology owns identity and which layouts a type may use. The window never writes.

| Surface | What it is |
| --- | --- |
| Home | Recents, open tasks, and type folders. |
| Collection | One type's objects in the layout that type declared. |
| Detail | One object, as a page in the content host. Title, body, structure, properties. |

Search is chrome, not a fourth surface. Recents is a Home widget; **View all** opens the Recents page. The rail is Home and Search.

The window has no docked inspector. Properties live on the detail page.

---

## Scope

**In the window:** Home, Collection, Detail, Recents, Search.

**Not in the window:** onboarding, settings, capture, composer, Today, Focus, Inbox, check-ins, health, library, trash, an ontology editor.

---

## Click

A click on a record or a graph node opens that object's **detail page** in the content host. The page fills the main pane. It does not open a pane beside Home or a collection.

That click comes from: a graph node, a Recents row, an open-task row, a collection row or card or cell or board card or calendar item or outline row, a search result, a related object on a detail page.

Right-click a graph node: local graph, depth **1–4**, default **2**.

---

## Chrome

**Left rail.** Logo, then Home, then Search. Collapse to icons. Width **56px** collapsed, **224px** expanded. Theme toggle lives here.

Home opens Recents, open tasks, and type folders. Search opens the search overlay.

**Content host.** View strip across the top of the main pane. Home is pinned. Opening a collection or a detail is a view in this strip. The active view fills the pane under the strip.

**Accent is the text color**, not a brand stripe. Active rail row is a quiet fill.

---

## Home

**Recents.** Last **5** objects that are not tasks, newest first. Grouped **Today / Yesterday / Earlier this week / Earlier**. Each row: type glyph, title, relative time. **View all** opens Recents. Empty: **Nothing yet.**

**Open tasks.** The **5** most urgent open tasks, sorted overdue (oldest due first), today, upcoming (soonest first), then undated by title. Grouped **Overdue / Today / Upcoming / No date**. Each row: title and due date. **View all** opens the task collection. Empty: **No open tasks.**

**Type folders.** One folder per type that has live objects, in type-order. Types with a zero count do not appear. Each folder: type glyph, type color, type name, count. Open: that type's collection.

---

## Graph

A collection layout when the type names `graph`. Directed force layout. Nodes are objects. Edges are relations.

Two edge kinds, both drawn:

| Kind | Look |
| --- | --- |
| Hierarchy | Solid, about **1px** |
| Associative | Dashed `[2, 2]`, about **0.6px** |

Node fill is the type's color. Node glyph is the type's icon. Hover shows the title. Click opens that object's detail page. Every live relation is an edge.

---

## Collection

Opened from a type folder, as a view in the content host. Page chrome: type glyph, type color, type name, count. Layout is the type's `default_view`, chosen from that type's `views`. If the type names more than one view, the switcher lists only those names.

Layouts the type may name: list, card, table, board, calendar, timeline, outline, graph.

**List.** Split list. Type glyph, title, the properties that view names. A focused row may show a collection preview. Opening the row opens the detail page. The preview is collection chrome, not the detail surface.

**Card.** Title, snippet, properties. Open: detail page.

**Table.** Columns from the view. Sort and filter stay read-only. Open a row: detail page.

**Board.** One column per value of the grouping property. Column width **233px**. Open a card: detail page.

**Calendar / timeline.** Objects on their dates. Click: detail page.

**Outline.** Nested by the hierarchy relation. Open a row: detail page.

**Graph.** Directed graph scoped to this type. Floor **460px**. Click a node: detail page.

Empty collection: **Nothing yet.** Filtered to zero: **Nothing matches your filters.**

---

## Detail

A page in the content host. Not a docked inspector. Two columns fill the pane under the view strip.

**Document column.** Title. Body, rendered: headings, lists, quotes, code, callouts, dividers. Callout kinds: note, info, tip, warning, danger. Then Structure, when the object has children (or an ancestor chain, when the type asks for that): an embedded collection, height at most half the viewport, only when there is something to show. Opening a child or ancestor opens that object's detail page.

**Properties column.** Belongs to this page. Floor **240px**. Collapsible. Type glyph, type hue, type name. Status. The type's fields, displayed. Related objects, grouped by relation; each row is a title; click opens that object's detail page. Location: the ancestor chain. Timestamps. Incoming and outgoing both show. Values display; they do not edit.

Closing the detail view activates the view to its left in the strip. Closing the last one returns to Home.

---

## Recents page

Opened from the Recents widget's **View all**. Same recency groups as the widget. No cap of 5. Each row opens the detail page.

---

## Search

Overlay from the rail. Query the vault. Results are objects. Click: detail page.

---

## Type identity

The window does not hardcode a type's hue or glyph. Folders, graph nodes, collection rows, and the detail page show whatever types the ontology has.

Seed and authored types carry hue and glyph on the type, same as they carry `views` and `default_view`. The window reads them.

If a type has no hue or glyph yet, the window uses a quiet fallback: neutral ink, a generic mark. It does not invent a special page.

---

## Tokens

Space on Fibonacci: **3 / 5 / 8 / 13 / 21**. Radius **8 / 13 / 21**. Type **Inter**, **400 / 500**. Dark canvas `#0a0a0a`. Light canvas `#fafafa`. Accent is the ink, not a stripe.

Widget cards, collection chrome, and the detail page use these tokens. The graph canvas is the exception: it is a field, not a card.

---

## Read-only

The window does not create, edit, complete, drag, pin, or accept a link.

---

## Copy

Empty Recents and empty collections: **Nothing yet.** Empty open-tasks: **No open tasks.** Filtered collection: **Nothing matches your filters.** Unlock errors: the copy already on the door.
