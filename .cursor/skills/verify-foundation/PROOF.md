# Proofs

## Maintain run (20260924Tmaintain)

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=20260924Tmaintain`). Host Postgres 16 bins were at `/usr/lib/postgresql/16/bin`. Not a personal vault. Doctor green. Viewer dist built. Cleanup removes `/tmp/foundation-verify-20260924Tmaintain`.

Map corrections this run (source + live window on a throwaway vault):

- Detail **Properties** order is type, status, declared fields, then **Open** when `data.url` is https, then Activity and Move to trash, then related records, location, and timestamps. The map had related / location / timestamps before Activity.
- **Move to trash** leaves detail and opens Trash. Choosing **Restore** opens that live record (`[data-surface="detail-page"]`).

What that run drove:

- `verify-foundation.test.sh` exited 0.
- `pnpm --filter @foundation/viewer test` passed. Viewer build succeeded.
- Doctor: health `{ ok: true, service: foundation, db: up }`, Viewer GET 200, toolchain ok.
- `verify-http-drive.sh` exited 0 (Unlock reject, MCP key before accept, accept, cookie does not open MCP, sixth wrong unlock 429, Home empty peek, first-day digest `rows` `[]`).
- `verify-mcp-drive.sh` exited 0 (`POST /mcp` `tools/list`).
- HTTP Collection: `GET /view/api/types/task` `type.label` Task, view ids board/list/calendar/timeline/outline, `parent_types` `["goal","project"]`, `nodes` `[]`. First-day `GET /view/api/types/journal` `parent_types` `[]`, `nodes` `[]`. After Today, journal collection listed that live id.
- HTTP Detail: `GET /view/api/nodes/00000000-0000-4000-8000-000000000000` 404 `{"error":"Not found"}`. After a bot note write, `GET /view/api/nodes/<id>` 200.
- HTTP Search: idle `{ searched: false, hits: [] }`; `q=zzzxnever`, `type=note`, and `status=active` `{ searched: true, hits: [] }`. After journal write, `q=Morning` `{ searched: true }`.
- HTTP Journal write: `POST /view/api/journals/today` same live id twice. `PATCH` title/body 200. Stale `base_updated_at` 409.
- HTTP Edit any node / Activity / Trash: `verify-edit-any-node.sh` exited 0. Empty title 400. `body` on a non-journal 403 `Journal writes only.` After DELETE, live GET 404 and HTTP activity still 200 with rows. Restore returned the record live.
- Home digest first-day empty in `verify-http-drive`. Later bot create listed, second look empty, Viewer PATCH omitted, later bot title listed.
- Window: Unlock, Home, Search idle, Trash empty copy, Proof Ada Properties order, Activity page, Move to trash → Trash row, Restore → `[data-surface="detail-page"]`.

Evidence: `.cursor/skills/verify-foundation/evidence/20260924Tmaintain/` (gitignored).

## Maintain run (20260923Tmaintain)

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=20260923Tmaintain`). Host Postgres 16 bins were at `/usr/lib/postgresql/16/bin`. Not a personal vault. Doctor green. Viewer dist built. Cleanup removes `/tmp/foundation-verify-20260923Tmaintain`.

Map correction this run (source + live HTTP on a throwaway vault):

- Home **Open a row** now names the title field `aria-label="Title"`, not a page heading. Detail already said that.

What that run drove:

- `verify-foundation.test.sh` exited 0.
- `pnpm --filter @foundation/viewer test` passed. Viewer build succeeded.
- Doctor: health `{ ok: true, service: foundation, db: up }`, Viewer GET 200, toolchain ok.
- `verify-http-drive.sh` exited 0 (Unlock reject, MCP key before accept, accept, cookie does not open MCP, sixth wrong unlock 429, Home empty peek, first-day digest `rows` `[]`).
- `verify-mcp-drive.sh` exited 0 (`POST /mcp` `tools/list`).
- HTTP Collection: `GET /view/api/types/task` `type.label` Task, view ids board/list/calendar/timeline/outline, `parent_types` `["goal","project"]`, `nodes` `[]`. First-day `GET /view/api/types/journal` `parent_types` `[]`, `nodes` `[]`. After Today, journal collection listed that live id.
- HTTP Detail: `GET /view/api/nodes/00000000-0000-4000-8000-000000000000` 404 `{"error":"Not found"}`.
- HTTP Search: idle `{ searched: false, hits: [] }`; `q=zzzxnever`, `type=note`, and `status=active` `{ searched: true, hits: [] }`. After journal write, `q=Morning` `{ searched: true }`.
- HTTP Journal write: `POST /view/api/journals/today` same live id twice. `PATCH` title/body 200. Stale `base_updated_at` 409.
- HTTP Edit any node / Activity / Trash: `verify-edit-any-node.sh` exited 0.
- Home digest first-day empty in `verify-http-drive`. Later bot create listed, second look empty, Viewer PATCH omitted, later bot title listed.
- `verify-export-import-45.sh` exited 0.
- Browser chrome was not clicked. Same-path HTTP was the drive.

Evidence: `.cursor/skills/verify-foundation/evidence/20260923Tmaintain/` (gitignored).

