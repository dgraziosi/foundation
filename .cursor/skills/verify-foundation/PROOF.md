# Proofs

Journal write is on this branch. Home always offers **Today**, even at journal count 0. **Today** (`/view/journal/today`, `POST /view/api/journals/today`) creates today's journal if none is live. The page autosaves title and one markdown body on that record (`PATCH /view/api/nodes/:id`). An empty title shows **Keep a title**. Unlock title is **Unlock.** The field is the vault key. The error is **That key did not unlock.** Other types stay display-only. The Viewer cookie does not unlock MCP.

Historical proof runs below may mention older door copy. The current window is the paragraph above.

Live journal HTTP was not driven on the VMs that ran these proofs. Host Postgres 16 was not on PATH (`initdb`, `pg_ctl`, `psql`). That is a run limitation. The feature is on the branch.

## Named proof `jobs-lease-10`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=jobs-lease-10`). Doctor green. `tools/list` returned 15 tools including `job`.

MCP on `http://127.0.0.1:8787/mcp`:

1. `job` `{ action: "claim", name: "dream" }` held the name and returned a token. Same-key claim without the token → `{ error: "Held" }` and no token.
2. `claim` with that token heartbeated. `finish` stamped `last_run` from the holder and opened the name. `read` returned last run and never a token.
3. Claim after finish succeeded with a new token. `release` opened and left `last_run` alone. Claim after release succeeded. Stale finish → `{ error: "Not holding" }`. Read of an unused name was an open virtual row.
4. Cleanup removed the disposable run root. Evidence stayed under `.cursor/skills/verify-foundation/evidence/jobs-lease-10/`. Tokens and keys were redacted.

## Named proof `drift-read-9`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=drift-read-9`). Doctor green. `scripts/drift-read.sh` on the first-day graph printed five empty buckets and `drift-read: quiet`.

Planted fixture spend (no amount/currency/stage), isolate note, twin titles, leftover identity bag via SQL, and `mention.who` after a SQL soft-delete of the person (declared ref; extra UUID keys do not count). The report put each in the right bucket. `list_activity` count stayed 7 across a second read. Cleanup removed the disposable run root. Evidence stayed under `.cursor/skills/verify-foundation/evidence/drift-read-9/`.

## Named proof `revalidate-edges-8`

Throwaway vault via `verify-foundation.sh launch` (`VERIFY_RUN_ID=revalidate-edges-8`). Doctor green. Root key had destructive scope. `confirm` was not used.

MCP on `http://127.0.0.1:8787/mcp`:

1. Retype a `task` with a live `child_of` to `note` without if-match → `Missing base_updated_at`. With if-match → `{ error: Cannot retype to "note": live child_of edge would no longer be allowed, suggestion: unlink first }`. `get` still showed `type: task` and the edge.
2. Delete a `person` that a `mention.who` ref pointed at, without if-match → `Missing base_updated_at`. With if-match → refuse inbound ref fields; the person stayed live. Clear `who`, then delete succeeded.
3. Cleanup removed the disposable run root. Evidence stayed under `.cursor/skills/verify-foundation/evidence/revalidate-edges-8/`.

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

## CI Postgres run (`ci-postgres-50`)

Throwaway vault via `verify-foundation.sh launch`. Not a personal vault. Doctor green before MCP. Cleanup removed `/tmp/foundation-verify-ci-postgres-50`.

What that run drove:

- `env -u DATABASE_URL pnpm --filter @foundation/server test` exited 1 with `DATABASE_URL is required; refusing to skip database tests`. Same for `@foundation/db`. No skip-pass.
- `scripts/require-database-url.test.sh` exited 0.
- Doctor: health `{ ok: true, service: foundation, db: up }`. Viewer GET 200. Toolchain ok.
- `verify-http-drive.sh` exited 0 (Unlock accept + Home empty copy).
- `verify-mcp-drive.sh` exited 0. `POST /mcp` `tools/list` returned HTTP 200 and 14 tools including `bootstrap`, `search`, and `get`. No new tool. No Viewer write.
- Server tests on the throwaway `DATABASE_URL` ran (0 skipped). One host-cluster FTS snippet assertion missed `fiancée` in the headline. GitHub `verify` runs the same suite against the `pgvector/pgvector:pg16` service.

Evidence: `.cursor/skills/verify-foundation/evidence/ci-postgres-50/` (gitignored).
