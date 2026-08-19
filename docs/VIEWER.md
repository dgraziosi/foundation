# Foundation Viewer — product UI contract

Operator-facing, read-only window on this vault. Same graph as MCP. Same API key. Not a second store.

This file is the clone-ready contract for how the window looks and works. An implementer ships these surfaces, tokens, layout, states, and acceptance checks.

Visual system: **Core Theme** (calm-clarity). Tokens, type, density, and control rhythm come from that system. Hue and Lucide glyph belong on the **type**; the window reads them.

## What the operator opens it for

1. **Home** — bounded Recents, bounded open tasks, and a folder per live type. Landing page after unlock.
2. **The live graph, visually** — nodes **and** edges filling the remaining viewport. A list is not a graph. A clipped leftover widget is not a graph page.
3. **Easy search** across nodes.
4. **A type’s many** — one view engine. Each type declares which views apply. Not a unique app per type.
5. **A detail pane that is easy to read.**

The window does not write. No upsert, link, unlink, delete, undo, or ontology controls. No capture composer. No planner. No create, status change, drag-to-complete, or accept a link.

Off-box access is in scope. The operator may open `/view` from another machine on this vault. Unlock, cookie, and every surface must work on that origin. Do not ship localhost-only chrome or a localhost-only unlock.

## Starting point (keep)

Viewer v1 is live. Keep the door. Restyle Unlock, Home, Graph, Search, Recents, collection, and Inspector from this contract. Do not throw the door away.

| Keep | Why |
| --- | --- |
| URL `/view` | One window on this process |
| Unlock with the MCP API key | Form sets an HttpOnly cookie, `Path=/view` |
| `Authorization: ApiKey …` still works | Agents and scripts unchanged |
| Cookie does not unlock `/mcp` or `/blobs/:id` | Cookie is not a write credential |
| Split ports as they already are | MCP / health / agent blobs on `8787`; `/view` on `8788` |
| `GET /view/blobs/:id` | Same bytes, attachment, scriptable types as `application/octet-stream` |
| Empty graph is empty, not an error | First-day vault is valid |
| Search by text, optional type, optional status | Hits show title, type, snippet, `data.due` when set |
| Node fields | Title, type, status, `data`, payload, neighbors, blob meta, `suggested_links` as proposals |
| Deep link `/view/nodes/:id` | Opens the shell with that node selected in its type’s view engine at `default_view` |
| Type-declared views | `views` + `default_view` on the type. No Viewer-only picker |
| No write controls | Read-only stays |

## Surfaces

Rail destinations plus Home folders and the inspector pane. Detail is a pane, not a rail item.

Home is widgets and folders. Graph is its own page that fills the remaining viewport. That page is not a third Home widget, so a Graph rail item is not leftover — Home does not already show the graph.

Recents is a Home widget. **View all** opens the Recents page. Recents is not a rail item.

| Surface | Rail | What the operator sees |
| --- | --- | --- |
| **Unlock** | — | One field, one action, one error line. Then Home. |
| **Home** | Home | Recents widget, Open tasks widget, then a folder per live type. Default after unlock. |
| **Graph** | Graph | Nodes and edges on a canvas that fills the remaining middle pane. Also a view type inside the view engine. |
| **Search** | Search | Query, type, status, results as rows. |
| **Recents** | — | Newest activity as rows. Opened from Home **View all**, not from the rail. |
| **Collection** | — | A type’s many. Opened from a Home folder. One view engine. |
| **Inspector** | — | Readable detail for the selected node. Right pane when a node is selected. |

Type folders live on Home. Do not add a rail item per type. Do not add a types editor or an ontology editor. Do not add capture, composer, Today / Focus / Inbox, or any planner.

### Unlock

Full viewport. No rail. No vault contents.

- Ground is **canvas**. The form sits on an **elevated card** (radius 21), centered, max width ~20rem.
- Title: **Unlock the vault window** — display M
- One password field (API key). One primary button: **Unlock** (neutral ink fill)
- One quiet line in secondary ink: same key as MCP; this window is read-only
- Wrong key: the same form, one error line under the field in **removed** ink — not a different page
- Success: cookie, then Home

### Home

Landing page after unlock. Middle pane scrolls. Content sits in a centered column, max width `64rem`, page padding 21.

No greeting ritual. No streak. No habits widget. No capture field. No graph widget.

**Widgets** (read-only)

Two elevated cards in a row on wide (`sm` and up: two columns when both panels show). Narrow: stack. Gap 13. Radius 13. Cards stretch to the same height so the shorter card does not leave dead surface under **View all**.

Each card:

- Header: title (body S / 13 medium) plus a quiet count when the card has rows
- Body: fixed height, internal scroll. A long list never grows the page.
- Footer: full-width **View all** (ghost, hairline on top, meta). Pins to the bottom of the card.

