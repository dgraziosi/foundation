# First proof (20260901Tproof1)

The generated skill was executed once. Cleanup did not delete evidence.

## Launch / doctor

- Official start remains `./scripts/keep-vault-up.sh` then wait for `GET http://127.0.0.1:8787/health`.
- This VM did not have Postgres 16 on PATH (`initdb`, `pg_ctl`, `psql`). The package name is unknown in this repo. Launch refused. It did not guess an installer. It did not invent a live personal vault.
- Doctor: health down; instance not worth driving. After `pnpm --filter @foundation/viewer build`, doctor reported Viewer dist present.

## Drive (Unlock)

Live door (`http://127.0.0.1:8788/view` POST `/view/unlock`) was not driven — host programs never started.

What was driven instead, as the skill allows when launch is blocked:

- Feature id `unlock-door`. Built Viewer bundle contains `Unlock the vault window`, `Same key as MCP`, `API key required`, and `Unlock`.
- `pnpm --filter @foundation/viewer test` — 47 passed, including `window stays GET-only except unlock`.
- `pnpm test` — exit 0. `skills-layout.test: ok`. Server tests that need `DATABASE_URL` skipped (including the live read-only window suite).

## Cleanup

- Nothing this run started. `cleanup` left evidence in place.

## Evidence

Run folder (gitignored bodies): `.cursor/skills/verify-foundation/evidence/20260901Tproof1/`

Journal write was not driven on this first proof. The map now treats it as live (`POST /view/api/journals/today` and `PATCH`). First-day Home still has no Today.
