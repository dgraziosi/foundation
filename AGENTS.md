# AGENTS.md

Foundation is a self-hosted, typed knowledge-graph "vault" exposed over an MCP HTTP surface. It is a pnpm + TypeScript monorepo:

- `apps/server` (`@foundation/server`) — Express + MCP server (health, `/mcp`, `/view` read-only window, `/blobs`).
- `packages/db` (`@foundation/db`) — Postgres access, SQL migrations, seed.
- `packages/schema` (`@foundation/schema`) — pure schema/validation logic.

Product/setup docs live in `README.md` and `docs/`. Standard scripts are in root `package.json` (`dev`, `start`, `build`/`typecheck`, `test`, `bootstrap`) and `apps/server`/`packages/*` `package.json`.

## Cursor Cloud specific instructions

The base VM snapshot already has: pnpm deps installed, Docker installed/configured for this VM (fuse-overlayfs storage driver, containerd-snapshotter disabled, iptables set to legacy), and the `pgvector/pgvector:pg16` image pulled. The startup update script only refreshes pnpm deps — the services below are NOT auto-started, so start them yourself when you need them.

Services and how to run them:

- Postgres (pgvector) — the only runtime dependency. It provides the `vector`, `unaccent`, and `pgcrypto` extensions the migrations require, so a plain Postgres will not work. Start the Docker daemon if it is not running (`sudo dockerd &`, or check `sudo docker info`), then bring up just the DB with `sudo docker compose up -d db` (it publishes `127.0.0.1:5432`, user/pass/db all `foundation`). `docker compose` needs `sudo` here because the daemon runs as root in this VM.
- Foundation server — for development run it on the host with hot reload: `set -a && source .env && set +a && pnpm dev`. It auto-runs migrations + seed on boot and listens on `:8787` (`/health` no-auth, `/mcp` and `/view` require the API key). Full production-style stack is `sudo docker compose up --build` (runs `pnpm start`, not dev).

Required config: a gitignored `.env` at the repo root (copy from `.env.example`). It must set `FOUNDATION_API_KEY` (any long string) and, for host/dev runs, `DATABASE_URL=postgres://foundation:foundation@localhost:5432/foundation`. The server loads `.env` automatically, but the tests read `process.env.DATABASE_URL` directly, so `source .env` (export it) before running tests.

Testing caveats:

- Tests skip silently when `DATABASE_URL` is unset (they don't fail — they just don't test anything). Always export it first.
- Run the full workspace suite serialized: `pnpm -r --workspace-concurrency=1 test`. Do NOT run plain `pnpm -r test` / `pnpm test` against a single Postgres: the `db` and `server` packages run in parallel and both issue `CREATE EXTENSION IF NOT EXISTS vector`, which races on Postgres's global catalog and fails with `duplicate key value violates unique constraint "pg_extension_name_index"`. This is a harness concurrency artifact, not a real failure. Per-package runs (e.g. `pnpm --filter @foundation/db test`) are safe because they are single-process.
- The root `pnpm test` also runs `scripts/backup-vault.test.sh` and `scripts/harness-docs.test.sh`; those print intentional "failed" lines for error-path cases and end with `ok`.
