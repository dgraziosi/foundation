# Viewer

Read-only window on a running vault. Same ontology as MCP. Same objects. Same types. Same relations. The window does not write.

Live at `/view`. Unlock with the MCP API key. Session is an HttpOnly cookie, `Path=/view`. That cookie does not unlock `/mcp` or `/blobs/:id`. Ports: `8787` MCP, `8788` `/view`. Off-box unlock and session.

---

## What the window is

One chrome. Three surfaces. The ontology owns identity and which layouts a type may use. The window never writes.

| Surface | What it is |
| --- | --- |
| Home | First paint is the graph, filling the remaining viewport. Recents, open tasks, and type folders sit below it on the same page. |
| Collection | One type's objects in the layout that type declared. |
| Inspector | One object. Title, body, properties, relations. |

Search is chrome, not a fourth surface. Recents is a Home widget; **View all** opens the Recents page. The rail is Home and Search. Home is the graph page.

---

## Chrome

**Left rail.** Logo, then Home, then Search. Collapse to icons. Width **56px** collapsed, **224px** expanded.

Home is the graph homepage. Search opens the search overlay.

**Top bar.** Breadcrumb of where you are. Search field. Theme toggle (dark / light / system).

**Accent is the text color**, not a brand stripe. Active rail row is a quiet fill.

---

## Home

First paint is the graph. It fills the height left under the top bar. Floor **460px**. Find field on the graph. Type legend. Nodes and edges from live objects and live relations. Click a node: inspector. Right-click a node: local graph, depth **1–4**, default **2**.

Below the graph, on the same page:

**Recents.** Last **10** objects that are not tasks, newest first. Body height **160px**; overflow scrolls inside the card. Grouped **Today / Yesterday / Earlier this week / Earlier**. Each row: type glyph, title, relative time. **View all** opens Recents. Empty: **Nothing yet.**

**Open tasks.** Open tasks grouped **Overdue / Today / Upcoming / No date**. Body height **256px**; overflow scrolls inside the card. Each row: title and due date. **View all** opens the task collection. Empty: **No open tasks.**

**Type folders.** One folder per type that has objects, in type-order. Each folder: type glyph, type color, type name, count. Open: that type's collection.

The page scrolls under the graph. The graph keeps the remaining viewport.

---

## Graph

Home's first paint. Directed force layout. Nodes are objects. Edges are relations.

Two edge kinds, both drawn:

| Kind | Look |
| --- | --- |
| Hierarchy | Solid, about **1px** |
| Associative | Dashed `[2, 2]`, about **0.6px** |

Node fill is the type's color. Node glyph is the type's icon. Hover shows the title. Click opens the inspector. Every live relation is an edge.

---

## Collection

Opened from a type folder. Layout is the type's `default_view`, chosen from that type's `views`. If the type names more than one view, the switcher lists only those names.

Layouts the type may name: list, card, table, board, calendar, timeline, outline, graph.

**List.** One row per object. Type glyph, title, the properties that view names. Open: inspector.

**Card.** Title, snippet, properties. Open: inspector.

**Table.** Columns from the view. Sort and filter stay read-only.

**Board.** One column per value of the grouping property. Column width **233px**.

**Calendar / timeline.** Objects on their dates. Click: inspector.

**Outline.** Nested by the hierarchy relation.

**Graph.** Same directed graph as Home, scoped to this type.

Empty collection: **Nothing yet.**

---

## Inspector

One object. Title. Body. Properties. Relations.

**Body** is the object's text, rendered. Headings, lists, quotes, code, callouts, dividers. Callout kinds: note, info, tip, warning, danger.

**Properties** are the type's fields. Values display; they do not edit.

**Relations** are the object's edges. Each row is the other object's title. Click: that object. Incoming and outgoing both show.

Close returns to wherever you were.

---

## Recents page

Opened from the Recents widget's **View all**. Same recency groups as the widget. No cap of 10. Each row opens the inspector.

---

## Search

Overlay from the rail or the top bar. Query the vault. Results are objects. Click: inspector.

---

## Type identity

Hue and glyph live on the type. The window reads them. Types carry this identity:

| Type | Hue | Icon |
| --- | --- | --- |
| Task | Green | Circle (open) |
| Project | Neutral | Folder |
| Person | Neutral | Person |
| Note | Neutral | File |
| Resource | Neutral | Bookmark |
| Event | Neutral | Calendar |
| Decision | Neutral | Git-fork |
| Fact | Neutral | Database |
| Question | Neutral | Help-circle |

Purple is held off the type wheel. The window's own chrome may use it. Types do not.

---

## Tokens

Space on Fibonacci: **3 / 5 / 8 / 13 / 21**. Radius **8 / 13 / 21**. Type **Inter**, **400 / 500**. Dark canvas `#0a0a0a`. Light canvas `#fafafa`. Accent is the ink, not a stripe.

Widget cards, inspector, and collection chrome use these tokens. The graph canvas is the exception: it is a field, not a card.

---

## Read-only

The window does not create, edit, complete, drag, pin, or accept a link.

---

## Copy

Empty Recents and empty collections: **Nothing yet.** Empty open-tasks: **No open tasks.** Unlock errors: the copy already on the door.
