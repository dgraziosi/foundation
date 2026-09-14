# Viewer

Window on a running vault. Same ontology as MCP. Same objects. Same types. Same relations. The window writes with the same if-match and soft-delete family as MCP. Journal keeps a dedicated writing page. Other live records edit title, status, and declared scalar fields on the detail page.

Live at `/view`. The person types the vault key. When `FOUNDATION_VIEW_KEY` is set, that is the vault key; MCP keys do not open the window. When unset, the house key (`FOUNDATION_API_KEY` / named keys) still opens it. Session is an HttpOnly cookie, `Path=/view`. That cookie does not unlock `/mcp` or `/blobs/:id`. Ports: `8787` MCP, `8788` `/view`. Both doors bind localhost by default. Off-box is `VIEW_HOST=0.0.0.0`.

---

## What the window is

One chrome. A content host. Three surfaces. The ontology owns identity and which layouts a type may use. The person writes as the user.

| Surface | What it is |
| --- | --- |
| Home | Today, Recents, open tasks, and type folders. |
| Collection | One type's objects in the layout that type declared. |
| Detail | One object, as a page in the content host. Title, body, structure, properties. |

Search is chrome, not a fourth surface. Recents is a Home widget; **View all** opens the Recents page. The rail is Home and Search.

The window has no docked inspector. Properties live on the detail page.

---

## Scope

**In the window:** Home, Collection, Detail, Recents, Search, today's journal page, Activity, Trash.

**Not in the window:** onboarding, settings, capture, composer, Focus, Inbox, check-ins, health, library, an ontology editor, edge editing.

---

## Click

A click on a record or a graph node opens that object's **detail page** in the content host. The page fills the main pane. It does not open a pane beside Home or a collection.

That click comes from: a graph node, a Recents row, an open-task row, a collection row or card or cell or board card or calendar item or outline row, a search result, a related object on a detail page.

Right-click a graph node: local graph, depth **1–4**, default **2**.

---

## Chrome

**Left rail.** Logo, then Home, then Trash, then Search. Collapse to icons. Width **56px** collapsed, **224px** expanded. Theme toggle lives here.

Home opens Today, Recents, open tasks, and type folders. Trash lists soft-deleted records. Search opens the search overlay. Today is not a rail item.

**Content host.** View strip across the top of the main pane. Home is pinned. Opening a collection or a detail is a view in this strip. The active view fills the pane under the strip.

**Accent is the text color**, not a brand stripe. Active rail row is a quiet fill.

---

## Home

**Today.** Always on Home, even when the journal type has a zero count. Empty: **Write today** and the calendar day. After a first sentence, the first line of that prose. Open: today's journal page. Peek does not create a record.

**Recents.** Last **5** live objects that are not tasks, newest first. No status filter. Open and completed tasks both stay out — Recents is not an agenda. Grouped **Today / Yesterday / Earlier this week / Earlier**. Each row: type glyph, title, relative time. **View all** opens Recents. Empty: **Nothing yet.**

**Open tasks.** The `task` type's `default_view` filter, then the **5** most urgent of those, sorted overdue (oldest due first), today, upcoming (soonest first), then undated by title. Seed filter is `status = active`; completed and archived do not appear. Grouped **Overdue / Today / Upcoming / No date**. Each row: title and due date. **View all** opens the task collection (same type contract, no cap of 5). Empty: **No open tasks.** The widget reads the type. It does not invent a second filter.

**Type folders.** One folder per type that has live objects, in type-order. Types with a zero count do not appear. Each folder: type glyph, type color, type name, count of live objects of that type. Open: that type's collection, which applies the type's `default_view`.

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

Opened from a type folder, as a view in the content host. Page chrome: type glyph, type color, type name, count of objects in the active view after that view's filter. When the type has `parent_types`, a quiet line lists those allowed parents. Layout is the type's `default_view`, chosen from that type's `views`. Filter, sort, and group are that view's declarations. If the type names more than one view, the switcher lists only those names.

Layouts the type may name: list, card, table, board, calendar, timeline, outline, graph.

**List.** Split list. Type glyph, title, the properties that view names. A focused row may show a collection preview. Opening the row opens the detail page. The preview is collection chrome, not the detail surface.

**Card.** Title, snippet, properties. Open: detail page.

**Table.** Columns from the view. Sort and filter stay read-only. Open a row: detail page.

**Board.** One column per value of the grouping property. Column width **233px**. Open a card: detail page.

**Calendar / timeline.** Objects on their dates. Click: detail page.

**Outline.** Nested by the hierarchy relation. Open a row: detail page.

**Graph.** Directed graph scoped to this type. Floor **460px**. Click a node: detail page.

Empty collection: **Nothing yet.** Filtered to zero: **Nothing matches your filters.**

**Show completed** is collection session chrome. It widens an active status filter for this window only. It does not write. It does not change Home, Recents, or Search.

---

## Journal

A dated reflection. Opening a journal record opens a writing page, not the inspector. The day sits above the title. The title is the first line. The body is a live markdown document (shortcuts resolve in place, slash menu, block handles). One `text/markdown` payload. Autosave. Properties stay off the page. Save copy: **Saving**, **Saved**, **Couldn't save**. A clash offers **Reload** and keeps the draft on screen. An empty title shows **Keep a title** and writes the calendar-day title.

**Today.** From Home or the Journal collection, **Today** opens today's entry as the writing page. If none exists, the window creates one (writer is the user) and puts the cursor in the body. A deleted today entry stays deleted; Today makes a new one. Same record a bot can `get`. Updates use if-match. A clash does not overwrite. The cookie still does not unlock `/mcp`.

## Detail

A page in the content host. Not a docked inspector. Two columns fill the pane under the view strip. Journal uses the writing page instead.