## Maintain run (20260919Tmaintain)

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=20260919Tmaintain`). Host Postgres 16 bins were at `/usr/lib/postgresql/16/bin`. Not a personal vault. Doctor green. Viewer dist built. Cleanup removes `/tmp/foundation-verify-20260919Tmaintain`.

Map corrections this run (source + live HTTP on a throwaway vault):

- Activity window on a tombstone is **Not found** because live GET is 404. HTTP `GET /view/api/nodes/:id/activity` still returns `200` and rows.
- Search driving now names the status filter. First-day `GET /view/api/search?status=active` is `{ "searched": true, "hits": [] }`.
- Skill handle `aria-label="Title"` is journal and detail, not journal only.
- Detail How-to names Since you last looked and a collection timeline item. Both already `openDetail` in source.

What that run drove:

- `verify-foundation.test.sh` exited 0.
- `pnpm --filter @foundation/viewer test` passed. Viewer build succeeded.
- Doctor: health `{ ok: true, service: foundation, db: up }`, Viewer GET 200, toolchain ok.
- `verify-http-drive.sh` exited 0 (Unlock reject, MCP key before accept, accept, cookie does not open MCP, sixth wrong unlock 429, Home empty peek, first-day digest `rows` `[]`).
- `verify-mcp-drive.sh` exited 0 (`POST /mcp` `tools/list`).
- HTTP Collection: `GET /view/api/types/task` `type.label` Task, view ids board/list/calendar/timeline/outline, `parent_types` `["goal","project"]`, `nodes` `[]`. First-day `GET /view/api/types/journal` `parent_types` `[]`, `nodes` `[]`. After Today, journal collection listed that live id.
- HTTP Detail: `GET /view/api/nodes/00000000-0000-4000-8000-000000000000` 404 `{"error":"Not found"}`.
- HTTP Search: idle `{ searched: false, hits: [] }`; `q=zzzxnever`, `type=note`, and `status=active` `{ searched: true, hits: [] }`. After journal write, `q=Morning` `{ searched: true }`.
- HTTP Journal write: `POST /view/api/journals/today` same live id twice. `PATCH` title/body 200. Stale `base_updated_at` 409.
- HTTP Edit any node / Activity / Trash: `verify-edit-any-node.sh` exited 0. After DELETE, live GET 404 and HTTP activity still 200 with rows. Restore returned the record live.
- `verify-home-digest.sh` and `verify-export-import-45.sh` exited 0.
- Built dist contained Unlock copy, `home-digest`, **Trash**, **Restore**, **Keep a title**, and **May hang under**.
- Browser chrome was not clicked. Same-path HTTP was the drive.

Evidence: `.cursor/skills/verify-foundation/evidence/20260919Tmaintain/` (gitignored).

## Maintain run (20260918Tmaintain)

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=20260918Tmaintain`). Host Postgres 16 bins were at `/usr/lib/postgresql/16/bin`. Not a personal vault. Doctor green. Viewer dist built. Cleanup removes `/tmp/foundation-verify-20260918Tmaintain`.

Map corrections this run (source + live HTTP on a throwaway vault):

- Unlock: refuse the MCP key *before* accept. Accept clears the peer ledger. A refused MCP-key unlock after accept is failure 1, so the fifth later wrong is already `429`. JSON accept stays on the current path; form POST lands on `/view`.
- Rail chrome is **Home**, **Search**, and **Trash**. Trash is not a Home widget.
- First-day seed `task` views are board/list/calendar/timeline/outline (declaration objects). No Graph on seed types.
- Detail title is `aria-label="Title"`, not an `h1`. Missing valid UUID paints heading `Not found` plus Quiet **Not found.**
- Any-node HTTP empty title is `400` (window **Keep a title**). `body` on a non-journal is `403` `{"error":"Journal writes only."}`. Clash `409` body is `base_updated_at does not match current updated_at`. Reload keeps the draft.
- Activity **Undo** is gated on `can_undo`. The control is on non-journal Properties only. A tombstone activity page is **Not found**.
- Trash **Move to trash** is non-journal only. Empty HTTP is `{ "rows": [] }`. Restore `200` is the live node document. A row offers **Restore**.

What that run drove:

- `verify-foundation.test.sh` exited 0.
- `pnpm --filter @foundation/viewer test` passed 78 tests.
- Viewer build succeeded. Doctor: health `{ ok: true, service: foundation, db: up }`, Viewer GET 200, toolchain ok.
- `verify-http-drive.sh` exited 0 (Unlock reject, MCP key before accept, accept, cookie does not open MCP, sixth wrong unlock 429, Home empty peek, first-day digest `rows` `[]`).
- `verify-mcp-drive.sh` exited 0 (`POST /mcp` `tools/list`).
- HTTP Collection: `GET /view/api/types/task` `type.label` Task, view ids board/list/calendar/timeline/outline, `parent_types` `["goal","project"]`, `nodes` `[]`. First-day `GET /view/api/types/journal` `parent_types` `[]`, `nodes` `[]`. After Today, journal collection listed that live id.
- HTTP Detail: `GET /view/api/nodes/00000000-0000-4000-8000-000000000000` 404 `{"error":"Not found"}`.
- HTTP Search: idle `{ searched: false, hits: [] }`; `q=zzzxnever`, `type=note`, and `status=active` `{ searched: true, hits: [] }`. After journal write, `q=Morning` `{ searched: true }`.
- HTTP Journal write: `POST /view/api/journals/today` created type `journal`, `text/markdown`, empty body, title `September 18, 2026`. Second POST same id. `PATCH` title/body 200. Stale `base_updated_at` 409.
- HTTP Edit any node / Activity / Trash: Viewer `PATCH` on a live person (MCP upsert only to have a record) saved title/status/`org`, stale 409. Empty title 400. `body` 403 `Journal writes only.` Activity listed `actor` `user` / `actor_label` `Viewer` with `can_undo`. Undo restored the prior snapshot. `DELETE` 404 on GET; trash listed it; restore returned it live.
- Built dist contained Unlock copy, `home-digest`, **Trash**, **Restore**, **Keep a title**, and **May hang under**.
- Browser chrome was not clicked. Same-path HTTP was the drive.

Evidence: `.cursor/skills/verify-foundation/evidence/20260918Tmaintain/` (gitignored).

