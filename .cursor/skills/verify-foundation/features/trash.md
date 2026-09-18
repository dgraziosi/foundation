# Trash

Soft-deleted records leave Recents, collections, and live search. They appear in Trash. Restore returns them live.

## Sub-features

- `trash-list` GET `/view/api/trash` lists type, title, and deleted time. Empty: **Nothing in trash.**
- `trash-delete` DELETE `/view/api/nodes/<id>` with `base_updated_at` soft-deletes a live record.
- `trash-restore` POST `/view/api/nodes/<id>/restore` with the trash row's `updated_at` returns the record live.

## How to get to it (user POV)

- Choose **Trash** in the rail.
- From a non-journal detail page, choose **Move to trash**. An inline markdown journal has no that control.
- Go to `/view/trash` after Unlock.

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked.
- A live record was soft-deleted (Viewer delete or MCP `delete` with the throwaway key).

- **HTTP delete.** `DELETE /view/api/nodes/<id>` `{ base_updated_at }`. Status `200`. GET that id is `404`. Recents no longer lists it.
- **HTTP trash.** `GET /view/api/trash`. Body `{ "rows": [...] }` with `id`, `type`, `title`, `deleted_at`, `updated_at`. Empty HTTP is `{ "rows": [] }`. The row is present after delete.
- **HTTP restore.** `POST /view/api/nodes/<id>/restore` `{ base_updated_at }` from the trash row's `updated_at`. Status `200` with the live node document (`node.id`, `node.title`). The record is live again.
- **Window.** `[data-surface="trash-page"]`. Empty copy **Nothing in trash.** A row offers **Restore**.

## Gotchas

- Blob bytes are not purged.
- Restore prefers undo-of-delete when that activity row is still reversible.
- Inline markdown journals have no **Move to trash**. Soft-delete them only over HTTP, not from the write page.