#### Recents widget

Last **10** activity rows, newest first. Group those 10 by recency of `created_at` (local calendar day):

| Bucket | When |
| --- | --- |
| **Today** | Same local day |
| **Yesterday** | Previous local day |
| **Earlier this week** | 2–6 local days ago |
| **Earlier** | 7+ local days ago |

Empty buckets are omitted. Bucket headers scroll with the rows.

Row: summary (node title from the activity payload), action in secondary ink, type tag when known, relative time. Click: select that node, fill the inspector.

Overflow: rows after 10 do not appear here. **View all** opens Recents.

Body height: **160px** (`10rem`). Empty: **Nothing yet.** Loading: four skeleton rows at that height.

#### Open tasks widget

Every live `task` that matches that type’s **default-view filter** (seed: status active). No row cap. Group by due (`data.due`, local calendar day):

| Bucket | When |
| --- | --- |
| **Overdue** | Due before today |
| **Today** | Due today |
| **Upcoming** | Due after today |
| **No date** | No due |

Empty buckets are omitted. Within Overdue / Today / Upcoming: due ascending. Within No date: `updated_at` descending. Bucket headers scroll with the rows.

Row: title; due chip when a date role is set (overdue uses **removed**). No checkbox. Click: select the task, fill the inspector.

Overflow: the card scrolls internally. **View all** opens `task` in the view engine at its `default_view` (`board` on the seed).

Body height: **256px** (`16rem`). Empty: **No open tasks.** Loading: seven skeleton rows at that height.

#### Folders

Under a **Folders** label: one tile per live ontology type (seed and authored). Tile: type glyph (type ink, 24px), type label, live count. Same tile geometry for every type. Radius 13. Grid: 2 columns, 3 from `sm`, 4 from `lg`. Gap 13.

- Click a folder: open the collection for that type, at that type’s `default_view`. If the type declared no views, open the no-views state — not a fake List.
- Empty type (nodes): folder still shows, count 0. Opening it is a valid empty view, not an error.
- Folders are not rail destinations. The folder does not invent views the type did not declare.

**Empty Home (first-day vault)**

- Recents widget: **Nothing yet.**
- Open tasks widget: **No open tasks.**
- Folders still list every live type. No illustration. No fake nodes.

**What Home is not**

- Not Graph with a different heading
- Not a third widget that clips the graph
- Not a planner
- Not a composer
- Not a unique page per type

### Graph

Own destination. Default after unlock is Home; Graph is the canvas page.

The middle pane is a **column**: a compact find field, then the canvas. The canvas fills **all remaining height** in that pane (`flex: 1`, `min-height: 0`). Floor **460px**. A card of leftover height, a clipped widget, or a canvas that does not grow with the pane fails.

**On the canvas**

- Each live node is a mark. Color is the type’s ink. Radius grows with degree (about 3–8px). `area` marks are larger hubs with a halo in that type’s ink.
- Title paints on hover, on the hovered neighborhood, on `area` marks, and when zoomed in past ~1.6×. Truncate at 26 characters.
- **Each live edge is a line between two marks.** A canvas of marks with no edges fails.
- `child_of` is hierarchy: stronger stroke (~1px), solid, secondary ink
- Associative edges (`relates_to`, `supports`, `inspired_by`, `references`, `about`) are thinner (~0.6px), dashed `[2, 2]`, quieter secondary ink
- Layout is force-directed (charge, link, collide). Clusters emerge; do not pin a hierarchy.
- Click a node: it becomes selected; the inspector fills. Hover lights that node and its neighbors and dims the rest.
- Drag the canvas to pan; scroll or the zoom controls (in, out, fit) to zoom. A quiet hint sits on the canvas: drag to pan · scroll to zoom · click a node to read it · right-click for its local graph
- Find field on the canvas (not a second page). Typing keeps matching marks (title or type) and hides the rest; edges follow (both ends visible). This is search-in-place.
- Right-click a node: local graph of its neighborhood. Depth **1–4** (default **2**). A chip shows the focus title, a depth control, a node count, and **Exit local graph**.
- Type legend under the canvas: one dot per type present, in that type’s ink, plus the type label.
- Paint live nodes and live edges. Selecting a node expands neighborhood lighting; it does not replace missing edges.

**What Graph is not**

- Not a list of titles with “graph” in the heading
- Not a Home widget
- Not an editor. No create-node, no draw-edge

**Empty Graph (first-day vault, seed types only, zero user nodes)**

Quiet canvas. One line, centered, secondary ink:

> Search the graph, or wait for a node to land.

No illustration. No fake nodes.

Load miss: **Couldn't load your graph. Try again in a moment.** Retry is a text control.

### Search

Middle pane: title, field, rows.

