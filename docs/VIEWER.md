# Foundation Viewer

Read-only window on this vault. Same graph as MCP. Same API key. Not a second store.

The operator opens `/view` to see the live graph, search nodes, read recent activity, open a task board, and inspect a selected node. The window does not write: no upsert, link, unlink, delete, undo, or ontology controls.

Off-box access is in scope. Unlock, cookie, and every surface work from another machine on this vault.

## Door

| Rule | Fact |
| --- | --- |
| URL | `/view` on this process |
| Unlock | MCP API key. Form sets an HttpOnly cookie, `Path=/view` |
| Header | `Authorization: ApiKey …` still works |
| Cookie scope | Does not unlock `/mcp` or `/blobs/:id` |
| Blobs | `GET /view/blobs/:id` — same bytes, attachment; scriptable types as `application/octet-stream` |
| Empty graph | Empty, not an error |
| Search | Text and optional type; hits show title, type, `data.due` when set |
| Node fields | Title, type, status, `data`, payload, neighbors, blob meta, `suggested_links` as proposals |
| Writes | None |

## Surfaces

Detail is a pane, not a sixth destination.

| Surface | Rail | What the operator sees |
| --- | --- | --- |
| **Unlock** | — | One field, one action, one error line. Then the shell. |
| **Graph** | Graph | Nodes and edges on a canvas. Default after unlock. |
| **Search** | Search | Query, type, results as rows. |
| **Recents** | Recents | Newest activity as rows. |
| **Tasks** | Tasks | Task nodes as a kanban. The only type-specific surface. |
| **Inspector** | — | Readable detail for the selected node. Right pane when a node is selected. |

Deep link `/view/nodes/:id` opens the shell with that node selected and the inspector filled, Graph behind it.

### Unlock

Full viewport. Paper field. No rail.

- Title: **Unlock the vault window**
- One password field (API key). One primary button: **Unlock**
- One quiet line: same key as MCP; this window is read-only
- Wrong key: the same form, one error line under the field
- Success: cookie, then Graph

No other chrome. No vault contents on this screen.

### Graph

The middle pane is a **canvas**, not a table.

- Each live node is a labeled mark: title on the mark (truncate), type as a small tag
- Each live edge is a line between two marks
- `child_of` is the stronger stroke (hierarchy)
- Associative edges (`relates_to`, `supports`, `inspired_by`, `references`, `about`) are thinner or dashed
- Click a node: it becomes selected; the inspector fills
- Hover: title + type; no floating card stack
- Drag the canvas to pan; scroll or a control to zoom
- A compact find field sits on the canvas (top of the middle pane). Typing highlights matching marks. This does not leave Graph unless the operator opens Search
- Working set: recent nodes plus the neighborhood of the selection, or a type filter the operator chose. Selecting a node expands its neighbors
- Not an editor. No create-node, no draw-edge

**Empty Graph** (seed types only, zero user nodes): quiet canvas. One line, centered, ink at secondary strength:

> Search the graph, or wait for a node to land.

No illustration. No fake nodes.

### Search

Title, field, rows.

- Title: **Search**
- Primary control: text field, focused on open
- Type select (ontology slugs, “Any” first)
- Status filter: active / completed / archived / any
- Rows: title (ink, semibold), type tag, due when set, one-line snippet
- Click a row: select it, fill the inspector. Stay in the shell
- Submitting with a type and no text is a list

`origin`, `data_equals`, `under`, and due-range filters are not on this surface.

### Recents

Same row rhythm as Search.

- Title: **Recents**
- Rows from activity, newest first: action, node title (from the activity payload), type when known, relative time
- `create` and `update` on nodes are the rows that matter. `link` / `unlink` show as “Linked A → B” / “Unlinked A → B” when both titles are there
- Click a node activity: select that node, fill the inspector
- No undo. No “confirm”. This is a log

### Tasks

The only type-specific surface. Three columns: **Active** · **Completed** · **Archived**.

- One card per `task`. Title, due chip when `data.due` is set, parent title when a `child_of` neighbor exists
- Overdue due chip uses accent. Today is ink. Future is secondary
- Click a card: select it, fill the inspector
- Read-only. Cards do not drag

**Empty board:** one line in Active: **No tasks yet.** Other columns stay visible and empty.

No second board by due bucket. No boards for other types. No swimlanes. Trip HTML, journal dates, and habit frequency are inspector treatments, not rail items.

### Inspector

Right pane.

**Selected node**

1. **Header** — title (readable size, wrap), type tag, status tag
2. **Due** — only when `data.due` is set (task / goal). Accent if overdue
3. **Data** — each key as a labeled row. Strings as text. Nested values as a mono block. Empty: “No data fields.”
4. **Payload** — inline text as wrapped reading text. Blob: media type, size, sha256, **Fetch bytes** (`GET /view/blobs/:id`). `text/html` inline: escaped readable text. Do not execute it as a page
5. **Neighbors** — rows: neighbor title, relation, direction. Click selects that neighbor (canvas + inspector follow)
6. **Suggested links** — only if non-empty. Proposals only. This window cannot create an edge

**Nothing selected:** pane stays. **Select a node.**

**Not found** (`/view/nodes/:id` unknown or not a UUID): inspector title **Not found**. One line. Graph / Search stay usable.

Do not lead with UUID. Do not lead with raw JSON.

## Shell and layout

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

Order, top to bottom: Graph (default), Search, Recents, Tasks.

Selected item: accent mark (left hairline or fill at low strength). Unselected: ink, quiet.

If a name appears, it is **Foundation**, small, top of the rail. Not “the Vault.”

### Middle

- Graph → canvas (find field on the canvas)
- Search / Recents → page title + controls + rows (title, meta, trailing tag)
- Tasks → column headers + cards (no create control)

