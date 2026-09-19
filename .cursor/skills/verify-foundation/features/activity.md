# Activity

From a non-journal detail page, Activity lists that record's writes. A reversible row the person may undo offers Undo. Undo uses the same if-match family as MCP `undo`.

## Sub-features

- `activity-list` GET `/view/api/nodes/<id>/activity` returns `rows` with action, actor, actor_label, `created_at`, `summary`, `can_undo`, and `base_updated_at` when Undo is offered.
- `activity-undo` POST `/view/api/activity/<id>/undo` with `base_updated_at` inverts a reversible user **update**. The window button is gated on `can_undo` plus `base_updated_at`, not `reversible` alone.
- `activity-undo-clash` a stale or missing if-match refuses and does not invert.

## How to get to it (user POV)

- On a non-journal detail page, choose **Activity**. An inline markdown journal has no that control.
- Go to `/view/nodes/<uuid>/activity` after Unlock (live records only).

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked.
- The record has at least one Viewer write (see [Edit any node](./edit-any-node.md)).

- **HTTP list.** `GET /view/api/nodes/<id>/activity` with the vault key. A Viewer save row has `actor` `user`, `actor_label` `Viewer`, `created_at`, `summary`, and `can_undo` true.
- **HTTP undo.** `POST /view/api/activity/<id>/undo` with the row's `base_updated_at`. Status `200`. Title/status/data return to the prior values.
- **Window.** `[data-surface="activity-page"]`. **Undo** only when `can_undo` is true.

## Gotchas

- Undo of a delete is Restore from Trash when the person starts from a soft-deleted row. `/view/nodes/:id/activity` on a tombstone shows **Not found** because live GET is 404. HTTP `GET /view/api/nodes/:id/activity` still returns `200` and `{ "rows": [...] }` for that same tombstone.
- Missing or stale if-match is `409`, not a silent overwrite.
