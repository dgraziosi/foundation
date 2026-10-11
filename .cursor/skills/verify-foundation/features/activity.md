# Activity

From a non-journal detail page, Activity lists that record's writes. A reversible row the person may undo offers Undo. Undo uses the same if-match family as MCP `undo`.

## Sub-features

- `activity-list` GET `/view/api/nodes/<id>/activity` returns `rows` with action, actor, actor_label, `created_at`, `summary`, `can_undo`, and `base_updated_at` when Undo is offered.
- `activity-undo` POST `/view/api/activity/<id>/undo` with `base_updated_at` inverts a reversible row when `can_undo` is true. The window button is gated on `can_undo` plus `base_updated_at`, not `reversible` alone. A Viewer **update** is the usual proof: the `200` body is the live node with title, status, and data back at the prior snapshot. A **Created** row can also offer Undo. That invert soft-deletes the record. The `200` body is `{ "ok": true, "activity_id": "…" }` with no live `node`. Live GET is then `404`.
- `activity-undo-clash` a stale or missing if-match refuses and does not invert.

## How to get to it (user POV)

- On a non-journal detail page, choose **Activity**. An inline markdown journal has no that control.
- Go to `/view/nodes/<uuid>/activity` after Unlock (live records only).

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked.
- Update Undo: the record has at least one Viewer write (see [Edit any node](./edit-any-node.md)). Created Undo: a live record from MCP `upsert` with the throwaway API key is enough.

- **HTTP list.** `GET /view/api/nodes/<id>/activity` with the vault key. A Viewer save row has `actor` `user`, `actor_label` `Viewer`, `created_at`, `summary`, and `can_undo` true. A **Created** row can also carry `can_undo` true and `base_updated_at`.
- **HTTP undo (update).** `POST /view/api/activity/<id>/undo` with the update row's `base_updated_at`. Status `200`. Body includes `node.title` / `node.status` / `node.data` at the prior values.
- **HTTP undo (create).** `POST /view/api/activity/<id>/undo` with the **Created** row's `base_updated_at`. Status `200`. Body `{ "ok": true, "activity_id": "…" }` and no `node`. Live `GET /view/api/nodes/<id>` is `404`. `GET /view/api/trash` lists that id.
- **Window.** `[data-surface="activity-page"]`. **Undo** only when `can_undo` is true.

## Gotchas

- Undo of a delete is Restore from Trash when the person starts from a soft-deleted row. Undo of **Created** is the same soft-delete family: the record leaves Recents and appears in Trash. `/view/nodes/:id/activity` on a tombstone shows **Not found** because live GET is 404. HTTP `GET /view/api/nodes/:id/activity` still returns `200` and `{ "rows": [...] }` for that same tombstone.
- Missing or stale if-match is `409`, not a silent overwrite.
