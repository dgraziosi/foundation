# AGENTS.md

Foundation is a self-hosted, typed knowledge-graph "vault" exposed over an MCP HTTP surface. It is a pnpm + TypeScript monorepo:

- `apps/server` (`@foundation/server`) — Express + MCP server (health, `/mcp`, `/view` read-only window, `/blobs`).
- `packages/db` (`@foundation/db`) — Postgres access, SQL migrations, seed.
- `packages/schema` (`@foundation/schema`) — pure schema/validation logic.

Product/setup docs live in `README.md` and `docs/`. Standard scripts are in root `package.json` (`dev`, `start`, `build`/`typecheck`, `test`, `bootstrap`) and `apps/server`/`packages/*` `package.json`.

## Cursor Cloud specific instructions

The base VM snapshot already has: Docker installed/configured for this nested VM (fuse-overlayfs storage driver, containerd-snapshotter disabled, iptables set to legacy) and the `pgvector/pgvector:pg16` image pulled. The environment scripts are:

- `install`: `pnpm install --frozen-lockfile` — refreshes workspace deps after checkout.
- `start`: `bash .cursor/start.sh` — per-boot startup that creates `.env` if missing, starts the Docker daemon, brings up Postgres (pgvector) via `docker compose up -d db`, then runs the Foundation server with `pnpm dev` (hot reload, stays attached). Its output goes to the start logs.

So on a normally-booted agent the DB and server are already running; `/health` at `:8787` should return `{"ok":true,...}`. If you need to run things manually (e.g. the start script is not active):

- Postgres (pgvector) is the only runtime dependency and supplies the `vector`, `unaccent`, and `pgcrypto` extensions the migrations require, so a plain Postgres will not work. Ensure dockerd is up (`sudo docker info`, else `sudo dockerd &`), then `sudo -E docker compose up -d db` (publishes `127.0.0.1:5432`, user/pass/db all `foundation`). `docker compose` needs `sudo` because the daemon runs as root here.
- Foundation server (dev): `set -a && source .env && set +a && pnpm dev` — auto-runs migrations + seed, listens on `:8787` (`/health` no-auth, `/mcp` and `/view` require the API key). Full production-style stack: `sudo docker compose up --build`.

Config: `.cursor/start.sh` writes a gitignored `.env` (from the `.env.example` shape) with `FOUNDATION_API_KEY` and `DATABASE_URL=postgres://foundation:foundation@localhost:5432/foundation`. The server loads `.env` automatically, but the tests read `process.env.DATABASE_URL` directly, so `source .env` (export it) before running tests.

Testing caveats:

- Tests skip silently when `DATABASE_URL` is unset (they don't fail — they just don't test anything). Always export it first.
- Run the full workspace suite serialized: `pnpm -r --workspace-concurrency=1 test`. Do NOT run plain `pnpm -r test` / `pnpm test` against a single Postgres: the `db` and `server` packages run in parallel and both issue `CREATE EXTENSION IF NOT EXISTS vector`, which races on Postgres's global catalog and fails with `duplicate key value violates unique constraint "pg_extension_name_index"`. This is a harness concurrency artifact, not a real failure. Per-package runs (e.g. `pnpm --filter @foundation/db test`) are safe because they are single-process.
- The root `pnpm test` also runs `scripts/backup-vault.test.sh` and `scripts/harness-docs.test.sh`; those print intentional "failed" lines for error-path cases and end with `ok`.