- Title: **Search** — display M
- Primary control: text field, always focused on open
- Type select (ontology slugs, “Any” first)
- Status select (active / completed / archived / any)
- Leave `origin`, `data_equals`, `under`, and due-range filters for later. Do not build an advanced-search drawer
- Rows: title (ink, medium), type tag, due when set, one-line snippet in secondary ink
- Click a row: select it, fill the inspector. Do not navigate away from the shell
- Submitting with a type or status and no text is a list

### Recents

Same row rhythm as Search. Not a rail item.

- Title: **Recents** — display M
- Rows from activity, newest first: summary (node title from the activity payload), action in secondary ink, type when known, relative time
- `create` and `update` on nodes are the rows that matter. Show `link` / `unlink` as “Linked A → B” / “Unlinked A → B” when both titles are there
- Click a node activity: select that node, fill the inspector
- No undo. No “confirm”. This is a log, not a toolbar

### Collection (view engine)

How a type is shown. One shared pipeline. Not a unique app per type.

Opened from a Home folder (or from Open tasks **View all**). Middle pane: type title (display M) with that type’s glyph in type ink, a view switcher of **that type’s declared views**, then the active view. Click a node: select it, fill the inspector. No create control. No pin. Cards do not drag.

**View types** (the engine — closed set)

| Id | View | What the operator sees |
| --- | --- | --- |
| `list` | **List** | Title + subtitle chips + due when a date role is set. Same rhythm as Search. |
| `card` | **Card** | Wrapping grid of cards (radius 13). Glyph, title, status, subtitle chips, due when a date role is set. |
| `table` | **Table** | Columns: Title, Status, and the date-role field when the type has one. Click a row to select. |
| `board` | **Board** | Status columns from the type’s board query (filtered-out statuses are hidden). Seed `task` shows **Active**. Lane width **233px**. One card per node (radius 13): type glyph, title, due chip, parent title when a `child_of` neighbor exists. Read-only. Cards do not drag. Empty lane: **Empty**. |
| `calendar` | **Calendar** | Month grid. Nodes sit on the date or start role. A type with neither role shows **No date field on this type.** Nodes without that date do not appear. No create-on-day. |
| `timeline` | **Timeline** | Vertical chronological list by the date or start role. Same honest empty when the type has no date role. |
| `outline` | **Outline** | Tree by `child_of`. Roots of this type, children nested. Click a title to select. |
| `graph` | **Graph** | Canvas of this type’s nodes and their edges, same marks **and** edges as rail Graph. Scoped to the type. Fills remaining collection height. |

Do not invent a ninth view for a new type. A new type picks from this set.

#### Where the declaration lives

On the **type**, next to `slug`, `label`, `kind`, `parent_types`, and compiled `json_schema`:

| Field | Shape | Rule |
| --- | --- | --- |
| `fields` | Ordered field template | Roles bind collection chips, dates, and queries. Extra `data` keys still store. |
| `views` | Ordered declarations `{ id, filter?, sort?, group? }` | Engine ids from the table above, switcher order, plus the query for that surface. Empty or missing means no views. |
| `default_view` | One view id, or absent | Must be a member of those ids. If `views` is empty, omit it. |
| Hue | Library hue on the type | Marks, tags, folders, and cards read this. |
| Glyph | Lucide name on the type | Same surfaces read this. |

Defining a type includes setting these. The choice is part of the type, not a Viewer preference and not something to remember later. The window does not write the type; it reads the declaration. Session **Show completed** widens an active status filter for this window only and does not call `manage_type` or `upsert`.

**What to declare** (for the definer — Viewer does not infer this):

- `list`, `card`, `table`, `graph` — title is enough
- `board` — group/filter by status
- `calendar`, `timeline` — only when the type has a date or start role. A type with neither role shows an honest empty, not a fake `data.due`
- `outline` — only when the type participates in `child_of`

A task-like type typically takes `board` + `list` (and `calendar` / `timeline` when it has a date role). Viewer still only offers what that type actually declared.

#### What Viewer does with it

1. Resolve `views` to known engine ids, in declared order. Drop unknown ids. Keep each declaration’s filter / sort / group.
2. If none remain: **no-views state**. Do not invent `list`. Do not invent `board`.
3. If `default_view` is missing or not in the remaining set: use the first remaining id.
4. Paint the switcher with only those views. Active view uses active fill. Switching a view does not write.
5. Apply that view’s query (and optional session Show completed). Collection shows title plus subtitle-role chips — not the whole `data` bag.
6. Home folders and deep links use the same resolution. Opening a type never offers a view it did not declare. Home **Open tasks** uses the `task` default-view filter.

Rail **Graph** is the vault canvas, any type. View-engine `graph` is the same canvas language, scoped to one type, and only when that type declared `graph`.

#### Seed types (first paint)

Seed types already declare views so the first unlocked Home is not a wall of no-views. `task` keeps the current kanban as its default.

