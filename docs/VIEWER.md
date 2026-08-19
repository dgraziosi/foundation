# Foundation Viewer — product UI contract

Operator-facing, read-only window on this vault. Same graph as MCP. Same API key. Not a second store.

This file is the clone-ready contract for how the window looks and works. An implementer ships the restyle from these surfaces, tokens, layout, states, and acceptance checks. The original SPEC is not a ceiling.

Visual system: **Core Theme** (calm-clarity). Tokens, type, density, and control rhythm come from that system. `MOMENTUM_STANDARD.md` is not present; this file is the product source. The window does not take on another product’s screens or feature set.

## What the operator opens it for

1. **The live graph, visually** — nodes and edges on a canvas. A list is not a graph.
2. **Easy search** across nodes.
3. **Recent additions** (and other recent writes).
4. **A detail pane that is easy to read.**
5. **Type-specific views only where they earn it.** Tasks as a board. No view per type.

The window does not write. No upsert, link, unlink, delete, undo, or ontology controls.

Off-box access is in scope. The operator may open `/view` from another machine on this vault. Unlock, cookie, and every surface must work on that origin. Do not ship localhost-only chrome or a localhost-only unlock.

## Starting point (keep)

Viewer v1 is live. Keep the door and the surfaces. Restyle them. Do not throw them away.

| Keep | Why |
| --- | --- |
| URL `/view` | One window on this process |
| Unlock with the MCP API key | Form sets an HttpOnly cookie, `Path=/view` |
| `Authorization: ApiKey …` still works | Agents and scripts unchanged |
| Cookie does not unlock `/mcp` or `/blobs/:id` | Cookie is not a write credential |
| `GET /view/blobs/:id` | Same bytes, attachment, scriptable types as `application/octet-stream` |
| Empty graph is empty, not an error | First-day vault is valid |
| Search by text, optional type, optional status | Hits show title, type, snippet, `data.due` when set |
| Node fields | Title, type, status, `data`, payload, neighbors, blob meta, `suggested_links` as proposals |
| Deep link `/view/nodes/:id` | Opens the shell with that node selected |
| No write controls | Read-only stays |

Surfaces stay: Unlock, Graph, Search, Recents, Tasks, Inspector.

## Surfaces

Five things the operator can open. Detail is a pane, not a sixth destination.

| Surface | Rail | What the operator sees |
| --- | --- | --- |
| **Unlock** | — | One field, one action, one error line. Then the shell. |
| **Graph** | Graph | Nodes and edges on a canvas. Default after unlock. |
| **Search** | Search | Query, type, status, results as rows. |
| **Recents** | Recents | Newest activity as rows. |
| **Tasks** | Tasks | Task nodes as a kanban. The only type-specific surface. |
| **Inspector** | — | Readable detail for the selected node. Right pane when a node is selected. |

### Unlock

Full viewport. No rail. No vault contents.

- Ground is **canvas**. The form sits on an **elevated card** (radius 21), centered, max width ~20rem.
- Title: **Unlock the vault window** — display M
- One password field (API key). One primary button: **Unlock** (neutral ink fill)
- One quiet line in secondary ink: same key as MCP; this window is read-only
- Wrong key: the same form, one error line under the field in **removed** ink — not a different page
- Success: cookie, then Graph

### Graph

The middle pane is a **canvas**, not a table.

**On the canvas**

- Each live node is a labeled mark: title (truncate), type as a small tag plus a Lucide glyph
- Type color is meaning: the glyph and tag use that type’s **ink**; the mark fill uses that type’s **tint**
- Each live edge is a line between two marks
- `child_of` is the stronger stroke (hierarchy) — ink, ~1.6px, solid
- Associative edges (`relates_to`, `supports`, `inspired_by`, `references`, `about`) are thinner, dashed, secondary ink
- Click a node: it becomes selected; the inspector fills
- Hover: title + type; no floating card stack
- Drag the canvas to pan; scroll or a control to zoom. Keep both obvious enough that a first open works
- A compact find field and a type select sit on the canvas (top of the middle pane). Typing highlights matching marks. This is search-in-place. It does not leave Graph unless the operator opens Search

**What Graph is not**

- Not a list of titles with “graph” in the heading
- Not a full dump of every node on first paint if the vault is large. Paint a working set: recent nodes plus the neighborhood of the selection, or a type filter the operator chose. Selecting a node expands its neighbors on the canvas
- Not an editor. No create-node, no draw-edge

**Empty Graph (first-day vault, seed types only, zero user nodes)**

Quiet canvas. One line, centered, secondary ink:

> Search the graph, or wait for a node to land.

No illustration. No fake nodes.

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

Same row rhythm as Search.

