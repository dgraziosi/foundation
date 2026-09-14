# Activity

From a detail page, Activity lists that record's writes. A reversible row the person may undo offers Undo. Undo uses the same if-match family as MCP `undo`.

## Sub-features

- `activity-list` GET `/view/api/nodes/<id>/activity` returns action, actor, actor_label, time, and a short what-changed line.
- `activity-undo` POST `/view/api/activity/<id>/undo` with `base_updated_at` inverts a reversible user write.
- `activity-undo-clash` a stale or missing if-match refuses and does not invert.

## How to get to it (user POV)

- On a detail page, choose **Activity**.
- Go to `/view/nodes/<uuid>/activity` after Unlock.

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Session unlocked.
- The record has at least one Viewer write (see [Edit any node](./edit-any-node.md)).

- **HTTP list.** `GET /view/api/nodes/<id>/activity` with the vault key. A Viewer save row has `actor` `user` and `actor_label` `Viewer`.
- **HTTP undo.** `POST /view/api/activity/<id>/undo` with the row's `base_updated_at`. Status `200`. Title/status/data return to the prior values.
- **Window.** `[data-surface="activity-page"]`. **Undo** on a reversible row.

## Gotchas

- Undo of a delete is Restore from Trash when the person starts from a soft-deleted row.
- Missing or stale if-match is `409`, not a silent overwrite.