| Type | `views` | `default_view` |
| --- | --- | --- |
| task | `board`, `list`, `calendar`, `timeline`, `outline` | `board` |
| goal | `list`, `calendar`, `timeline`, `outline` | `list` |
| area | `list`, `outline` | `list` |
| project | `list`, `outline` | `list` |
| habit | `list`, `outline` | `list` |
| lesson | `list`, `outline` | `list` |
| decision | `list`, `outline` | `list` |
| person | `list` | `list` |
| place | `list` | `list` |
| company | `list` | `list` |
| journal | `list` | `list` |
| idea | `list` | `list` |
| note | `list` | `list` |
| trip | `list`, `calendar`, `timeline` | `list` |

Authored types get whatever their definer set. They do not inherit a hidden Viewer default.

#### Empty and no-views

**No views declared** (`views` empty, missing, or only unknown ids)

Type title stays. No switcher. One quiet line:

> No views declared for this type.

Not an error. Not a fake List. The folder still opened.

**Empty Board (`task`, when `board` is declared)**

Columns come from the board query. Seed first paint is Active only. One line in the Active column: **No tasks yet.** Filtered-out statuses are not shown.

**Empty other declared views**

One quiet line: **No {type} yet.** Type title and the switcher stay.

Trip HTML itineraries, journal dates, and habit frequency stay as **inspector treatments**, not new rail items and not unique view types.

### Inspector

Right pane on the wide stop. Sheet on medium and narrow. This is where the operator reads a node.

**Always (selected node)**

1. **Header** — title (display S, wrap), type tag (type glyph + label in type ink), status tag
2. **Template fields** — type `fields` in order. Date-role values use the due chip. A `ref` shows the live target title and is clickable
3. **Extra data** — remaining `data` keys after the template, labeled by key. Empty template and bag: “No data fields.”
4. **Payload** — inline text as wrapped reading text (body, prose line-height). Blob: media type, size, sha256, **Fetch bytes** (same `/view/blobs/:id` rules). `text/html` inline: escaped readable text (safe). Do not execute it as a page
5. **Neighbors** — rows: neighbor title, relation, direction, neighbor type glyph in that type’s ink. Click selects that neighbor (canvas + inspector follow)
6. **Suggested links** — only if the list is non-empty. Copy: this window cannot create an edge

**Nothing selected**

Pane stays. One quiet line: **Select a node.**

**Not found** (`/view/nodes/:id` unknown or not a UUID)

Inspector title **Not found**. One line. Home / Graph / Search still usable.

Do not lead with UUID. Do not lead with raw JSON. The operator came to read. No edit fields. No delete. No tag editor.

## Type identity

Iconography and color belong on the **type**. The window does not hardcode a type’s glyph or hue. Types carry those; Viewer reads them.

- **Hue** — one name from the 17-hue library. Soft **tint** (fills, washes) and vivid **ink** (glyphs, tags, marks).
- **Glyph** — Lucide PascalCase name, stroke 2, bare (no tinted tile).

A live type never stays gray. Unknown / untyped marks may use `#737373`.

**Purple is held off the type wheel.** It is not a seed type and is not a chrome accent in this window.

Seed types already carry this identity:

| Type | Hue | Glyph |
| --- | --- | --- |
| area | red | Compass |
| project | blue | Folder |
| goal | amber | Target |
| habit | violet | Repeat |
| task | green | CircleCheck |
| lesson | cyan | GraduationCap |
| person | rose | User |
| place | amber | MapPin |
| company | emerald | Building2 |
| journal | orange | NotebookPen |
| idea | fuchsia | Lightbulb |
| note | sky | FileText |
| trip | orange | Plane |
| decision | indigo | Split |

Authored types pick a library hue (not purple, not gray) and a Lucide glyph at definition — least-used hue when the definer does not pick. Viewer does not invent a second map.

## Visual system

Three rules:

1. **Color is meaning.** Hue encodes node **type**. Chrome holds no hue.
2. **Color is chosen, not invented.** Types pick from the 17-hue library below. No ad-hoc hex.
3. **Structure follows Fibonacci.** Space, radius, and display sizes use that scale.

### Light and dark

Two lanes. **Dark is the first paint** and the default stored choice. Light is a full second theme on every surface (Unlock, Home, Graph, Search, Recents, Collection, Inspector). The operator switches with Light / Dark / System. System follows `prefers-color-scheme`.

