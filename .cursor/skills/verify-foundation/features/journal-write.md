# Journal write

Journal write is the Viewer's only write. After Unlock, **Today** on Home (or the journal collection, or `/view/journal/today`) creates today's journal for the vault timezone (seed: `America/New_York`) if none is live, then opens it as a page. The user edits the title and the markdown body. The window autosaves. Other types stay display-only. Bots still write everything else through MCP.

## Sub-features

- `journal-write-today` opens `/view/journal/today`, POSTs `/view/api/journals/today`, and lands on today's journal (`[data-surface="journal-page"]`).
- `journal-write-page` shows the day label, title field `aria-label="Title"`, and the editor (`data-editor="live-markdown"`, placeholder **Write a first sentence.**). An empty title keeps that journal's calendar day and shows **Keep a title**.
- `journal-write-save` persists title and body (debounce) via `PATCH /view/api/nodes/:id`. A second Today returns the same live id. Copy is **Saving**, **Saved**, or **Couldn't save**. A clash offers **Reload** and keeps the draft.
- `journal-write-leave` flushes a dirty draft when the person leaves. A clash or failed write on leave still keeps the draft and offers Reload / Couldn't save when they come back. A cached sibling journal that keeps the writing page mounted still flushes the journal they left. Coming back after a landed leave shows the flushed body.
- `journal-write-only` refuses a PATCH on a non-journal record (`403` **Journal writes only.**).
- `journal-collection` is still the read-only list at `/view/types/journal`. See [Collection](./collection.md). **Today** leaves that list for this page.

## How to get to it (user POV)

- After Unlock, choose **Today** on Home.
- After Unlock, go to `/view/types/journal` and choose **Today**.
- Go to `/view/journal/today` after Unlock.
- Open an existing journal record with inline markdown from Recents, collection, search, or `/view/nodes/<uuid>` — the same route renders this page, not Properties.

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked. Viewer dist is built for a browser drive.
- A first-day vault is enough: Today creates the day's journal. That is the allowed Viewer write. Do not MCP `upsert` a journal to stand in for it.
- If launch cannot start after the helper has tried `/usr/lib/postgresql/16/bin`, prove the source contract (`pnpm --filter @foundation/viewer test`, including `journal page is a document` and the mounted leave-flush test) and do not mark a live write verified.

- **Home door.** Open Home. Today is visible at journal count 0. Choose **Today**.
- **Collection door.** Open `/view/types/journal`. Heading includes **Journal**. First-day: **Nothing yet.** Link **Today**.
- **Today.** Choose **Today** (or open `/view/journal/today`). `[data-surface="journal-page"]`. Day label is the created calendar day. Title `aria-label="Title"` (first create: that vault day's title, for example `September 4, 2026` on a seed New York vault). Editor placeholder **Write a first sentence.**
- **Keep a title.** Clear the title. The page shows **Keep a title**. The write still uses that journal's calendar day, not wall-clock today on a past entry.
- **Save.** Change the title and a sentence. Wait about a second. Reload the node or POST Today again. Title and body persisted.
- **Leave flush.** Type, then leave before the debounce lands. Reopen. The flushed body is on the page when the person has not typed again. A clash or failed leave still shows the draft with **Couldn't save**, and a clash offers **Reload**.
- **HTTP today.** `curl -sS -X POST http://127.0.0.1:8788/view/api/journals/today -H "Authorization: ApiKey $(cat "${KEY_FILE}")"`. Status `200`. `node.type` is `journal`. `node.payload.media_type` is `text/markdown`. First create: `node.payload.body` is `""`. A second POST returns the same `node.id`.
- **HTTP save.** `curl -sS -X PATCH http://127.0.0.1:8788/view/api/nodes/<id> -H "Authorization: ApiKey $(cat "${KEY_FILE}")" -H "content-type: application/json" -d "{\"title\":\"Morning\",\"body\":\"# Morning\\n\\nWrote in the window.\\n\",\"base_updated_at\":\"<updated_at>\"}"`. Status `200`. Stale `base_updated_at` → `409`. PATCH a note → `403` `{"error":"Journal writes only."}`.
- **Proof.** Screenshot the journal page (day label + Title), or save the today POST and the PATCH (no personal body if you drove a user's vault). Feature id `journal-write-today` or `journal-write-page`.

## Gotchas

- Home always offers Today, including at journal count 0. After Today creates a row, Home may show a Journal folder and that row in Recents. That is the write's side effect, not a seed fake life.
- Opening `/view/nodes/<journal-uuid>` is this page (`journal-page`), not `[data-surface="detail-page"]` and not Properties. Switching to another cached journal can keep the writing page mounted. Leave must still flush the journal they left.
- Do not call MCP `upsert` and call that Viewer journal write.
- The cookie unlocks this write. It still does not unlock `/mcp` or agent `/blobs/:id`.
- An empty title shows **Keep a title** and writes that journal's calendar day.
- Server Today create/lookup follows `vault_settings.timezone` (seed `America/New_York`). Viewer chrome — Home's day, the page day label, and the empty-title fallback — still formats `America/New_York`. A first-day vault still matches New York.