## Named proof `export-import-45`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=export-import-45`). Doctor green. MCP at `http://127.0.0.1:8787/mcp`. Host scripts only. `tools/list` returned 16 tools including `merge`. No export or import tool.

1. MCP `upsert` seeded live fixtures titled "Export proof note" and "Export proof task".
2. `scripts/foundation-export.sh --out` wrote `foundation.json`, at least one `markdown/<type>/*.md`, and at least one `csv/<type>.csv`.
3. Fixture trees: Obsidian (2 markdown files), Notion (1 page), Apple Notes (1 note), Google Tasks (1 task with a due).
4. `import --from obsidian --dry-run` wrote no new nodes. Real import created the two titles. A second import did not twin.
5. Notion, Apple Notes, and Google Tasks adapters each created the expected type. Google Tasks kept `due` `2026-09-20`.
6. Home session, digest, and Today peek still loaded on the view door.

Evidence stays under `.cursor/skills/verify-foundation/evidence/export-import-45/`. Keys were redacted. The named-proof throwaway vault was cleaned up after the proof.

GitHub `verify` gates on this machine: schema tests pass including `generate-mcp-docs --check`; viewer tests + build pass; `skills-layout`, `drift-read`, `foundation-portability`, `foundation-init`, `mint-api-key`, `require-database-url` ok; `verify-http-drive`, `verify-mcp-drive`, and `verify-export-import-45.sh` ok on throwaway `VERIFY_RUN_ID=export-import-45`. `tools/list` count 16 including `merge`. Full `@foundation/server` suite had the known host-cluster FTS headline miss (`fiancée` not in the payload snippet). That miss is not this slice.

## Maintain run (20260916Tmaintain)

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=20260916Tmaintain`). Host Postgres 16 bins were at `/usr/lib/postgresql/16/bin`. Not a personal vault. Doctor green. Viewer dist built. Cleanup removes `/tmp/foundation-verify-20260916Tmaintain`.

Map corrections this run (source + live HTTP on a throwaway vault):

- Home digest handle is `[data-surface="home-digest"]`. The watermark cookie is `foundation_home_looked` (`Path=/view`). A Since you last looked row opens that live id the same way Recents and Open tasks do.
- Trash window rows offer **Restore**.
- Cleanup puts host Postgres 16 bins on PATH before `keep-vault-up.sh stop`, so `pg_ctl` can stop the cluster. Without that, cleanup removed the run root and left Postgres on `5432`.

What that run drove:

- `verify-foundation.test.sh` exited 0.
- `pnpm --filter @foundation/viewer test` passed 78 tests.
- Viewer build succeeded. Doctor: health `{ ok: true, service: foundation, db: up }`, Viewer GET 200, toolchain ok.
- `verify-http-drive.sh` exited 0 (Unlock reject/accept, MCP key does not unlock, cookie does not open MCP, sixth wrong unlock 429, Home empty peek, first-day digest `rows` `[]`).
- `verify-mcp-drive.sh` exited 0 (`POST /mcp` `tools/list`, 16 tools including `merge`).
- HTTP Collection: `GET /view/api/types/task` `type.label` Task, views board/list/calendar/timeline/outline, `parent_types` `["goal","project"]`, `nodes` `[]`. First-day `GET /view/api/types/journal` `parent_types` `[]`, `nodes` `[]`. After Today, journal collection listed that live id.
- HTTP Detail: `GET /view/api/nodes/00000000-0000-4000-8000-000000000000` 404 `{"error":"Not found"}`.
- HTTP Search: idle `{ searched: false, hits: [] }`; `q=zzzxnever` and `type=note` `{ searched: true, hits: [] }`. After journal write, `q=Morning` `{ searched: true }`.
- HTTP Journal write: `POST /view/api/journals/today` created type `journal`, `text/markdown`, empty body, title `September 16, 2026`. Second POST same id. `PATCH` title/body 200. Stale `base_updated_at` 409. GET that id is inline markdown (window renders journal-page).
- HTTP Edit any node / Activity / Trash: Viewer `PATCH` on a live person (MCP upsert only to have a record) saved title/status/`org`, stale 409. Activity listed `actor` `user` / `actor_label` `Viewer`. Undo restored the prior snapshot. `DELETE` 404 on GET; trash listed it; restore returned it live.
- Live digest GET set cookie `foundation_home_looked` `Path=/view`. Built dist contains `home-digest` and **Restore**.
- `verify-export-import-45.sh` exited 0 on this throwaway.
- After the cleanup PATH fix: `verify-home-digest.sh` exited 0 on a fresh first-day launch (`VERIFY_RUN_ID=20260916Tdigest`). Cleanup then left `5432` free. A second launch (`VERIFY_RUN_ID=20260916Trelaunch`) started and cleaned up with no leftover Postgres.
- Browser chrome was not clicked. Same-path HTTP was the drive.

Evidence: `.cursor/skills/verify-foundation/evidence/20260916Tmaintain/` (gitignored).

## Maintain run (20260915Tmaintain)

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=20260915Tmaintain`). Host Postgres 16 bins were at `/usr/lib/postgresql/16/bin`. Not a personal vault. Doctor green. Viewer dist built. Cleanup removes `/tmp/foundation-verify-20260915Tmaintain`.

Map corrections this run (source + live HTTP on a throwaway vault):

- Collection `collection-open-record` opens `/view/nodes/<uuid>`. A journal with inline markdown is the write page (`[data-surface="journal-page"]`), not `[data-surface="detail-page"]`. Choosing a journal row leaves the list the same way **Today** does.
- Graph ignores the active view filter and hardcodes **Nothing yet.** Do not prove `collection-filtered` on Graph.
- Home digest HTTP: keep a cookie jar so the last-looked watermark persists. The unlock cookie authenticates; the watermark is set on the digest GET.