A stored “paper” choice, if any, reads as Light.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas (page ground) | `#fafafa` | `#0a0a0a` |
| Elevated / card | `#ffffff` | `#171717` |
| Inset / rail | `#f5f5f5` | `#171717` |
| Active / selected fill | `#e5e5e5` | `#262626` |
| Hairline | `#e5e5e5` | `#262626` |
| Ink | `#171717` | `#ffffff` |
| Secondary | `#737373` | `#a1a1a1` |
| Tertiary | `#a1a1a1` | `#737373` |
| Accent (primary action, focus, link) | `#171717` | `#ffffff` |
| On accent | `#ffffff` | `#0a0a0a` |
| Accent hover | `#404040` | `#e5e5e5` |
| Accent soft | `rgba(23, 23, 23, 0.06)` | `rgba(255, 255, 255, 0.10)` |
| Border strong (focus / selected ring) | `rgba(23, 23, 23, 0.28)` | `rgba(255, 255, 255, 0.24)` |
| Added | `#00a63e` | `#05df72` |
| Removed | `#e7000b` | `#ff6467` |
| Warning | `#e17100` | `#ffb900` |
| Info | `#0084d1` | `#00bcff` |

Accent is **neutral ink**. It holds no hue, so color stays reserved for types. Primary Unlock, links, and focus rings use it. Affordance comes from fill, shape, and weight.

Do not use a chromatic primary on chrome. Do not use a warm off-white canvas. Do not invent a third lane.

### Hue library

Soft **tint** (fills, washes) and vivid **ink** (glyphs, tags, marks). Light = tint 100 / ink 600. Dark = tint 950 / ink 400.

| Hue | Light tint | Light ink | Dark tint | Dark ink |
| --- | --- | --- | --- | --- |
| red | `#ffe2e2` | `#e7000b` | `#460809` | `#ff6467` |
| orange | `#ffedd4` | `#f54900` | `#441306` | `#ff8904` |
| amber | `#fef3c6` | `#e17100` | `#461901` | `#ffb900` |
| yellow | `#fef9c2` | `#d08700` | `#432004` | `#fcc800` |
| lime | `#ecfcca` | `#5ea500` | `#192e03` | `#9ae600` |
| green | `#dcfce7` | `#00a63e` | `#032e15` | `#05df72` |
| emerald | `#d0fae5` | `#009966` | `#002c22` | `#00d492` |
| teal | `#cbfbf1` | `#009689` | `#022f2e` | `#00d5be` |
| cyan | `#cefafe` | `#0092b8` | `#053345` | `#00d3f2` |
| sky | `#dff2fe` | `#0084d1` | `#052f4a` | `#00bcff` |
| blue | `#dbeafe` | `#155dfc` | `#162456` | `#51a2ff` |
| indigo | `#e0e7ff` | `#4f39f6` | `#1e1a4d` | `#7c86ff` |
| violet | `#ede9fe` | `#7f22fe` | `#2f0d68` | `#a684ff` |
| purple | `#f3e8ff` | `#9810fa` | `#3c0366` | `#c27aff` |
| fuchsia | `#fae8ff` | `#c800de` | `#4b004f` | `#ed6aff` |
| pink | `#fce7f3` | `#e60076` | `#510424` | `#fb64b6` |
| rose | `#ffe4e6` | `#ec003f` | `#4d0218` | `#ff637e` |

### Type

**Inter only.** Weights **400** and **500**. Hierarchy comes from size and tracking, not heavy weight. No mono. No serif. No second UI face. No proprietary display face.

Stack: `'Inter Variable', 'Inter', ui-sans-serif, system-ui, sans-serif`.

| Role | Size | Weight | Line | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| Display L | 34 | 500 | 1.1 | −0.01em | Not used in this window |
| Display M | 21 | 500 | 1.2 | −0.01em | Page titles (Home, Search, Recents, Unlock, type title in the collection) |
| Display S | 13 | 500 | 1.3 | 0 | Inspector title |
| Body | 15 | 400 | 1.6 | 0 | Reading text, payload prose |
| Body S | 13 | 400 | 1.6 | 0 | Compact chrome, widget titles |
| Meta | 12 | 400 | inherit | 0 | Secondary lines, times, sha256, UUIDs |
| Label | 11 | 500 | inherit | 0.02em | Eyebrows, column headers, folder section |

Reading rhythms: UI 1.45, tool 1.4, prose 1.625. Payload uses prose. Rows and chrome use UI.

Do not use weight 600 or 700. Do not drop below 12px except the 11px label.

### Density

Fibonacci space:

| Step | px | Use |
| --- | --- | --- |
| xxs | 3 | Tight gaps inside chips |
| xs | 5 | Icon-to-label |
| sm | 8 | Control padding, row inset |
| md | 13 | Page padding (compact), stack gaps, widget gap |
| lg | 21 | Page padding (wide), inspector padding |
| xl | 34 | Unlock card padding |
| 2xl | 55 | — |
| 3xl | 89 | — |

Radius:

| Step | px | Use |
| --- | --- | --- |
| sm / md | 8 | Controls, chips, list rows |
| lg / xl | 13 | Cards, board columns, elevated surfaces, Home widgets, folders |
| 2xl | 21 | Unlock card, inspector sheet, prominent surfaces |
| full | 9999 | Pills |