- Title: **Recents** — display M
- Rows from activity, newest first: summary (node title from the activity payload), action in secondary ink, type when known, relative time
- `create` and `update` on nodes are the rows that matter. Show `link` / `unlink` as “Linked A → B” / “Unlinked A → B” when both titles are there
- Click a node activity: select that node, fill the inspector
- No undo. No “confirm”. This is a log, not a toolbar

### Tasks (kanban)

The only type-specific surface. Status is already on every node.

**Board**

- Three columns: **Active** · **Completed** · **Archived**
- Each column is a card (radius 13, elevated surface, hairline)
- One card per `task`. Title, due chip when `data.due` is set, parent title when a `child_of` neighbor exists
- Overdue due chip uses **removed**. Today is ink. Future is secondary
- Click a card: select it, fill the inspector
- Read-only. Cards do not drag. Dragging would be a write

**Empty board**

One line in the Active column: **No tasks yet.** Other columns stay visible and empty.

**Not in this restyle**

- A second board by due bucket
- Boards for goals, habits, trips, journals, or any other type
- Swimlanes

Trip HTML itineraries, journal dates, and habit frequency stay as **inspector treatments**, not new rail items.

### Inspector

Right pane on the wide stop. Sheet on medium and narrow. This is where the operator reads a node.

**Always (selected node)**

1. **Header** — title (display S, wrap), type tag, status tag
2. **Due** — only when `data.due` is set (task / goal). Removed if overdue
3. **Data** — each key as a labeled row. Strings as text. Nested values as wrapped Inter at meta size. Empty: “No data fields.”
4. **Payload** — inline text as wrapped reading text (body, prose line-height). Blob: media type, size, sha256, **Fetch bytes** (same `/view/blobs/:id` rules). `text/html` inline: escaped readable text (safe). Do not execute it as a page
5. **Neighbors** — rows: neighbor title, relation, direction. Click selects that neighbor (canvas + inspector follow)
6. **Suggested links** — only if the list is non-empty. Copy: this window cannot create an edge

**Nothing selected**

Pane stays. One quiet line: **Select a node.**

**Not found** (`/view/nodes/:id` unknown or not a UUID)

Inspector title **Not found**. One line. Graph / Search still usable.

Do not lead with UUID. Do not lead with raw JSON. The operator came to read.

## Visual system

Three rules:

1. **Color is meaning.** Hue encodes node **type**. Chrome holds no hue.
2. **Color is chosen, not invented.** Types pick from the 17-hue library below. No ad-hoc hex.
3. **Structure follows Fibonacci.** Space, radius, and display sizes use that scale.

### Light and dark

Two lanes. **Dark is the first paint** and the default stored choice. Light is a full second theme on every surface (Unlock, Graph, Search, Recents, Tasks, Inspector). The operator switches with Light / Dark / System. System follows `prefers-color-scheme`.

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

**Purple is held off the type wheel.** It is not a seed type and is not a chrome accent in this window.

Unknown / untyped marks may use `#737373`. A live type never stays gray.

### Type → hue (seed types)

Same pill geometry for every type. Ink and tint come from the table. Authored types pick the least-used library hue (not purple, not gray).

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

Glyphs are Lucide, stroke 2, bare (no tinted tile behind chrome icons). On a type mark, the glyph is that type’s ink.

### Type

**Inter only.** Weights **400** and **500**. Hierarchy comes from size and tracking, not heavy weight. No mono. No serif. No second UI face. No proprietary display face.

Stack: `'Inter Variable', 'Inter', ui-sans-serif, system-ui, sans-serif`.

| Role | Size | Weight | Line | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| Display L | 34 | 500 | 1.1 | −0.01em | Not used in this window |
| Display M | 21 | 500 | 1.2 | −0.01em | Page titles (Search, Recents, Unlock) |
| Display S | 13 | 500 | 1.3 | 0 | Inspector title |
| Body | 15 | 400 | 1.6 | 0 | Reading text, payload prose |
| Body S | 13 | 400 | 1.6 | 0 | Compact chrome |
| Meta | 12 | 400 | inherit | 0 | Secondary lines, times, sha256, UUIDs |
| Label | 11 | 500 | inherit | 0.02em | Eyebrows, column headers |

Reading rhythms: UI 1.45, tool 1.4, prose 1.625. Payload uses prose. Rows and chrome use UI.

Do not use weight 600 or 700. Do not drop below 12px except the 11px label.

### Density

Fibonacci space:

