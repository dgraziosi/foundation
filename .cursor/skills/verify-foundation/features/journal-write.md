# Journal write

Journal write is the Viewer's only write. After Unlock, **Today** on the journal collection (or `/view/journal/today`) creates today's New York calendar journal if none is live, then opens it as a page. The user edits the title and the markdown body. The window autosaves. Other types stay display-only. Bots still write everything else through MCP.

## Sub-features

- `journal-write-today` opens `/view/journal/today`, POSTs `/view/api/journals/today`, and lands on today's journal (`[data-surface="journal-page"]`).
- `journal-write-page` shows the day label, title field `aria-label="Title"`, and the editor (`data-editor="live-markdown"`, placeholder **Write a first sentence.**).
- `journal-write-save` persists title and body (debounce) via `PATCH /view/api/nodes/:id`. A second Today returns the same live id.
- `journal-write-only` refuses a PATCH on a non-journal record (`403` **Journal writes only.**).
- `journal-collection` is still the read-only list at `/view/types/journal`. See [Collection](./collection.md). **Today** leaves that list for this page.

## How to get to it (user POV)

- After Unlock, go to `/view/types/journal` and choose **Today**.
- Go to `/view/journal/today` after Unlock.
- Open an existing journal record with inline markdown from Recents, collection, search, or `/view/nodes/<uuid>` — the same route renders this page, not Properties.

Home has no Today control. A Journal type folder appears on Home only after a live journal exists (count > 0) and opens the collection, not this page.

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked. Viewer dist is built for a browser drive.
- A first-day vault is enough: Today creates the day's journal. That is the allowed Viewer write. Do not MCP `upsert` a journal to stand in for it.
- If launch cannot start (Postgres 16 not on PATH), prove the source contract (`pnpm --filter @foundation/viewer test`, including `journal page is a document` and `window writes journal only`) and do not mark a live write verified.

- **Collection door.** Open `/view/types/journal`. Heading includes **Journal**. First-day: **Nothing yet.** Link **Today**.
- **Today.** Choose **Today** (or open `/view/journal/today`). `[data-surface="journal-page"]`. Day label is the created calendar day. Title `aria-label="Title"` (first create: that calendar day, for example `September 1, 2026`). Editor placeholder **Write a first sentence.**
- **Save.** Change the title and a sentence. Wait about a second. Reload the node or POST Today again. Title and body persisted.
- **HTTP today.** `curl -sS -X POST http://127.0.0.1:8788/view/api/journals/today -H "Authorization: ApiKey $(cat "${KEY_FILE}")"`. Status `200`. `node.type` is `journal`. `node.payload.media_type` is `text/markdown`. First create: `node.payload.body` is `""`. A second POST returns the same `node.id`.
- **HTTP save.** `curl -sS -X PATCH http://127.0.0.1:8788/view/api/nodes/<id> -H "Authorization: ApiKey $(cat "${KEY_FILE}")" -H "content-type: application/json" -d "{\"title\":\"Morning\",\"body\":\"# Morning\\n\\nWrote in the window.\\n\",\"base_updated_at\":\"<updated_at>\"}"`. Status `200`. Stale `base_updated_at` → `409`. PATCH a note → `403` `{"error":"Journal writes only."}`.
- **Proof.** Screenshot the journal page (day label + Title), or save the today POST and the PATCH (no personal body if you drove a user's vault). Feature id `journal-write-today` or `journal-write-page`.

## Gotchas

- Home does not link to Today. After Today creates a row, Home may show a Journal folder and that row in Recents. That is the write's side effect, not a seed fake life.
- Opening `/view/nodes/<journal-uuid>` is this page (`journal-page`), not `[data-surface="detail-page"]` and not Properties.
- Do not call MCP `upsert` and call that Viewer journal write.
- The cookie unlocks this write. It still does not unlock `/mcp` or agent `/blobs/:id`.
- Empty title does not save (`400` **Title is required.**).