### Inspector

Fixed width on the wide stop. Scrolls independently. Hairline on its left edge. No modal.

### Breakpoints

| Stop | Width | Layout |
| --- | --- | --- |
| Wide | ≥ 1280 | Rail + middle + inspector (~320–380px) |
| Medium | 900–1279 | Rail + middle. Inspector is a right drawer over the middle. Selecting a node opens it. A close control returns to the middle |
| Narrow | < 900 | Rail becomes a top or bottom icon strip. One surface at a time. Inspector is a full sheet over the surface. Graph is still a canvas |

A narrow window may stack. This is not a separate mobile app.

### Density

Row height ~36–40px. Body ~13px. Meta ~12px. Page titles ~18–22px. Padding 8 / 12 / 16. Hairline rules at ink ~10% on paper (and the inverse on dark). Accent on one thing at a time: the primary Unlock button, the selected rail item, an overdue chip, a selected mark.

## Color, type, two lanes

**Paper is the default lane and the first paint.** Dark is a real theme on every surface (Unlock, Graph, Search, Recents, Tasks, Inspector). The operator switches lanes with a toggle and/or follows system preference.

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
- Mono: one OFL-licensed mono (Geist Mono, IBM Plex Mono, or Source Code Pro), for UUIDs, sha256, nested `data`, and payload that is not prose

**Type tags**

One quiet pill per type. Same geometry for every type. Not a rainbow. Accent is not a type color.

## Key states

| State | What the operator sees |
| --- | --- |
| **Locked** | Unlock only. No graph peek |
| **Unlock error** | Same form. “API key required” (or the same sense). Field stays |
| **Loading** | Middle and inspector show a faint pulse or three hairline placeholders. No fake nodes |
| **Empty graph** | Canvas + the one line above. Search and Recents still open |
| **Empty recents** | “Nothing yet.” |
| **Empty search (not submitted)** | Field + “Search the graph, or filter by type.” |
| **No results** | “No matching nodes.” Field and type stay |
| **Empty tasks** | Board chrome present. “No tasks yet.” in Active |
| **Nothing selected** | Inspector: “Select a node.” |
| **Selected** | Mark / row / card uses a 1px accent or ink ring. Inspector filled |
| **Not found** | Inspector: “Not found.” |
| **Error (server)** | One line in the middle: “Could not load.” Retry is a text control |

No toast. No celebration of an empty vault.

## This window / not this window

**This window**

- Paper shell: rail + middle + inspector, breakpoints above
- Unlock
- Graph canvas (nodes, edges, select, find-on-canvas, pan/zoom)
- Search (text, type, status)
- Recents (activity rows)
- Inspector (readable detail; blob fetch; neighbors; proposals)
- Tasks board (three status columns, read-only)
- Dark theme on every surface (toggle and/or system). Paper remains the first paint
- Off-box unlock and session (same key, same cookie path)
- Deep link `/view/nodes/:id` into the shell
- Read-only and blob-safety rules in Door

**Not this window**

- Writes (create, status change, drag-to-complete, accept a suggested link)
- A view per type
- Trip HTML as a live document
- Due-bucket board, swimlanes, filters for `origin` / `under` / `data_equals`
- Full-vault hairball, mini-map, clustering, embeddings
- Ontology browser, undo, activity “confirm”
- A separate mobile app

## Runtime

- **Vite + React + TypeScript** — one app, served at `/view` on this process
- **React Router** — Graph, Search, Recents, Tasks, `/view/nodes/:id`
- **TanStack Query** — reads
- **CSS variables** for the tokens above
- **One 2D graph library** for the canvas
- No drag-to-write. No second backend

Unlock, cookie, and blob routes stay on this process.

## Acceptance

Review paper (first paint) on a wide window, then medium, then a narrow stack. Then switch to dark and judge that lane against the dark tokens. Use a vault with a handful of linked nodes, at least one task with a due date, one blob node, and a first-day empty vault.

### Layout

- [ ] Wide: three columns — rail, middle, inspector. Inspector ~320–380px, not a modal
- [ ] Graph’s middle is a canvas with visible nodes **and** edges
- [ ] Search / Recents are title + rows, not cards in a masonry
- [ ] Tasks is three columns, not a type-filtered list labeled “board”
- [ ] Medium: inspector is a drawer; Graph is still a canvas
- [ ] Narrow: one surface; inspector is a sheet; Graph is still a canvas
- [ ] `/view/nodes/:id` opens the shell with that node selected

### Density and type

- [ ] Rows ~36–40px. Body ~13px. Meta ~12px. Titles are page titles, not hero type
- [ ] Inter or Geist + one OFL mono. No display serif in the chrome
- [ ] Type tags are quiet pills, not a rainbow
- [ ] Inspector reads as an article: title, tags, labeled rows, wrapped payload. UUID and sha256 are mono, not the headline

### Color

- [ ] First paint is paper: background `#f7f7f4`, ink `#26251e`, accent `#f54e00`
- [ ] Dark lane: background `#14120b`, ink `#edecec`, cards / surface lift `#1b1913`, accent `#f54e00`
- [ ] Dark is a real theme on Unlock, Graph, Search, Recents, Tasks, and Inspector
- [ ] Accent appears on the selected rail item, Unlock, overdue, and selection — not on every border
- [ ] Hairlines, no shadows, no gradients

### States

- [ ] Empty graph: one line, no fake nodes, not an error
- [ ] Search with no query: the prompt, not “no results”
- [ ] Search miss: “No matching nodes.”
- [ ] Nothing selected: “Select a node.”
- [ ] Unlock miss: same form, error line
- [ ] Loading: placeholders, not a branded spinner
- [ ] No write buttons anywhere (no Upsert, Delete, Link, Undo, Confirm)

The window matches this file when every box holds.
