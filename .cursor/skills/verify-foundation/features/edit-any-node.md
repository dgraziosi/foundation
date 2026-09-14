# Edit any node

An unlocked person can change title, status, and declared scalar fields on a live non-journal record. Saves use if-match. A clash offers Reload and keeps the draft. Journal stays the writing page.

## Sub-features

- `edit-title-status` PATCHes title and status on a live non-journal node with `base_updated_at`.
- `edit-declared-field` PATCHes one ontology-declared scalar field (for example person `org`) with the same CAS.
- `edit-clash` a stale `base_updated_at` returns `409` and does not clobber.
- `edit-empty-title` an empty title does not save. The window shows **Keep a title** and does not PATCH. HTTP PATCH with `title` empty is `400` and GET still shows the prior title.
- `edit-journal-body-only` a PATCH that includes `body` on a non-journal record still returns `403` **Journal writes only.**

## How to get to it (user POV)

- Open a non-journal detail page. Edit the title, status, or a declared field. Wait for **Saved**.
- HTTP: `PATCH /view/api/nodes/<id>` with title, status, data, and `base_updated_at`. Do not send `body`.

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked.
- A live non-journal node exists (seed or MCP `upsert` with the throwaway API key). Do not use MCP `upsert` to stand in for the Viewer save.

- **HTTP edit.** `PATCH /view/api/nodes/<id>` `{ title, status, data, base_updated_at }`. Status `200`. Reload GET shows the new values.
- **HTTP clash.** Repeat the same stale `base_updated_at`. Status `409`. GET still shows the saved values.
- **Window.** Title field `aria-label="Title"`. Status `aria-label="Status"`. Empty title shows **Keep a title** and does not PATCH. Save copy **Saving** / **Saved** / **Couldn't save**. Clash offers **Reload**.

## Gotchas

- Journal body writes still go through the journal page (`body` on PATCH).
- Do not edit relation edges from this page.
- Recents shows the new title after a successful save.
