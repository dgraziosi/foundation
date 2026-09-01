# Journal write

Journal write would let the user create or edit a journal record in the Viewer. **It is not on this branch.** Do not implement it in a verification PR. `journal` is only a seed type: the window can list live journal records in a collection (list) once they exist. Bots still write journal records through MCP `upsert`. The window does not write.

## Sub-features

- `journal-write-page` — forthcoming. No create or edit page in Viewer.
- `journal-collection` — available now as a read-only collection at `/view/types/journal` when you need to see journal records. See [Collection](./collection.md).

## How to get to it (user POV)

- There is no user path for journal write on this branch.
- To read journal records that already exist: Home type folder **Journal** (only if count > 0), or `/view/types/journal` after Unlock.

## Driving it with verify-foundation

Preconditions:

- Do not build a journal write page to satisfy this file.
- If you only need to prove the window still treats `journal` as a type, use Collection.

- **Absent page.** Open Home, Search, and `/view/types/journal`. There is no **New journal**, no composer, and no edit control. Viewer copy stays display-only.
- **Collection only.** `GET /view/api/types/journal` with the API key returns the type (`label` Journal, `views` list). First-day: `nodes` is `[]` and the page shows **Nothing yet.**
- **Proof.** Record feature id `journal-write-page` as **blocked: not on this branch**. Do not mark it verified. A collection GET is not a write proof.

## Gotchas

- Seed type `journal` (hue orange, glyph NotebookPen, default list) is not a write surface.
- Do not upsert a journal record through MCP and call that Viewer journal write.
- Do not add capture, composer, or settings to the window to stand in for this feature.