| Step | px | Use |
| --- | --- | --- |
| xxs | 3 | Tight gaps inside chips |
| xs | 5 | Icon-to-label |
| sm | 8 | Control padding, row inset |
| md | 13 | Page padding (compact), stack gaps |
| lg | 21 | Page padding (wide), inspector padding |
| xl | 34 | Unlock card padding |
| 2xl | 55 | — |
| 3xl | 89 | — |

Radius:

| Step | px | Use |
| --- | --- | --- |
| sm / md | 8 | Controls, chips, list rows |
| lg / xl | 13 | Cards, board columns, elevated surfaces |
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

Icons: Lucide. Glyph 12 / 16 / 20 / 24. Rail glyphs 16. Type marks 16. Stroke 2.

### Components

Real primitives. Homemade unstyled controls fail.

Required chrome:

- **Button** — primary (ink fill), ghost (rows, rail), link (Fetch bytes, Close, Retry), chip / pill
- **Input** — Unlock, Search, find-on-canvas
- **Select** — type, status
- **Badge** — type (tint fill, ink text), status (outline), due (outline; overdue = removed)
- **Card** — Task columns, Unlock
- **Separator** — Inspector sections
- **Sheet** — Inspector on medium and narrow
- **Skeleton** — loading placeholders
- **Scroll area** — Inspector, long lists
- **Toggle** — Light / Dark / System
- **List row** — Search, Recents, neighbors
- **Empty state** — one quiet secondary line, no illustration
- **Tooltip** — rail labels when the rail is collapsed

No toast. No branded spinner. No second component kit. No unofficial design-kit clone.

## Layout

Rail + middle + inspector. The **page ground is canvas**. The **rail sits on inset**. The **middle is an elevated card** flush to the remaining viewport. The inspector is a column inside that card (wide) or a sheet over it (medium / narrow).

```text
┌──────────┬──────────────────────────────────┬─────────────────┐
│          │  Graph | Search | Recents        │                 │
│  Rail    │  ─────────────────────────────   │   Inspector     │
│  16rem   │                                  │   21rem         │
│  inset   │     middle (elevated card)       │   selected      │
│          │     canvas / rows / board        │   node          │
│          │                                  │                 │
└──────────┴──────────────────────────────────┴─────────────────┘
```

This is a **required layout change** for the visual system to work. A single flat field with a 180px rail and a 352px inspector on the same ground does not express canvas / inset / elevated. A permanent top icon strip on a narrow window does not match the rail overlay the system uses.

Do not add a second dock, a tab strip of extra destinations, or a floating composer. Those are other products. This window has four rail items and one inspector.

### Rail

Labeled width **16rem**. Collapsible to **56px** icon-only (24px glyph tile + padding). Collapse control in the rail header. Narrow: the rail is **off-canvas** (16rem overlay + scrim), opened from a chrome control — not a permanent top or bottom strip.

Order, top to bottom:

1. Graph (default) — Network
2. Search — Search
3. Recents — Clock
4. Tasks — CircleCheck

Selected item: active fill. Unselected: ink, quiet. Glyphs in ink, not type-colored.

Name at the top, small, secondary: **Foundation**. Not “the Vault.”

Theme control at the bottom: Light / Dark / System.

### Middle

- Graph → canvas (find field on the canvas, not a second page)
- Search / Recents → page title + controls + rows
- Tasks → column headers + cards (no page-level primary write button)

### Inspector

Wide: **21rem**, in flow, hairline on its left edge, scrolls independently. Not a modal.

Medium and narrow: **sheet**, radius 21, shadow 2xl, scrim. Selecting a node opens it. Close returns to the middle.

### Breakpoints

| Stop | Width | Layout |
| --- | --- | --- |
| Wide | ≥ 1280 | Rail (16rem, collapsible) + middle + inspector (21rem) |
| Medium | 900–1279 | Rail docked (16rem, collapsible) + middle. Inspector is a sheet over the middle |
| Narrow | < 900 | Rail off-canvas overlay + scrim. One surface in the middle. Inspector is a full-width sheet. Graph is still a canvas |

Off-box phones are later. This restyle must not *break* on a narrow window; it may stack. Do not design a separate mobile app.

## Key states

Every surface uses this set. Copy stays this quiet.

| State | What the operator sees |
| --- | --- |
| **Locked** | Unlock only. No graph peek |
| **Unlock error** | Same form. “API key required” (or the same sense). Field stays. Error in removed ink |
| **Loading** | Middle and inspector show skeleton placeholders. No spinner circus. No fake nodes |
| **Empty graph** | Canvas + the one line above. Search and Recents still open |
| **Empty recents** | “Nothing yet.” |
| **Empty search (not submitted)** | Field + “Search the graph, or filter by type.” |
| **No results** | “No matching nodes.” Field and type stay so the operator can change them |
| **Empty tasks** | Board chrome present. “No tasks yet.” in Active |
| **Nothing selected** | Inspector: “Select a node.” |
| **Selected** | Mark / row / card uses active fill or border-strong ring. Inspector filled |
| **Not found** | Inspector: “Not found.” |
| **Error (server)** | One line in the middle: “Could not load.” Retry is a text control, not a banner stack |