List rows: min-height 42, hairline under each row, title + meta. Selected row: active fill, not a chromatic ring.

Hairline: 0.5px (1px if the platform cannot paint 0.5), ink at 10% (or the hairline tokens above).

Resting cards: tonal step canvas → elevated + hairline. No decorative shadow on the board or inspector pane. Menus, selects, and the inspector sheet may use the elevation ladder:

| Level | Light | Dark |
| --- | --- | --- |
| xs | `0 1px 2px 0 rgba(20, 20, 19, 0.04)` | `0 1px 2px 0 rgba(0, 0, 0, 0.45)` |
| sm | `0 1px 2px 0 rgba(20, 20, 19, 0.05), 0 6px 18px 0 rgba(20, 20, 19, 0.06)` | `0 1px 2px 0 rgba(0, 0, 0, 0.55), 0 8px 24px 0 rgba(0, 0, 0, 0.55)` |
| 2xl | `0 8px 20px 0 rgba(20, 20, 19, 0.12), 0 28px 64px 0 rgba(20, 20, 19, 0.16)` | `0 8px 24px 0 rgba(0, 0, 0, 0.60), 0 32px 80px 0 rgba(0, 0, 0, 0.75)` |

Motion: fast 140ms, content 220ms, chrome 280ms. Easing: `cubic-bezier(0.32, 0.72, 0, 1)` for chrome. Sheet and rail overlay use chrome motion.

Icons: Lucide. Glyph 12 / 16 / 20 / 24. Rail glyphs 16. Type marks 16. Folder glyphs 24. Board card glyphs 20. Stroke 2. Bare glyph — no tinted chip behind it.

### Components

Real primitives. Homemade unstyled controls fail.

Required chrome:

- **Button** — primary (ink fill), ghost (rows, rail, View all), link (Fetch bytes, Close, Retry), chip / pill
- **Input** — Unlock, Search, find-on-canvas
- **Select** — type, status
- **Badge** — type (tint fill, ink text), status (outline), due (outline; overdue = removed)
- **Card** — Home widgets, type folders, Board columns, Unlock
- **Separator** — Inspector sections
- **Sheet** — Inspector on medium and narrow
- **Skeleton** — loading placeholders
- **Scroll area** — Inspector, long lists, Home, widget bodies
- **Toggle** — Light / Dark / System, collection view switcher
- **List row** — Search, Recents, neighbors, List view
- **Empty state** — one quiet secondary line, no illustration
- **Tooltip** — rail labels when the rail is collapsed
- **Slider** — Graph local-graph depth (1–4)

No toast. No branded spinner. No second component kit. No unofficial design-kit clone.

## Layout

Rail + middle + inspector. The **page ground is canvas**. The **rail sits on inset**. The **middle is an elevated card** flush to the remaining viewport. The inspector is a column inside that card (wide) or a sheet over it (medium / narrow).

```text
┌──────────┬──────────────────────────────────┬─────────────────┐
│          │  Home | Graph | Search           │                 │
│  Rail    │  ─────────────────────────────   │   Inspector     │
│  16rem   │                                  │   21rem         │
│  inset   │     middle (elevated card)       │   selected      │
│          │     widgets / canvas / engine    │   node          │
│          │                                  │                 │
└──────────┴──────────────────────────────────┴─────────────────┘
```

This is a **required layout change** for the visual system to work. A single flat field with a 180px rail and a 352px inspector on the same ground does not express canvas / inset / elevated. A permanent top icon strip on a narrow window does not match the rail overlay the system uses.

Do not add a second dock or a floating composer. This window has three rail items — Home, Graph, Search — plus the inspector. Recents is a Home widget. Type folders are on Home, not on the rail.

### Rail

Labeled width **16rem**. Collapsible to **56px** icon-only (24px glyph tile + padding). Collapse control in the rail header. Narrow: the rail is **off-canvas** (16rem overlay + scrim), opened from a chrome control — not a permanent top or bottom strip.

Order, top to bottom:

1. Home (default after unlock) — House
2. Graph — Waypoints
3. Search — Search

Selected item: active fill. Unselected: ink, quiet. Glyphs in ink, not type-colored.

Name at the top, small, secondary: **Foundation**. Not “the Vault.”

Theme control at the bottom: Light / Dark / System.

### Middle

- Home → Recents and Open tasks widgets, then the Folders grid. No graph widget.
- Graph → find field, then a canvas that **fills remaining height** (floor 460px)
- Search / Recents → page title + controls + rows
- Collection → type title + view switcher + the active view (no page-level write button). Collection `graph` fills remaining collection height the same way.

### Inspector

Wide: **21rem**, in flow, hairline on its left edge, scrolls independently. Not a modal.