What that run drove:

- `verify-foundation.test.sh` exited 0.
- `pnpm --filter @foundation/viewer test` passed 78 tests.
- Viewer build succeeded. Doctor: health `{ ok: true, service: foundation, db: up }`, Viewer GET 200, toolchain ok.
- `verify-http-drive.sh` exited 0 (Unlock reject/accept, MCP key does not unlock, cookie does not open MCP, sixth wrong unlock 429, Home empty peek).
- `verify-mcp-drive.sh` exited 0 (`POST /mcp` `tools/list`).
- HTTP Collection: `GET /view/api/types/task` `type.label` Task, views board/list/calendar/timeline/outline, `parent_types` `["goal","project"]`, `nodes` `[]`. First-day `GET /view/api/types/journal` `parent_types` `[]`, `nodes` `[]`. After Today, journal collection listed that live id.
- HTTP Detail: `GET /view/api/nodes/00000000-0000-4000-8000-000000000000` 404 `{"error":"Not found"}`.
- HTTP Search: idle `{ searched: false, hits: [] }`; `q=zzzxnever` and `type=note` `{ searched: true, hits: [] }`. After journal write, `q=Morning` `{ searched: true }`.
- HTTP Journal write: `POST /view/api/journals/today` created type `journal`, `text/markdown`, empty body. Second POST same id. `PATCH` title/body 200. Stale `base_updated_at` 409. GET that id is inline markdown (window renders journal-page).
- HTTP Edit any node / Activity / Trash: Viewer `PATCH` on a live person (MCP upsert only to have a record) saved title/status/`org`, stale 409, empty title 400, `body` 403. Activity listed `actor` `user` / `actor_label` `Viewer`. Undo clash 409; undo restored the prior snapshot. `DELETE` 404 on GET; trash listed it; restore returned it live.
- `verify-export-import-45.sh` exited 0 on this throwaway.
- Browser chrome was not clicked. Same-path HTTP was the drive.

GitHub `verify` gates on this machine: schema tests pass; viewer tests + build pass; `skills-layout`, `drift-read`, `foundation-portability`, `foundation-init`, `mint-api-key`, `require-database-url` ok; `verify-http-drive`, `verify-mcp-drive`, and `verify-export-import-45.sh` ok. Full `@foundation/server` suite on the throwaway `DATABASE_URL` had the known host-cluster FTS headline miss (`fiancée` not in the payload snippet). That miss is not this slice.

Evidence: `.cursor/skills/verify-foundation/evidence/20260915Tmaintain/` (gitignored).

## Named proof `home-digest-33`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=home-digest-33`). Doctor green after Viewer build. Viewer at `http://127.0.0.1:8788/view`. MCP at `http://127.0.0.1:8787/mcp`. `tools/list` returned 16 tools including `merge`. No new tool.

HTTP on the view door with the throwaway view key (cookie jar keeps the last-looked watermark):

1. First `GET /view/api/digest` after Unlock returned `rows` `[]` and set `foundation_home_looked`.
2. MCP `upsert` of a live note titled "Digest proof note" (`actor` `agent`, label `root`). Reload digest listed that title.
3. A second digest fetch with no further bot writes returned `rows` `[]` (**Nothing new.**).
4. Viewer `PATCH` retitled the record "Digest user edit" (`actor=user`). Reload digest stayed empty.
5. A second MCP title write "Digest bot again" appeared in the digest. `GET /view/api/nodes/:id` opened that live id.
6. Recents, Open tasks, and Today peek still loaded. Inventory names stayed 16 including `merge`.

GitHub `verify` gates on this machine: schema tests pass including `generate-mcp-docs --check`; viewer tests + build pass; `skills-layout`, `drift-read`, `foundation-init`, `mint-api-key`, `require-database-url` ok; `verify-http-drive` and `verify-mcp-drive` ok on a clean first-day throwaway (`VERIFY_RUN_ID=verify-gates-33`; first-day digest `rows` `[]`). Named proof script `verify-home-digest.sh` exited 0. Server `view-digest` tests passed. Full `@foundation/server` suite had the known host-cluster FTS headline miss (`fiancée` not in the payload snippet). That miss is not this slice.

Evidence stayed under `.cursor/skills/verify-foundation/evidence/home-digest-33/`. Keys were redacted. The named-proof throwaway vault was cleaned up after the proof.

Journal write is on this branch. Home always offers **Today**, even at journal count 0. **Today** (`/view/journal/today`, `POST /view/api/journals/today`) creates today's journal if none is live. The page autosaves title and one markdown body on that record (`PATCH /view/api/nodes/:id`). An empty title shows **Keep a title**. Unlock title is **Unlock.** The field is the vault key. The error is **That key did not unlock.** Other live records edit title, status, and declared fields on detail. Activity and Trash use the same if-match and restore family. The Viewer cookie does not unlock MCP.

Historical proof runs below may mention older door copy. The current window is the paragraph above.

Early generate/maintain VMs lacked host Postgres 16 on PATH and did not drive live `/view` HTTP. Later maintain runs that could start a throwaway vault did.

## Named proof `edit-any-node-31`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=edit-any-node-31`). Doctor green after Viewer build. Viewer at `http://127.0.0.1:8788/view`. MCP at `http://127.0.0.1:8787/mcp`. `tools/list` returned 16 tools including `merge`. No new tool.

HTTP on the view door with the throwaway view key (person created via MCP `upsert` so the window had a live non-journal record):

