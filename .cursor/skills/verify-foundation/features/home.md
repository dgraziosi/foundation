# Home

Home is the first surface after Unlock. It always offers **Today**, even when no journal exists yet (count 0). It also shows Recents (last 5 live records that are not tasks), Open tasks (5, from the `task` type's default filter, by due urgency), and type folders for types that have live records. Home does not write except by opening Today.

## Sub-features

- `home-today` always shows Today (`[data-surface="home-today"]`). Empty body: **Write today** and the calendar day. After a write: the day and the first sentence. Choose it to open `/view/journal/today`.
- `home-chrome` shows Recents, Open tasks, and a Types block when any type has a live count.
- `home-empty` shows **Nothing yet.** for Recents and **No open tasks.** when those lists are empty.
- `home-recents-all` opens the Recents page from Recents **View all**.
- `home-tasks-all` opens the task collection from Open tasks **View all**.
- `home-folder` opens that type's collection from a type folder.
- `home-open-record` opens a Recents row or an open-task row as a detail page.

## How to get to it (user POV)

- Unlock, land on `/view`.
- Choose **Home** in the left rail (or the pinned **Home** tab in the view strip).
- After closing the last collection or detail tab, the strip returns to Home.

## Driving it with verify-foundation

Preconditions:

- Doctor is green. Viewer dist is built for a browser drive.
- Session is unlocked (see [Unlock](./unlock.md)).
- A first-day empty vault is enough for `home-empty` and `home-today`. Do not seed a fake life.

- **Land.** After Unlock, `[data-surface="home"]` is in the page. **Today** is visible. Headings **Recents** and **Open tasks** are visible. Rail has **Home** and **Search**.
- **Today at count 0.** First-day: Today shows **Write today** and the calendar day. Choose Today. Path `/view/journal/today`. `[data-surface="journal-page"]`.
- **Empty Recents.** When there are no non-task live records, Recents shows **Nothing yet.**
- **Empty tasks.** When the `task` default view filter has no rows, Open tasks shows **No open tasks.**
- **Recents View all.** Choose Recents **View all**. The strip adds **Recents**. The page heading is `Recents`. Path `/view/recents`.
- **Tasks View all.** Choose Open tasks **View all**. Path `/view/types/task`. The collection heading includes **Task**.
- **Type folder.** When a folder is shown (count > 0), choose it. Path `/view/types/<slug>`. Types with count 0 do not appear.
- **Open a row.** Choose a Recents or open-task title. Path `/view/nodes/<uuid>`. `[data-surface="detail-page"]` and that title as the page heading. A journal with inline markdown opens the write page instead.
- **HTTP Home widgets.** `GET /view/api/recents?limit=5` and `GET /view/api/tasks?limit=5` and `GET /view/api/ontology` and `GET /view/api/journals/today` with the API key. The window caps Recents and Open tasks at 5. Empty first-day: `rows` and `tasks` are `[]`. Today peek may be `{ "node": null }`. Ontology lists types; folders in the window are those with `count > 0`.
- **Proof.** Screenshot Home with Today, Recents, and Open tasks visible, or save the JSON bodies (no personal titles if you drove a user's vault). Feature id `home-today` or `home-empty`.

## Gotchas

- Recents excludes tasks (open and completed). Open tasks is not Recents.
- Open tasks reads the `task` type's `default_view` filter (seed: `status = active`). Completed tasks on that widget while the type still declares that filter is a bug.
- Show completed lives on collection, not Home.
- Theme Light / Dark / System is rail chrome. It is not a Home feature.
- An ontology with zero live records hides the Types section. That is not a load error. Today still shows.
- Today is on Home at journal count 0. Journal write also starts from the journal collection **Today** or `/view/journal/today`.
