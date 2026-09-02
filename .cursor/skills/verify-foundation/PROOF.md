# Proofs

Journal write is on this branch. Home always offers **Today**, even at journal count 0. **Today** (`/view/journal/today`, `POST /view/api/journals/today`) creates today's journal if none is live. The page autosaves title and one markdown body on that record (`PATCH /view/api/nodes/:id`). An empty title shows **Keep a title**. Unlock title is **Unlock.** The field is the vault key. The error is **That key did not unlock.** Other types stay display-only. The Viewer cookie does not unlock MCP.

Historical proof runs below may mention older door copy. The current window is the paragraph above.

Live journal HTTP was not driven on the VMs that ran these proofs. Host Postgres 16 was not on PATH (`initdb`, `pg_ctl`, `psql`). That is a run limitation. The feature is on the branch.

## Generate run (20260901Tproof1)

The generated skill was executed once. Cleanup did not delete evidence.

Launch refused. Postgres 16 was not on PATH. Doctor reported health down. After `pnpm --filter @foundation/viewer build`, doctor reported Viewer dist present.

Live Unlock HTTP was not driven. Host programs never started.

What that run drove instead, as the skill allows when launch is blocked:

- Feature id `unlock-door`. The built Viewer bundle contained the unlock door and button **Unlock**. Current door copy is **Unlock.** / vault key / **That key did not unlock.**
- Viewer tests passed. The write contract is `window writes journal only`.
- `pnpm test` exited 0. `skills-layout.test: ok`. Server tests that need `DATABASE_URL` skipped.

Nothing that run started. Cleanup left evidence at `.cursor/skills/verify-foundation/evidence/20260901Tproof1/`.

## Maintain run (20260901Tmaintain)

Launch refused again. Same Postgres gap. Same rule: do not guess an installer.

What that run drove:

- `verify-foundation.test.sh` exited 0.
- `pnpm --filter @foundation/viewer test` passed 50 tests, including `journal page is a document; today is the start path` and `window writes journal only`.
- Viewer build succeeded. Doctor then reported Viewer dist present.
- The built dist contained Unlock copy, Home empty copy, Search idle and empty copy, Detail `Not found.`, and the journal invite `Write a first sentence.`

Live `/view` unlock, session, and journal POST/PATCH were not driven. Cleanup left evidence at `.cursor/skills/verify-foundation/evidence/20260901Tmaintain/`.

## Maintain run (20260902Tmaintain)

Launch refused. Postgres 16 was not on PATH. Same rule: do not guess an installer. Doctor reported health down and Viewer dist missing until the Viewer build.

Map corrections this run (source + Viewer tests; not a live `/view` drive):

- Cookie-scope recipe now POSTs `/mcp` and GETs agent `/blobs/:id` with the accept cookie. `GET /mcp` is never a tools call.
- Skill Drive HTTP now includes Home's Today peek `GET /view/api/journals/today` (does not create).

What that run drove:

- `verify-foundation.test.sh` exited 0 (including the cookie-scope and peek GET locks).
- `pnpm --filter @foundation/viewer test` passed 75 tests, including Home Today at empty body, Unlock vault-key copy, journal page, leave-flush, and `window writes journal only`.
- Viewer build succeeded. Doctor then reported Viewer dist present. The built dist contained Unlock copy, Home **Write today**, Search idle and empty copy, Detail **Not found.**, **Keep a title**, and the journal invite **Write a first sentence.**
- `pnpm test` exited 0. Server tests that need `DATABASE_URL` skipped. `skills-layout.test: ok`.
- Live `/view` unlock, session, peek GET, and journal POST/PATCH were not driven.

Cleanup left evidence at `.cursor/skills/verify-foundation/evidence/20260902Tmaintain/`.