**Document column.** Title is editable. Body, rendered: headings, lists, quotes, code, callouts, dividers. Callout kinds: note, info, tip, warning, danger. Then Structure, when the object has children (or an ancestor chain, when the type asks for that): an embedded collection, height at most half the viewport, only when there is something to show. Opening a child or ancestor opens that object's detail page.

**Properties column.** Belongs to this page. Floor **240px**. Collapsible. Type glyph, type hue, type name. When the type has `parent_types`, a quiet line reads those allowed parents from the same property the validator uses. Status is editable. The type's declared scalar, date, number, and enum fields are editable. Ref fields stay titles. When `data.url` is a well-formed https URL, Open leaves the window for that file. Related objects, grouped by relation; each row is a title; click opens that object's detail page. When that relation has `target_types`, the group shows those allowed targets. Location: the ancestor chain (live hierarchy-kind edges, not a frozen slug). Timestamps. Incoming and outgoing both show. Activity opens that record's activity. Move to trash soft-deletes the record. Open stays `data.url`. Url and repo: [`SPEC.md`](./SPEC.md#url-repo-and-link). Link is the edge tool. Edges do not edit from this page.

## Activity

Opened from a detail page. Lists that record's activity: action, who wrote, time, and a short what-changed line. A reversible row the person may undo offers **Undo**. Undo uses the same if-match and compensating-activity rules as MCP `undo`. A missing or stale if-match refuses and leaves the record as it is.

## Trash

Opened from the rail. Soft-deleted records, newest delete first. Each row: type glyph, title, deleted time. Empty: **Nothing in trash.** **Restore** returns the record to live (same family as MCP undo-of-delete). Blob bytes stay. Restored records leave Trash and return to Recents, collections, and search.

Closing the detail view activates the view to its left in the strip. Closing the last one returns to Home.

---

## Recents page

Opened from the Recents widget's **View all**. Same recency groups as the widget. Same non-task set. No status filter. No cap of 5. Each row opens the detail page.

---

## Search

Overlay from the rail. Query the vault. Optional type or status. No default filter. Results are objects. Click: detail page.

---

## Filters

The type owns `views`, `default_view`, `filter`, `sort`, and `group`. The window reads that contract. It does not invent a type catalog, and it does not add a Home-only status hide.

A view with no filter shows every live object of that type. A view that filters `status = active` hides completed and archived. Seed `task` and `goal` declare that filter on every view they name. Other seed types declare no status filter.

Completed tasks on Home Open tasks, while seed `task` still declares `status = active`, is a bug: the widget ignored the type.

| Surface | Default filter |
| --- | --- |
| Home Today | Live journal for today, if one exists. Peek does not create. Always shown. |
| Home Recents | Live objects that are not tasks. No status clause. Cap **5**, newest first. |
| Home Open tasks | The `task` type's `default_view` filter, then urgency, then cap **5**. Seed: `status = active`. |
| Home Type folders | Types with live objects. Count is live objects of that type. Open uses that type's `default_view`. |
| Recents page | Same as Home Recents. No cap of 5. |
| Tasks | Seed `default_view` is `board`. Views: board, list, calendar, timeline, outline. Each: filter `status = active`, sort date then title. Board groups by status. |
| Goals | Seed `default_view` is `list`. Views: list, calendar, timeline, outline. Each: filter `status = active`, sort date then title. |
| Trip | Seed `default_view` is `list`. Views: list, calendar, timeline. No status filter. Sort start then title. |
| Area, project, habit, lesson, decision | Seed `default_view` is `list`. Views: list, outline. No status filter. Sort title. |
| Person, place, company, journal, idea, note, spend | Seed `default_view` is `list`. One view: list. No status filter. Sort title. |
| Authored types | The views that type declared. Empty views: **No views declared for this type.** |
| Search | No default filter. The overlay may pass type or status. |
| Detail | One object. Status edits on the page. No list filter. |
| Activity | That object's activity. Newest first. |
| Trash | Soft-deleted objects. Newest delete first. |

---

## Type identity

The window does not hardcode a type's hue or glyph. Folders, graph nodes, collection rows, and the detail page show whatever types the ontology has.

Seed and authored types carry hue and glyph on the type, same as they carry `views`, `default_view`, and each view's filter, sort, and group. The window reads them.

If a type has no hue or glyph yet, the window uses a quiet fallback: neutral ink, a generic mark. It does not invent a special page.

---

## Tokens

Space on Fibonacci: **3 / 5 / 8 / 13 / 21**. Radius **8 / 13 / 21**. Type **Inter**, **400 / 500**. Dark canvas `#0a0a0a`. Light canvas `#fafafa`. Accent is the ink, not a stripe.

Widget cards, collection chrome, and the detail page use these tokens. The graph canvas is the exception: it is a field, not a card.

---

## Writes

Same if-match as MCP (`base_updated_at`). Writer is the user (`actor=user`, label Viewer). A clash offers **Reload** and keeps the draft. An empty-required title refuses with **Keep a title** / **Title is required.**

Journal stays the writing page for title and markdown body. Other live records save title, status, and declared scalar fields on detail. The window does not complete, drag, pin, accept a link, or edit edges. Unique identity fields (`url` / `repo` / `receipt`) follow the same uniqueness refuses as MCP upsert.

Soft-delete uses the same delete family as MCP. Restore uses undo-of-delete when that row is still reversible.

---

## Copy

Empty Recents and empty collections: **Nothing yet.** Empty open-tasks: **No open tasks.** Filtered collection: **Nothing matches your filters.** Empty Home Today: **Write today** and the calendar day. Empty Trash: **Nothing in trash.** Unlock title: **Unlock.** The field is the vault key. Unlock error: **That key did not unlock.**