1. `PATCH /view/api/nodes/:id` changed title to "Ada Lovelace", status to `completed`, and declared field `data.org` to "College". Reload GET showed those values.
2. The same stale `base_updated_at` returned `409` (`base_updated_at does not match current updated_at`). GET still showed "Ada Lovelace".
3. `GET /view/api/nodes/:id/activity` listed the Viewer update (`actor=user`, `actor_label=Viewer`, summary `title, status, data.org`) with Undo offered.
4. `POST /view/api/activity/:id/undo` restored title "Proof Ada", status `active`, and `data.org` "Labs".
5. `DELETE /view/api/nodes/:id` moved the record out of Recents. `GET /view/api/trash` listed it. `POST /view/api/nodes/:id/restore` returned it live with title "Proof Ada".
6. `POST /view/api/journals/today` opened today's journal. `PATCH` saved title "Proof morning" and body `Wrote today.\n`.

GitHub `verify` gates on this machine: schema tests pass including `generate-mcp-docs --check`; viewer tests + build pass; `skills-layout`, `drift-read`, `foundation-init`, `mint-api-key`, `require-database-url` ok; `verify-http-drive` and `verify-mcp-drive` ok on this throwaway. Named proof script `verify-edit-any-node.sh` exited 0. Server tests on the throwaway `DATABASE_URL` passed the view write suite (`view window writes journal, any-node, activity, and trash`). Full `@foundation/server` suite had the known host-cluster FTS headline miss (`fiancée` not in the payload snippet). That miss is not this slice.

Evidence stayed under `.cursor/skills/verify-foundation/evidence/edit-any-node-31/`. Keys were redacted. The named-proof throwaway vault was cleaned up after the proof.

## Named proof `merge-keep-drop-25`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=merge-keep-drop-25`). Doctor green after Viewer build. MCP at `http://127.0.0.1:8787/mcp`. Search (`q`) is skipped on this host — FTS config `foundation_english` is missing; use `get` / `list_activity`. `tools/list` returned 16 tools including `merge`.

MCP on `http://127.0.0.1:8787/mcp`:

1. Two live `note` nodes (keep titled "Proof merge keep", drop titled "Proof merge drop") plus a third related note. Drop had alias `Merge drop alias` and repo `https://github.com/example/merge-drop-proof`. A `related_to` edge from drop to the third note.
2. `merge` with keep, drop, fresh `keep_base_updated_at` / `drop_base_updated_at`, and confirm set to true returned one `activity_id` and `ok: true`.
3. `get(keep)` showed unioned aliases (`Merge drop alias` present), repo moved onto keep, and the retargeted `related_to` edge. `get(drop)` returned not found as live.
4. Missing confirm refused with `error` + `suggestion`. Stale keep if-match refused with get-and-retry copy (not "node not found"). Different-type pair (`note` + `person`) refused.
5. `undo` of that activity with keep's current `updated_at` restored drop live, prior alias/identity on drop, and the original edge endpoints.
6. Inventory names: `bootstrap`, `search`, `lookup`, `get`, `working_set`, `upsert`, `delete`, `merge`, `link`, `unlink`, `inspect_ontology`, `manage_type`, `manage_relation`, `list_activity`, `undo`, `job`.

GitHub `verify` gates on this machine: schema tests pass including `generate-mcp-docs --check`; viewer tests + build pass; `skills-layout`, `drift-read`, `foundation-init`, `mint-api-key`, `require-database-url` ok; `verify-http-drive` and `verify-mcp-drive` ok on a clean first-day throwaway (`VERIFY_RUN_ID=verify-gates-25`; `tools/list` count 16 including `merge`). Server tests on the named-proof `DATABASE_URL` passed `merge`, `cas-safety`, `link`, `delete-restore`, and `undo`. Full `@foundation/server` suite had the known host-cluster FTS headline miss (`fiancée` not in the payload snippet). That miss is not this slice.

Evidence stayed under `.cursor/skills/verify-foundation/evidence/merge-keep-drop-25/`. Keys were redacted. The named-proof throwaway vault was cleaned up after the proof.

## Named proof `batch-upsert-23`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=batch-upsert-23`). Doctor green after Viewer build. MCP at `http://127.0.0.1:8787/mcp`. Search (`q`) is skipped on this host — FTS config `foundation_english` is missing; use `get` / `list_activity`. `tools/list` returned 15 tools. No new tool.

MCP on `http://127.0.0.1:8787/mcp`:

1. Single `upsert` `{ type: note, title: "Proof single upsert" }` returned a node and `activity_id`. `get` by that id returned the note.
2. Multi-row `upsert` with one invalid type (`not_a_type`) returned `nodes[1]: Unknown type "not_a_type"`. `list_activity` had no row titled "Proof would persist".
3. Multi-row `upsert` of two notes (`Proof batch A`, `Proof batch B`) returned `nodes.length === 2` with both `activity_id`s. `get` each id succeeded.
4. `upsert` `{ dry_run: true, nodes: [ { type: note, title: "Proof dry run node" } ] }` returned a would-be snapshot and `dry_run: true` with no `activity_id`. `get` of the would-be id returned `Node not found`.
5. `link` `{ dry_run: true, from, to, kind: related_to }` returned a receipt and `dry_run: true`. `get` of the from-node had `edges` `[]`.
6. `upsert` `{ type: spend, title: "Proof spend warn" }` (no amount/currency/stage) succeeded with `warnings[0].code === "missing_needed"` and fields `amount`, `currency`, `stage`.
7. Same call with `strict: true` and title `Proof spend strict refuse` returned `Missing needed fields: amount, currency, stage`. `list_activity` had no row with that title.
8. `tools/list` names matched the inventory order: `bootstrap`, `search`, `lookup`, `get`, `working_set`, `upsert`, `delete`, `link`, `unlink`, `inspect_ontology`, `manage_type`, `manage_relation`, `list_activity`, `undo`, `job`.