Medium and narrow: **sheet**, radius 21, shadow 2xl, scrim. Selecting a node opens it. Close returns to the middle.

### Breakpoints

| Stop | Width | Layout |
| --- | --- | --- |
| Wide | ≥ 1280 | Rail (16rem, collapsible) + middle + inspector (21rem) |
| Medium | 900–1279 | Rail docked (16rem, collapsible) + middle. Inspector is a sheet over the middle |
| Narrow | < 900 | Rail off-canvas overlay + scrim. One surface in the middle. Home widgets stack; folders wrap. Inspector is a full-width sheet. Graph is still a canvas that fills remaining height |

Off-box phones are later. This restyle must not *break* on a narrow window; it may stack. Do not design a separate mobile app.

## Key states

Every surface uses this set. Copy stays this quiet.

| State | What the operator sees |
| --- | --- |
| **Locked** | Unlock only. No graph peek |
| **Unlock error** | Same form. “API key required” (or the same sense). Field stays. Error in removed ink |
| **Loading** | Middle and inspector show skeleton placeholders. Widget bodies keep their fixed height. No spinner circus. No fake nodes |
| **Empty Home** | Widgets show their empty lines. Type folders still list. Not an error |
| **Empty graph** | Canvas filling remaining height + the one line above. Home, Search still open |
| **Empty recents** | “Nothing yet.” Same copy in the Home Recents widget |
| **Empty search (not submitted)** | Field + “Search the graph, or filter by type.” |
| **No results** | “No matching nodes.” Field and type stay so the operator can change them |
| **Empty type** | Declared switcher stays. “No {type} yet.” |
| **No views declared** | Type title. No switcher. “No views declared for this type.” Not a fake List |
| **Empty Board (`task`)** | Board chrome for columns the query keeps. “No tasks yet.” in Active. Home Open tasks: “No open tasks.” |
| **Nothing selected** | Inspector: “Select a node.” |
| **Selected** | Mark / row / card uses active fill or border-strong ring. Inspector filled |
| **Not found** | Inspector: “Not found.” |
| **Error (server)** | One line in the middle: “Could not load.” Graph: “Couldn't load your graph. Try again in a moment.” Retry is a text control, not a banner stack |

Do not toast. Do not confetti an empty vault.

## This restyle vs later

### This restyle — ship this

- Core Theme on every surface: tokens, type, density, components, light and dark
- Dark first paint; Light and System as real choices
- Shell: canvas / inset rail / elevated middle; 16rem rail; 21rem inspector; rail overlay on narrow; inspector sheet on medium and narrow
- Unlock, then Home (Recents widget capped at 10, Open tasks widget at 256px with due buckets, type folders)
- Graph as its own page: canvas fills remaining viewport, live nodes **and** live edges
- Search on the rail. Recents from Home **View all**, not on the rail
- Inspector — same job, restyled; still read-only
- View engine: shared views (`list`, `card`, `table`, `board`, `calendar`, `timeline`, `outline`, `graph`). Each type declares view declarations and `default_view` on the type
- Seed types already declare views and first-paint queries. `task` declares `board` as default (active-only), plus `list`, `calendar`, `timeline`, and `outline`
- A type with no declared views opens an honest no-views state — Viewer does not invent a default
- Type hue + Lucide glyph **from the type** on marks, tags, folders, and cards
- Off-box unlock and session (same key, same cookie path)
- Deep link `/view/nodes/:id` into the shell — that node’s type in the view engine, inspector filled
- Keep every read-only and blob-safety rule

### Later — do not build these now

- Writes from the window (create, status change, drag-to-complete, accept a suggested link)
- A unique app per type (trip map, habit heatmap, journal calendar as its own destination)
- Capture composer, Today / Focus / Inbox, habits-due widget, or any planner on Home
- Types editor or ontology editor in this window (defining a type, including `views`, hue, and glyph, stays off this window)
- A Viewer-only view picker stored off the type
- Extra rail destinations (including Recents, a rail item per type, Inbox, Library)
- Trip HTML as a live document (safe render can follow; not a rail item)
- Due-bucket board, swimlanes, filters for `origin` / `under` / `data_equals`
- Full-vault clustering UI, mini-map, embeddings
- Undo, activity “confirm”
- A separate mobile app
- A second dock

If a later unique type app is proposed, it must beat the view engine + inspector. Board for `task` already does. Most types will not.

## How to tell the built UI matches

Review against **dark** (first paint) on a wide window first, then medium, then a narrow overlay. Then switch to light and judge that lane against the light tokens, not “light exists.” Use a vault with a handful of **linked** nodes of several types, at least one task with a due date, one blob node, and a first-day empty vault.

### Layout

