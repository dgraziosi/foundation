# Journal write

After unlock the window can write today’s journal: title and markdown body on the same record, with if-match. Writer is the user. Other types stay read-only. The cookie still does not open MCP.

## Sub-features

- `journal-today` — **Today** on the Journal collection opens today’s entry (`/view/journal/today`). If none exists, `POST /view/api/journals/today` creates one (actor `user`). First-day Home has no Today control.
- `journal-write-page` — opening a journal record opens the writing page. Title and markdown body only. Same record. Updates send if-match (`base_updated_at`). A clash does not overwrite.
- `journal-write-http` — `POST /view/api/journals/today` and `PATCH /view/api/nodes/:id` are real. Cookie or `Authorization: ApiKey`. Other types PATCH `403` `Journal writes only.`
- `journal-cookie-scope` — the unlock cookie still does not open `/mcp` or `/blobs/:id`.

## How to get to it (user POV)

- Unlock, then open `/view/types/journal` (first-day Home hides the Journal folder while count is 0). Choose **Today**.
- Open an existing journal record from collection, Recents, or search. That is the writing page, not the inspector.
- There is no Today on first-day Home. Do not treat Today-from-Home as verified.

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked (see [Unlock](./unlock.md)).
- A first-day vault is enough. Do not seed a fake life. HTTP create of today is the write.

- **No Today on Home.** After Unlock, Home has Recents and Open tasks. There is no Today control. Journal folder is hidden while count is 0.
- **Collection Today.** Go to `/view/types/journal`. Heading includes **Journal** and **Today**.
- **HTTP today.** Cookie from unlock (or `Authorization: ApiKey`). `POST http://127.0.0.1:8788/view/api/journals/today`. Status `200`. Body `node.type` is `journal`. Same id on a second POST the same day.
- **HTTP write.** `PATCH http://127.0.0.1:8788/view/api/nodes/<id>` with JSON `{ "title", "body", "base_updated_at" }`. Status `200`. Title and markdown body match. Activity actor is `user`.
- **If-match.** Repeat PATCH with the first `updated_at`. Status `409`. Title and body stay the previous write.
- **Other types.** PATCH a task or note id. Status `403`. Body includes `Journal writes only.` The other record is unchanged.
- **Cookie not MCP.** `POST http://127.0.0.1:8787/mcp` with only the `foundation_key` cookie. Not a successful tools call. MCP still needs `Authorization: ApiKey`.
- **Proof.** Save the POST/PATCH statuses and redacted bodies (no personal titles if you drove a user's vault). Feature id `journal-write-http` or `journal-today`.

## Gotchas

- First-day Home still has no Today. A later Viewer change may add it. Do not mark Today-from-Home verified.
- Do not upsert a journal through MCP and call that Viewer journal write.
- Empty title is `400`. The window may skip send on an empty title.
- Cookie `Path=/view` is not a write credential for `/mcp` or `/blobs/:id`.