GitHub `verify` gates on this machine: schema tests pass including `generate-mcp-docs --check`; viewer tests + build pass; `skills-layout`, `drift-read`, `foundation-init`, `mint-api-key`, `require-database-url` ok; `verify-http-drive` and `verify-mcp-drive` ok on a clean throwaway launch. Server tests on the throwaway `DATABASE_URL` passed `upsert-batch`, `cas-safety`, `link-batch`, and `view`. Full `@foundation/server` suite had the known host-cluster FTS headline miss (`fiancée` not in the payload snippet). That miss is not this slice.

Evidence stayed under `.cursor/skills/verify-foundation/evidence/batch-upsert-23/`. Keys were redacted. The throwaway vault was left running.

## Maintain run (20260911Tmaintain)

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=20260911Tmaintain`). Host Postgres 16 bins were at `/usr/lib/postgresql/16/bin`. Not a personal vault. Doctor green. Viewer dist built. Cleanup removes `/tmp/foundation-verify-20260911Tmaintain`.

Map corrections this run (source + live HTTP on a first-day vault):

- Collection and detail Properties show **May hang under** plus allowed parent labels when the type has `parent_types` (`data-constraint="parent_types"`). First-day `task` is `["goal","project"]` (Goal, Project). Seed `journal` omits the line.

What that run drove:

- `verify-foundation.test.sh` exited 0.
- `pnpm --filter @foundation/viewer test` passed 75 tests.
- Viewer build succeeded. Doctor: health `{ ok: true, service: foundation, db: up }`, Viewer GET 200, toolchain ok.
- `verify-http-drive.sh` exited 0 (Unlock reject/accept, MCP key does not unlock, cookie does not open MCP, sixth wrong unlock 429, Home empty peek).
- `verify-mcp-drive.sh` exited 0 (`POST /mcp` `tools/list`).
- HTTP Collection: `GET /view/api/types/task` `type.label` Task, views board/list/calendar/timeline/outline, `parent_types` `["goal","project"]`, `nodes` `[]`. `GET /view/api/types/journal` `parent_types` `[]`, `nodes` `[]`.
- HTTP Detail: `GET /view/api/nodes/00000000-0000-4000-8000-000000000000` 404 `{"error":"Not found"}`.
- HTTP Search: idle `{ searched: false, hits: [] }`; `q=zzzxnever` and `type=note` `{ searched: true, hits: [] }`.
- HTTP Journal write: `POST /view/api/journals/today` created type `journal`, `text/markdown`, empty body, title `September 11, 2026`. Second POST same id. `PATCH` title/body 200. Stale `base_updated_at` 409. PATCH non-journal skipped (no non-journal record; do not upsert).
- Browser chrome was not clicked. Same-path HTTP was the drive.

Evidence: `.cursor/skills/verify-foundation/evidence/20260911Tmaintain/` (gitignored).

## Named proof `resources-prompts-21`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=resources-prompts-21`). Doctor green. `tools/list` returned 15 tools. No new tool.

MCP on `http://127.0.0.1:8787/mcp`:

1. `resources/list` returned 10 `foundation://guidance` documents. `resources/read` of `foundation://guidance/nodes` returned the how-to-extend nodes essay (`data.url: null clears the href`).
2. `prompts/list` included `chief`, `vault-keeper`, and `executive-assistant`. `prompts/get` `chief` returned the recipe text from `prompts/chief.md`.
3. `bootstrap` returned `{ spine, types, relations, rules }` only. No required `how_to_extend` essay.
4. GitHub `verify` gates on this machine: schema 226 pass; viewer tests pass; viewer build; `skills-layout`, `drift-read`, `foundation-init`, `mint-api-key`, `require-database-url` ok; `verify-http-drive` and `verify-mcp-drive` ok. Server tests on the throwaway `DATABASE_URL` passed except the known host-cluster FTS headline miss (`fiancée` not in the payload snippet). That miss is not this slice.
5. Evidence stayed under `.cursor/skills/verify-foundation/evidence/resources-prompts-21/`. Keys were redacted. The throwaway vault was left running.

## Named proof `generated-mcp-docs-15`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=generated-mcp-docs-15`). Doctor green. `tools/list` returned 15 tools. No new tool.

MCP on `http://127.0.0.1:8787/mcp`:

1. `pnpm --filter @foundation/schema generate-mcp-docs --check` exited 0. Generated regions in `docs/MCP_TOOLS.md` and `.agents/skills/foundation-mcp/SKILL.md` matched the advertised inventory in `packages/schema`.
2. `tools/list` advertised the same 15 names. Parameter descriptions were non-empty on `search`, `upsert`, `list_activity`, and `job`, including nested `search.url.system`.
3. GitHub `verify` gates on this machine: schema 223 pass; viewer tests pass; viewer build; `skills-layout`, `drift-read`, `foundation-init`, `mint-api-key`, `require-database-url` ok; `verify-http-drive` and `verify-mcp-drive` ok. Server tests on the throwaway `DATABASE_URL` passed except the known host-cluster FTS headline miss (`fiancée` not in the payload snippet). That miss is not this slice.
4. Evidence stayed under `.cursor/skills/verify-foundation/evidence/generated-mcp-docs-15/`. Keys were redacted. The throwaway vault was left running.

## Named proof `zod-describe-13`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=zod-describe-13`). Doctor green after Viewer build. `tools/list` returned 15 tools. No new tool.

MCP on `http://127.0.0.1:8787/mcp`:

1. `tools/list` advertised non-empty Zod parameter descriptions on `search`, `upsert`, `list_activity`, and `job`, including nested `search.url.system` / `search.url.id`.
2. `pnpm --filter @foundation/schema test` passed, including `mcp-input-describe.test.ts`. A probe object with JSDoc and no `.describe()` failed the walker, then the real listed shapes passed.
3. GitHub `verify` gates on this machine: schema 216 pass; viewer 75 pass; viewer build; `skills-layout`, `drift-read`, `foundation-init`, `mint-api-key`, `require-database-url` ok; `verify-http-drive` and `verify-mcp-drive` ok. Server tests on the throwaway `DATABASE_URL` passed except the known host-cluster FTS headline miss (`fiancée` not in the payload snippet). That miss is not this slice.
4. Cleanup removed the disposable run root. Evidence stayed under `.cursor/skills/verify-foundation/evidence/zod-describe-13/`. Keys were redacted.

## Named proof `activity-prune-12`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=activity-prune-12`). Doctor green. `tools/list` returned 15 tools. No prune tool. No `get_vault_health`.

MCP on `http://127.0.0.1:8787/mcp`:

1. Two `upsert` writes on one note left create + update activity. Both rows carried `schema_version` `1`. Default `list_activity` `{ target }` returned full snapshots (count 2).
2. SQL aged the create row past one day. `UPDATE vault_settings.activity_retention_days` to `1`. `scripts/activity-prune.sh` / `pnpm --filter @foundation/db prune-activity` deleted 1. The recent update stayed. Its undo token stayed.
3. `list_activity` `{ fields: ["id", "action", "schema_version"] }` returned only those keys. `{ diff_only: true }` returned changed `title` / `payload` / `updated_at` and omitted unchanged `id`. Default `list_activity` still returned a full snapshot with `schema_version`.
4. `job` `{ action: "claim", name: "activity-prune" }` held the name. `finish` opened it and stamped last run.
5. Cleanup removed the disposable run root. Evidence stayed under `.cursor/skills/verify-foundation/evidence/activity-prune-12/`. Keys and bodies were redacted.

## Named proof `vault-settings-11`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=vault-settings-11`). Doctor green. Fresh `vault_settings` row was timezone `America/New_York`, working-set cap 40, due window 14.

MCP on `http://127.0.0.1:8787/mcp`:

1. `tools/list` returned 15 tools. No settings tool.
2. `search` `{ due: "today" }` under the seed zone hit tasks dated New York today and missed a Pacific/Auckland date.
3. `UPDATE vault_settings.timezone` to `Pacific/Auckland`. `due: today` flipped. The New York dates became overdue.
4. `working_set` on a live area stayed healthy. `walk.due_window.timezone` was `Pacific/Auckland`.
5. Cleanup removed the disposable run root. Evidence stayed under `.cursor/skills/verify-foundation/evidence/vault-settings-11/`. Keys were redacted.

## Named proof `jobs-lease-10`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=jobs-lease-10`). Doctor green. `tools/list` returned 15 tools including `job`.

MCP on `http://127.0.0.1:8787/mcp`:

1. `job` `{ action: "claim", name: "dream" }` held the name and returned a token. Same-key claim without the token → `{ error: "Held" }` and no token.
2. `claim` with that token heartbeated. `finish` stamped `last_run` from the holder and opened the name. `read` returned last run and never a token.
3. Claim after finish succeeded with a new token. `release` opened and left `last_run` alone. Claim after release succeeded. Stale finish → `{ error: "Not holding" }`. Read of an unused name was an open virtual row.
4. Cleanup removed the disposable run root. Evidence stayed under `.cursor/skills/verify-foundation/evidence/jobs-lease-10/`. Tokens and keys were redacted.

## Named proof `drift-read-9`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=drift-read-9`). Doctor green. `scripts/drift-read.sh` on the first-day graph printed five empty buckets and `drift-read: quiet`.

Planted fixture spend (no amount/currency/stage), isolate note, twin titles, leftover identity bag via SQL, and `mention.who` after a SQL soft-delete of the person (declared ref; extra UUID keys do not count). The report put each in the right bucket. `list_activity` count stayed 7 across a second read. Cleanup removed the disposable run root. Evidence stayed under `.cursor/skills/verify-foundation/evidence/drift-read-9/`.

## Named proof `revalidate-edges-8`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=revalidate-edges-8`). Doctor green. Root key had destructive scope. `confirm` was not used.

MCP on `http://127.0.0.1:8787/mcp`:

1. Retype a `task` with a live `child_of` to `note` without if-match → `Missing base_updated_at`. With if-match → `{ error: Cannot retype to "note": live child_of edge would no longer be allowed, suggestion: unlink first }`. `get` still showed `type: task` and the edge.
2. Delete a `person` that a `mention.who` ref pointed at, without if-match → `Missing base_updated_at`. With if-match → refuse inbound ref fields; the person stayed live. Clear `who`, then delete succeeded.
3. Cleanup removed the disposable run root. Evidence stayed under `.cursor/skills/verify-foundation/evidence/revalidate-edges-8/`.

## Generate run (20260901Tproof1)

The generated skill was executed once. Cleanup did not delete evidence.

Launch refused. Postgres 16 was not on PATH. Doctor reported health down. After `pnpm --filter @foundation/viewer build`, doctor reported Viewer dist present.

Live Unlock HTTP was not driven. Host programs never started.

What that run drove instead, as the skill allows when launch is blocked:

- Feature id `unlock-door`. The built Viewer bundle contained the unlock door and button **Unlock**. Current door copy is **Unlock.** / vault key / **That key did not unlock.**
- Viewer tests passed. The write contract is `window writes journal only`.
- `pnpm test` exited 0. `skills-layout.test: ok`. Server tests that need `DATABASE_URL` skipped.