- [ ] Wide: three columns — inset rail (16rem), elevated middle, inspector (21rem). Inspector is not a modal
- [ ] Page ground is canvas; rail is inset; middle is an elevated card. One flat field fails
- [ ] Unlock lands on Home, not Graph
- [ ] Rail order is Home, Graph, Search. No Recents rail item. No Tasks rail item. No type on the rail
- [ ] Home is Recents (cap 10, recency buckets, 160px body, View all) and Open tasks (due buckets, 256px body, View all) plus one folder per live ontology type
- [ ] Home has no graph widget. A clipped leftover canvas on Home fails
- [ ] A folder opens the collection for that type, not a unique app
- [ ] Graph’s middle is a canvas that fills remaining height (floor 460px) with visible nodes **and** edges. A list standing in for a graph fails. Marks with no edges fail
- [ ] Search is title + rows. Recents (from View all) is title + rows, not cards in a masonry
- [ ] `task` in the collection opens at `board`: status columns from the type query (Active on the seed), lane 233px, not a type-filtered list labeled “board”
- [ ] Calendar / timeline on a type with no date or start role: “No date field on this type.”
- [ ] Person collection shows the org chip, not the whole data bag
- [ ] Show completed is session chrome: completed appears, archived stays hidden, no graph write
- [ ] Seed types other than `task` open at their declared `default_view` (`list` in the seed table)
- [ ] View switcher shows only that type’s declared views — not the full engine, not inferred extras
- [ ] A type with empty `views` shows “No views declared for this type.” No fake List
- [ ] Graph exists on the rail; collection `graph` appears only when the type declared it, same marks and edges, scoped
- [ ] Medium: inspector is a sheet (radius 21); Graph is still a canvas that fills remaining height
- [ ] Narrow: rail is an overlay with scrim, not a permanent icon strip; inspector is a sheet; Graph is still a canvas that fills remaining height
- [ ] `/view/nodes/:id` opens the shell with that node selected in its type’s view engine at `default_view` (or the no-views state)

### Density and type

- [ ] Inter only, weights 400 and 500. No mono. No serif. No display face
- [ ] Page titles are display M (21 / 500). Inspector title is display S (13 / 500)
- [ ] Body 15 / 400. Meta 12. Label 11. No weight 600+
- [ ] Space and radius follow 3 / 5 / 8 / 13 / 21. Cards 13. Sheets and Unlock 21. Chips 8
- [ ] Rows ~42px. Type tags are one pill geometry; hue is the type, not decoration
- [ ] Inspector reads as an article: title, tags, labeled rows, wrapped payload. UUID and sha256 are Inter meta, not a headline and not a second face

### Color and icon

- [ ] First paint is dark: canvas `#0a0a0a`, ink `#ffffff`, elevated `#171717`, accent `#ffffff`
- [ ] Light lane: canvas `#fafafa`, ink `#171717`, elevated `#ffffff`, accent `#171717`
- [ ] Both lanes cover Unlock, Home, Graph, Search, Recents, Collection, and Inspector
- [ ] Chrome accent is neutral ink — not a chromatic primary
- [ ] Glyph and hue come from the type. Changing a type’s identity changes every mark, tag, folder, and card. The window does not keep a parallel map
- [ ] Seed types match the identity table (task green CircleCheck, area red Compass, project blue Folder, …)
- [ ] Overdue uses removed. Selected rail uses active fill. Focus uses border-strong
- [ ] Hairlines and tonal steps. No decorative shadows on resting board cards. Sheet and menus may lift
- [ ] Glyphs are bare Lucide, stroke 2. No tinted icon chip

### Widgets, graph, and states

- [ ] Recents widget shows at most 10 rows. An 11th recent is only on Recents after View all
- [ ] Recents widget groups those 10 as Today / Yesterday / Earlier this week / Earlier (empty buckets omitted)
- [ ] Open tasks widget lists every matching open task, grouped Overdue / Today / Upcoming / No date, and scrolls inside 256px. It does not grow the page
- [ ] Open tasks has no complete checkbox and does not change status
- [ ] Graph draws a line for each live edge among painted nodes. Hierarchy is the stronger solid stroke; associative is thinner dashed
- [ ] Empty Home: widgets empty, folders listed, not an error
- [ ] Empty graph: one line, no fake nodes, not an error, canvas still fills remaining height
- [ ] Search with no query: the prompt, not “no results”
- [ ] Search miss: “No matching nodes.”
- [ ] Nothing selected: “Select a node.”
- [ ] Unlock miss: same form, error line in removed ink
- [ ] Loading: skeletons, not a branded spinner
- [ ] No write buttons anywhere (no Upsert, Delete, Link, Undo, Confirm, complete, drag-to-complete)
- [ ] No capture composer. No Today / Focus / Inbox on Home. No habits-due widget

If a screen fails more than two boxes, it is not this contract yet. Fix the shell before adding another view.