Do not toast. Do not confetti an empty vault.

## This restyle vs later

### This restyle — ship this

- Core Theme on every v1 surface: tokens, type, density, components, light and dark
- Dark first paint; Light and System as real choices
- Shell restyle: canvas / inset rail / elevated middle; 16rem rail; 21rem inspector; rail overlay on narrow; inspector sheet on medium and narrow
- Unlock, Graph, Search, Recents, Tasks, Inspector — same jobs, restyled
- Type hue + Lucide glyph on marks, tags, and board cards
- Off-box unlock and session (same key, same cookie path)
- Deep link `/view/nodes/:id` into the shell
- Keep every read-only and blob-safety rule

### Later — do not build these now

- Writes from the window (create, status change, drag-to-complete, accept a suggested link)
- A view per type (person directory, trip map, habit heatmap, journal calendar, …)
- Trip HTML as a live document (safe render can follow; not a rail item)
- Due-bucket board, swimlanes, filters for `origin` / `under` / `data_equals`
- Full-vault hairball, mini-map, clustering, embeddings
- Ontology browser, undo, activity “confirm”
- A separate mobile app
- Extra rail destinations, a second dock, or a write composer

If a later type view is proposed, it must beat a filtered Search + inspector. Tasks already do. Most types will not.

## How to tell the built UI matches

Review against **dark** (first paint) on a wide window first, then medium, then a narrow overlay. Then switch to light and judge that lane against the light tokens, not “light exists.” Use a vault with a handful of linked nodes of several types, at least one task with a due date, one blob node, and a first-day empty vault.

### Layout

- [ ] Wide: three columns — inset rail (16rem), elevated middle, inspector (21rem). Inspector is not a modal
- [ ] Page ground is canvas; rail is inset; middle is an elevated card. One flat field fails
- [ ] Graph’s middle is a canvas with visible nodes **and** edges. A list standing in for a graph fails
- [ ] Search / Recents are title + rows, not cards in a masonry
- [ ] Tasks is three columns, not a type-filtered list labeled “board”
- [ ] Medium: inspector is a sheet (radius 21); Graph is still a canvas
- [ ] Narrow: rail is an overlay with scrim, not a permanent icon strip; inspector is a sheet; Graph is still a canvas
- [ ] `/view/nodes/:id` opens the shell with that node selected

### Density and type

- [ ] Inter only, weights 400 and 500. No mono. No serif. No display face
- [ ] Page titles are display M (21 / 500). Inspector title is display S (13 / 500)
- [ ] Body 15 / 400. Meta 12. Label 11. No weight 600+
- [ ] Space and radius follow 3 / 5 / 8 / 13 / 21. Cards 13. Sheets and Unlock 21. Chips 8
- [ ] Rows ~42px. Type tags are one pill geometry; hue is the type, not decoration
- [ ] Inspector reads as an article: title, tags, labeled rows, wrapped payload. UUID and sha256 are Inter meta, not a headline and not a second face

### Color

- [ ] First paint is dark: canvas `#0a0a0a`, ink `#ffffff`, elevated `#171717`, accent `#ffffff`
- [ ] Light lane: canvas `#fafafa`, ink `#171717`, elevated `#ffffff`, accent `#171717`
- [ ] Both lanes cover Unlock, Graph, Search, Recents, Tasks, and Inspector
- [ ] Chrome accent is neutral ink — not a chromatic primary
- [ ] Seed types match the hue table (task green, area red, project blue, …)
- [ ] Overdue uses removed. Selected rail uses active fill. Focus uses border-strong
- [ ] Hairlines and tonal steps. No decorative shadows on resting board cards. Sheet and menus may lift

### Components and states

- [ ] Controls are real primitives (buttons, inputs, selects, badges, cards, sheet, skeleton, toggle). Homemade unstyled controls fail
- [ ] Empty graph: one line, no fake nodes, not an error
- [ ] Search with no query: the prompt, not “no results”
- [ ] Search miss: “No matching nodes.”
- [ ] Nothing selected: “Select a node.”
- [ ] Unlock miss: same form, error line in removed ink
- [ ] Loading: skeletons, not a branded spinner
- [ ] No write buttons anywhere (no Upsert, Delete, Link, Undo, Confirm)

If a screen fails more than two boxes, it is not this contract yet. Fix the shell before adding another view.
