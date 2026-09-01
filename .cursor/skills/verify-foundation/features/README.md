# Foundation Viewer verification map

This directory is the maintained source for verifying the user-facing Viewer. Read the index before driving the window, then use the matching feature file as the recipe.

Foundation is a life graph. Viewer is the human window on one vault. After unlock it can write today’s journal (title and markdown body, same record, if-match, actor user). Other types stay read-only. The cookie still does not open MCP. Bots write the rest through MCP. Do not treat this map as a personal-knowledge-management checklist or a harness memory test.

## Baseline preconditions

- Official start: clone root, `FOUNDATION_API_KEY` set, empty first-day `FOUNDATION_DATA` (or the user's existing vault on that machine), then `./scripts/keep-vault-up.sh`. Ready: `GET http://127.0.0.1:8787/health` returns `{ "ok": true, "service": "foundation", "db": "up" }`.
- Viewer: `http://127.0.0.1:8788/view`. MCP / health / agent blobs: `http://127.0.0.1:8787`.
- Verification runs use `.cursor/skills/verify-foundation/scripts/verify-foundation.sh launch` so the data dir and `BACKUP_ROOT` are disposable. Do not invent a live personal vault. Do not seed a fake life. Later `doctor` / `cleanup` / Unlock use `run-id` and `key-file` from that launch.
- Run `verify-foundation.sh doctor` and require health green, Viewer GET 200, and (for a full window drive) `apps/viewer/dist/index.html`.
- Never drive an instance this run did not start, unless the user already has a vault up and asked you to use it. One instance on `8787` / `8788` / `5432`.
- Host programs: Postgres 16 on PATH (`initdb`, `pg_ctl`, `psql`) plus `pnpm start`. The package name is unknown in this repo. If launch cannot start, report the missing program and prove Viewer tests / Viewer build instead.

## Driving conventions

- Start every recipe from Unlock unless the instance is already unlocked in that browser session.
- Prefer headings, button names, `aria-label`, and `data-surface` over CSS position.
- Browser first. Same-path HTTP (`/view/unlock`, `/view/api/*`) when a browser cannot run. Say which you used.
- Journal write is the one Viewer write. Drive `POST /view/api/journals/today` and `PATCH /view/api/nodes/:id`. Do not upsert through MCP to simulate a Viewer write. Other types stay read-only.
- Restore nothing after a Viewer drive (there is no mutation). Keep proof artifacts.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes a screenshot with the Foundation mark or the unlock heading visible, plus an ARIA snapshot when the harness can take one.
- HTTP proof includes the command (redact the key), status, and a redacted body.
- Record the feature ID and entry point with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition (for example: Postgres 16 not on PATH; `apps/viewer/dist` missing).
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-foundation` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Unlock](./unlock.md) covers the door: wrong key, right key, session, cookie scope.
- [Home](./home.md) covers Recents, open tasks, type folders, and empty copy.
- [Collection](./collection.md) covers a type's declared layouts, empty/filtered copy, and Show completed.
- [Detail](./detail.md) covers opening one record as a page from Home, collection, Recents, search, or graph.
- [Search](./search.md) covers the rail overlay, query, type/status filters, and opening a hit.
- [Journal write](./journal-write.md) is live: title and markdown body, same record, if-match, actor user. HTTP `POST /view/api/journals/today` and `PATCH` are real. First-day Home still has no Today.