Nothing that run started. Cleanup left evidence at `.cursor/skills/verify-foundation/evidence/20260901Tproof1/`.

## Maintain run (20260901Tmaintain)

Launch refused again. Same Postgres gap. Same rule: do not guess an installer.

What that run drove:

- `verify-foundation.test.sh` exited 0.
- `pnpm --filter @foundation/viewer test` passed 50 tests, including `journal page is a document; today is the start path` and `window writes journal only`.
- Viewer build succeeded. Doctor then reported Viewer dist present.
- The built dist contained Unlock copy, Home empty copy, Search idle and empty copy, Detail `Not found.`, and the journal invite `Write a first sentence.`

Live `/view` unlock, session, and journal POST/PATCH were not driven. Cleanup left evidence at `.cursor/skills/verify-foundation/evidence/20260901Tmaintain/`.

## Maintain run (20260902Tmaintain)

Launch refused. Postgres 16 was not on PATH. Same rule: do not guess an installer. Doctor reported health down and Viewer dist missing until the Viewer build.

Map corrections this run (source + Viewer tests; not a live `/view` drive):

- Cookie-scope recipe now POSTs `/mcp` and GETs agent `/blobs/:id` with the accept cookie. `GET /mcp` is never a tools call.
- Skill Drive HTTP now includes Home's Today peek `GET /view/api/journals/today` (does not create).

What that run drove:

- `verify-foundation.test.sh` exited 0 (including the cookie-scope and peek GET locks).
- `pnpm --filter @foundation/viewer test` passed 75 tests, including Home Today at empty body, Unlock vault-key copy, journal page, leave-flush, and `window writes journal only`.
- Viewer build succeeded. Doctor then reported Viewer dist present. The built dist contained Unlock copy, Home **Write today**, Search idle and empty copy, Detail **Not found.**, **Keep a title**, and the journal invite **Write a first sentence.**
- `pnpm test` exited 0. Server tests that need `DATABASE_URL` skipped. `skills-layout.test: ok`.
- Live `/view` unlock, session, peek GET, and journal POST/PATCH were not driven.

Cleanup left evidence at `.cursor/skills/verify-foundation/evidence/20260902Tmaintain/`.

## CI Postgres run (`ci-postgres-50`)

Throwaway vault via `verify-foundation.sh launch`. Not a personal vault. Doctor green before MCP. Cleanup removed `/tmp/foundation-verify-ci-postgres-50`.

What that run drove:

- `env -u DATABASE_URL pnpm --filter @foundation/server test` exited 1 with `DATABASE_URL is required; refusing to skip database tests`. Same for `@foundation/db`. No skip-pass.
- `scripts/require-database-url.test.sh` exited 0.
- Doctor: health `{ ok: true, service: foundation, db: up }`. Viewer GET 200. Toolchain ok.
- `verify-http-drive.sh` exited 0 (Unlock accept + Home empty copy).
- `verify-mcp-drive.sh` exited 0. `POST /mcp` `tools/list` returned HTTP 200 and 14 tools including `bootstrap`, `search`, and `get`. No new tool. No Viewer write.
- Server tests on the throwaway `DATABASE_URL` ran (0 skipped). One host-cluster FTS snippet assertion missed `fiancée` in the headline. GitHub `verify` runs the same suite against the `pgvector/pgvector:pg16` service.

Evidence: `.cursor/skills/verify-foundation/evidence/ci-postgres-50/` (gitignored).

## Maintain run (20260904Tmaintain)

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=20260904Tmaintain`). Host Postgres 16 bins were at `/usr/lib/postgresql/16/bin` but not on the process PATH until the helper (this run) prepended that directory. Not a personal vault. Doctor green. Viewer dist built. Cleanup removes `/tmp/foundation-verify-20260904Tmaintain`.

Map corrections this run (source + live HTTP on a first-day vault):

- Today create/lookup follows `vault_settings.timezone` (seed `America/New_York`). Viewer chrome still formats the day in New York.
- Default task board columns hardcode **Nothing yet.** Prove `collection-filtered` on List.
- Unlock heading is **Unlock.** HTTP Viewer calls use the vault key (view-key-file when present).
- Helper puts `/usr/lib/postgresql/16/bin` on PATH when those binaries exist and `initdb` / `pg_ctl` are missing from PATH.

What that run drove:

- `verify-foundation.test.sh` (helper contracts, including the PATH prepend).
- `pnpm --filter @foundation/viewer test` passed 75 tests.
- Viewer build succeeded. Doctor: health `{ ok: true, service: foundation, db: up }`, Viewer GET 200, toolchain ok.
- `verify-http-drive.sh` exited 0 (Unlock reject/accept, MCP key does not unlock, cookie does not open MCP, sixth wrong unlock 429, Home empty peek).
- `verify-mcp-drive.sh` exited 0 (`POST /mcp` `tools/list`).
- HTTP Collection: `GET /view/api/types/task` `type.label` Task, views board/list/calendar/timeline/outline, `nodes` `[]`.
- HTTP Detail: `GET /view/api/nodes/00000000-0000-4000-8000-000000000000` 404 `{"error":"Not found"}`.
- HTTP Search: idle `{ searched: false, hits: [] }`; `q=zzzxnever` and `type=note` `{ searched: true, hits: [] }`.
- HTTP Journal write: `POST /view/api/journals/today` created type `journal`, `text/markdown`, empty body, title `September 4, 2026`. Second POST same id. `PATCH` title/body 200. Stale `base_updated_at` 409. PATCH non-journal skipped (no non-journal record; do not upsert).
- Browser chrome was not clicked. Same-path HTTP was the drive.

Evidence: `.cursor/skills/verify-foundation/evidence/20260904Tmaintain/` (gitignored).
