# Foundation Viewer — design plan

Operator-facing, read-only window on this vault. Same graph as MCP. Same API key. Not a second store.

This plan is what to ship. It starts from the live `/view` in this repo (PR #27) and goes past that first window. The original SPEC is not a ceiling.

An implementer should be able to build the UI from this file without inventing layout, density, or which surfaces exist.

## What the operator opens it for

1. **The live graph, visually** — nodes and edges on a canvas. A list is not a graph.
2. **Easy search** across nodes.
3. **Recent additions** (and other recent writes).
4. **A detail pane that is easy to read.**
5. **Type-specific views only where they earn it.** v1: tasks as a board. No view per type.

The window does not write. No upsert, link, unlink, delete, undo, or ontology controls.

Off-box access is in scope. The operator may open `/view` from another machine on this vault. Unlock, cookie, and every surface must work on that origin. Do not ship localhost-only chrome or a localhost-only unlock.

## Starting point (keep)

The live window already has the right door. Keep these. Restyle them. Do not throw them away.

| Keep | Why |
| --- | --- |
| URL `/view` | One window on this process |
| Unlock with the MCP API key | Form sets an HttpOnly cookie, `Path=/view` |
| `Authorization: ApiKey …` still works | Agents and scripts unchanged |
| Cookie does not unlock `/mcp` or `/blobs/:id` | Cookie is not a write credential |
| `GET /view/blobs/:id` | Same bytes, attachment, scriptable types as `application/octet-stream` |
| Empty graph is empty, not an error | First-day vault is valid |
| Search by text and optional type | Hits show title, type, `data.due` when set |
| Node fields | Title, type, status, `data`, payload, neighbors, blob meta, `suggested_links` as proposals |
| No write controls | Read-only stays |

What the first window is missing, and this plan adds: a real graph canvas, a three-pane shell, recents, a readable inspector, and a tasks board.

## Surfaces

Five things the operator can open. Detail is a pane, not a sixth destination.

| Surface | Rail | What the operator sees |
| --- | --- | --- |
| **Unlock** | — | One field, one action, one error line. Then the shell. |
| **Graph** | Graph | Nodes and edges on a canvas. Default after unlock. |
| **Search** | Search | Query, type, results as rows. |
| **Recents** | Recents | Newest activity as rows. |
| **Tasks** | Tasks | Task nodes as a kanban. The only type-specific surface in v1. |
| **Inspector** | — | Readable detail for the selected node. Always the right pane when a node is selected. |

Deep link `/view/nodes/:id` still works: open the shell with that node selected and the inspector filled. Prefer Graph behind it. Do not return to a standalone article page as the only way to read a node.

### Unlock

Full viewport. Paper field. No rail.

- Title: **Unlock the vault window**
- One password field (API key). One primary button: **Unlock**
- One quiet line: same key as MCP; this window is read-only
- Wrong key: the same form, one error line under the field — not a different page
- Success: cookie, then Graph

No other chrome. No vault contents on this screen.

### Graph

This is the reason the window exists. The middle pane is a **canvas**, not a table.

**On the canvas**

- Each live node is a labeled mark: title on the mark (truncate), type as a small tag
- Each live edge is a line between two marks
- `child_of` is the stronger stroke (hierarchy)
- Associative edges (`relates_to`, `supports`, `inspired_by`, `references`, `about`) are thinner or dashed
- Click a node: it becomes selected; the inspector fills
- Hover: title + type; no floating card stack
- Drag the canvas to pan; scroll or a control to zoom. Keep both obvious and unlabeled-enough that a first open works
- A compact find field sits on the canvas (top of the middle pane). Typing highlights matching marks. This is search-in-place. It does not leave Graph unless the operator opens Search

**What Graph is not**

- Not a list of titles with “graph” in the heading
- Not a full dump of every node on first paint if the vault is large. Paint a working set: recent nodes plus the neighborhood of the selection, or a type filter the operator chose. Selecting a node expands its neighbors on the canvas
- Not an editor. No create-node, no draw-edge

**Empty Graph (first-day vault, seed types only, zero user nodes)**

Quiet canvas. One line, centered, ink at secondary strength:

> Search the graph, or wait for a node to land.

No illustration. No fake nodes.

### Search

Evolves the PR #27 home. Middle pane: title, field, rows.

- Title: **Search**
- Primary control: text field, always focused on open
- Secondary: type select (ontology slugs, “Any” first — same idea as today)
- v1 also earns a status filter (active / completed / archived / any). Cheap, useful, already on `search`
- Leave `origin`, `data_equals`, `under`, and due-range filters for later. Do not build an advanced-search drawer in v1
- Rows: title (ink, semibold), type tag, due when set, one-line snippet
- Click a row: select it, fill the inspector. Do not navigate away from the shell
- Submitting with a type and no text is a list, same as today

### Recents

New. Same row rhythm as Search.

- Title: **Recents**
- Rows from activity, newest first: action, node title (from the activity payload), type when known, relative time
- `create` and `update` on nodes are the rows that matter. Show `link` / `unlink` as “Linked A → B” / “Unlinked A → B” when both titles are there
- Click a node activity: select that node, fill the inspector
- No undo. No “confirm”. This is a log, not a toolbar

### Tasks (kanban)

The only type-specific surface in v1. Status is already on every node. A board earns its space because an operator looking at work thinks in columns, not in a type-filtered list.

**Board**

- Three columns: **Active** · **Completed** · **Archived**
- One card per `task`. Title, due chip when `data.due` is set, parent title when a `child_of` neighbor exists
- Overdue due chip uses accent. Today is ink. Future is secondary
- Click a card: select it, fill the inspector
- Read-only. Cards do not drag. Dragging would be a write

**Empty board**

One line in the Active column: **No tasks yet.** Other columns stay visible and empty.

**Not in v1**

- A second board by due bucket
- Boards for goals, habits, trips, journals, or any other type
- Swimlanes

Trip HTML itineraries, journal dates, and habit frequency stay as **inspector treatments**, not new rail items.

### Inspector

Right pane. This replaces the PR #27 node article as the place the operator reads.

**Always (selected node)**

1. **Header** — title (readable size, wrap), type tag, status tag
2. **Due** — only when `data.due` is set (task / goal). Accent if overdue
3. **Data** — each key as a labeled row. Strings as text. Nested values as a mono block. Empty: “No data fields.”
4. **Payload** — inline text as wrapped reading text, not a dump in a tiny box. Blob: media type, size, sha256, **Fetch bytes** (same `/view/blobs/:id` rules as today). `text/html` inline: show as escaped readable text in v1 (safe). Do not execute it as a page
5. **Neighbors** — rows: neighbor title, relation, direction. Click selects that neighbor (canvas + inspector follow)
6. **Suggested links** — only if the list is non-empty. Same proposal copy as today: this window cannot create an edge

**Nothing selected**

Pane stays. One quiet line: **Select a node.**

**Not found** (`/view/nodes/:id` unknown or not a UUID)

Inspector title **Not found**. One line. Graph / Search still usable.

Do not lead with UUID. Do not lead with raw JSON. The operator came to read.

## Shell and layout

Rail + middle + inspector. Paper is the first paint. Dark is a real second theme on every surface.

```text
┌────┬──────────────────────────────┬─────────────────┐
│    │  Graph | Search | Recents    │                 │
│ R  │  ─────────────────────────   │   Inspector     │
│ A  │                              │                 │
│ I  │     middle surface           │   selected      │
│ L  │     (canvas / rows / board)  │   node          │
│    │                              │                 │
└────┴──────────────────────────────┴─────────────────┘
```

### Rail

Narrow. ~52px at the compact stop, ~180px if labels show.

Order, top to bottom:

1. Graph (default)
2. Search
3. Recents
4. Tasks

Selected item: accent mark (left hairline or fill at low strength), not a neon block. Unselected: ink, quiet.

No logo wordmark required. If a name appears, it is **Foundation**, small, top of the rail. Not “the Vault.”

### Middle

- Graph → canvas (find field on the canvas, not a second page)
- Search / Recents → page title + controls + rows
- Tasks → column headers + cards (no page-level primary write button; there is nothing to create here)

### Inspector

Fixed width on the wide stop. Scrolls independently. Hairline on its left edge. No modal.

### Breakpoints

| Stop | Width | Layout |
| --- | --- | --- |
| Wide | ≥ 1280 | Rail + middle + inspector (~320–380px) |
| Medium | 900–1279 | Rail + middle. Inspector is a right drawer over the middle. Selecting a node opens it. A close control returns to the middle |
| Narrow | < 900 | Rail becomes a top or bottom icon strip. One surface at a time. Inspector is a full sheet over the surface. Graph is still a canvas, never a list standing in for a graph |

Off-box phones are later. v1 must not *break* on a narrow window; it may stack. Do not design a separate mobile app.

### Density

Row height ~36–40px. Body ~13px. Meta ~12px. Page titles ~18–22px, not display type. Padding 8 / 12 / 16. Hairline rules at ink ~10% on paper (and the inverse on dark). Accent on one thing at a time: the primary unlock button, the selected rail item, an overdue chip, a selected mark. Tight. No marketing whitespace. Lists are title + meta + trailing tag. Graph is canvas first, not a table first. The inspector is a column, not a dialog.

## Color, type, two lanes

**Paper is the default lane and the first paint.** Dark is a real v1 theme on every surface (Unlock, Graph, Search, Recents, Tasks, Inspector), not a later add-on and not a single inverted screen. The operator can switch lanes with a toggle and/or follow system preference.

| Token | Paper (default) | Dark |
| --- | --- | --- |
| Background | `#f7f7f4` | `#14120b` |
| Ink | `#26251e` | `#edecec` |
| Accent | `#f54e00` | `#f54e00` |
| Rule | ink at ~10% | ink at ~12% |
| Cards / surface lift | paper, no shadow | `#1b1913` |

No gradients. No box shadows. No glow. Flat surfaces, hairlines.

**Fonts**

- UI: **Inter** or **Geist** (one, not both)
- Mono: one OFL-licensed mono (Geist Mono, IBM Plex Mono, or Source Code Pro). Use it for UUIDs, sha256, nested `data`, payload that is not prose
- Do not use a display serif for UI

**Type tags**

One quiet pill per type (task, note, person, …). Same geometry for every type. Do not assign a rainbow. Accent is not “every type color.”

## Key states

Every surface uses this set. Copy stays this quiet.

| State | What the operator sees |
| --- | --- |
| **Locked** | Unlock only. No graph peek |
| **Unlock error** | Same form. “API key required” (or the same sense). Field stays |
| **Loading** | Middle and inspector show a faint pulse or three hairline placeholders. No spinner circus. No fake nodes |
| **Empty graph** | Canvas + the one line above. Search and Recents still open |
| **Empty recents** | “Nothing yet.” |
| **Empty search (not submitted)** | Field + “Search the graph, or filter by type.” |
| **No results** | “No matching nodes.” Field and type stay so the operator can change them |
| **Empty tasks** | Board chrome present. “No tasks yet.” in Active |
| **Nothing selected** | Inspector: “Select a node.” |
| **Selected** | Mark / row / card uses a 1px accent or ink ring. Inspector filled |
| **Not found** | Inspector: “Not found.” |
| **Error (server)** | One line in the middle: “Could not load.” Retry is a text control, not a banner stack |

Do not toast. Do not confetti an empty vault.

## v1 vs later

### v1 — ship this

- Paper shell: rail + middle + inspector, breakpoints above
- Unlock, restyled
- Graph canvas (nodes, edges, select, find-on-canvas, pan/zoom)
- Search (text, type, status)
- Recents (activity rows)
- Inspector (readable detail; blob fetch; neighbors; proposals)
- Tasks board (three status columns, read-only)
- Dark theme on every v1 surface (operator toggle and/or system preference). Paper remains the first paint. Do not drop a v1 surface to fit it.
- Off-box unlock and session (same key, same cookie path)
- Deep link `/view/nodes/:id` into the shell
- Keep every read-only and blob-safety rule from the first window

### Later — do not build these now

- Writes from the window (create, status change, drag-to-complete, accept a suggested link)
- A view per type (person directory, trip map, habit heatmap, journal calendar, …)
- Trip HTML as a live document (safe render can follow; not a rail item)
- Due-bucket board, swimlanes, filters for `origin` / `under` / `data_equals`
- Full-vault hairball, mini-map, clustering, embeddings
- Ontology browser, undo, activity “confirm”
- A separate mobile app

If a later type view is proposed, it must beat a filtered Search + inspector. Tasks already do. Most types will not.

## Stack (only what the UI needs)

React. Boring, well-known quantities that coding agents already write well.

- **Vite + React + TypeScript** — one app, served at `/view`
- **React Router** — Graph, Search, Recents, Tasks, `/view/nodes/:id`
- **TanStack Query** — reads
- **shadcn/ui + Tailwind** — chrome, not a second design system. Map shadcn theme tokens to the paper and dark hex values in this file (paper `#f7f7f4` / `#26251e` / `#f54e00`, dark `#14120b` / `#edecec` / cards `#1b1913`, accent `#f54e00`)
- **Real primitives** for buttons, inputs, selects, badges, separators, cards, and the theme toggle. Do not hand-roll raw inputs, square 1px boxes, or homemade pills
- Density numbers stay (rows ~36–40px, body ~13px). Default shadcn radius and focus rings are allowed so the window is not a 1px student form
- **One well-known 2D graph library** (react-force-graph-2d or equivalent) for the canvas only. Chrome around the canvas is shadcn. Do not write a WebGL engine
- **No drag library in v1** — the board does not write
- **No design-system package besides shadcn.** No Next.js, no custom framework, no second backend. Still no writes

The HTML string pages in the first window go away. Unlock, cookie, and blob routes stay on this process.

## How to tell the built UI matches this plan

Review against paper (default first paint) on a wide window first, then medium, then a narrow stack. Then switch to dark and judge that lane against the dark tokens, not “dark exists.” Use a vault with a handful of linked nodes, at least one task with a due date, one blob node, and a first-day empty vault.

### Layout

- [ ] Wide: three columns — rail, middle, inspector. Inspector ~320–380px, not a modal
- [ ] Graph’s middle is a canvas with visible nodes **and** edges. A list standing in for a graph fails
- [ ] Controls are shadcn primitives (buttons, inputs, selects, badges, separators, cards, theme toggle). Homemade unstyled controls fail, same as Graph-as-a-list
- [ ] Search / Recents are title + rows, not cards in a masonry
- [ ] Tasks is three columns, not a type-filtered list labeled “board”
- [ ] Medium: inspector is a drawer; Graph is still a canvas
- [ ] Narrow: one surface; inspector is a sheet; Graph is still a canvas
- [ ] `/view/nodes/:id` opens the shell with that node selected

### Density and type

- [ ] Rows ~36–40px. Body ~13px. Meta ~12px. Titles are page titles, not hero type
- [ ] Default shadcn radius and focus rings are present. Square 1px boxes and raw unstyled inputs fail
- [ ] Inter or Geist + one OFL mono. No display serif in the chrome
- [ ] Type tags are quiet pills, not a rainbow
- [ ] Inspector reads as an article: title, tags, labeled rows, wrapped payload. UUID and sha256 are mono, not the headline

### Color

- [ ] First paint is paper: background `#f7f7f4`, ink `#26251e`, accent `#f54e00`
- [ ] Dark lane: background `#14120b`, ink `#edecec`, cards / surface lift `#1b1913`, accent `#f54e00`
- [ ] Dark is a real theme on Unlock, Graph, Search, Recents, Tasks, and Inspector — not a single inverted screen
- [ ] Accent appears on the selected rail item, Unlock, overdue, and selection — not on every border
- [ ] Hairlines, no decorative shadows or gradients. Default shadcn focus rings are allowed

### States

- [ ] Empty graph: one line, no fake nodes, not an error
- [ ] Search with no query: the prompt, not “no results”
- [ ] Search miss: “No matching nodes.”
- [ ] Nothing selected: “Select a node.”
- [ ] Unlock miss: same form, error line
- [ ] Loading: placeholders, not a branded spinner
- [ ] No write buttons anywhere (no Upsert, Delete, Link, Undo, Confirm)

If a screen fails more than two boxes, it is not this plan yet. Fix the shell before adding another view.
