# AGENTS.md

Foundation is a self-hosted, typed knowledge-graph "vault" exposed over an MCP HTTP surface. It is a pnpm + TypeScript monorepo:

- `apps/server` (`@foundation/server`) — Express + MCP server (health, `/mcp`, `/view` read-only window, `/blobs`).
- `packages/db` (`@foundation/db`) — Postgres access, SQL migrations, seed.
- `packages/schema` (`@foundation/schema`) — pure schema/validation logic.

Product/setup docs live in `README.md` and `docs/`. Standard scripts are in root `package.json` (`dev`, `start`, `build`/`typecheck`, `test`, `bootstrap`) and `apps/server`/`packages/*` `package.json`.

## Cursor Cloud specific instructions

Cloud Agent `install` (`.cursor/install.sh`) installs Docker (fuse-overlayfs, containerd-snapshotter disabled, iptables-legacy), pnpm deps, a gitignored `.env`, and pulls `pgvector/pgvector:pg16`. `start` (`.cursor/start.sh`) starts the Docker daemon and Postgres only — it does **not** start the Foundation server.

Services and how to run them:

- Postgres (pgvector) — already up after `start` on `127.0.0.1:5432` (user/pass/db all `foundation`). If you need to recreate it: `sudo docker compose up -d db`. Use `sudo docker` here; group membership from install may not apply to the current session. A plain Postgres image will not work: migrations need `vector`, `unaccent`, and `pgcrypto`.
- Foundation server — for development run it on the host with hot reload: `set -a && source .env && set +a && pnpm dev`. It auto-runs migrations + seed on boot and listens on `:8787` (`/health` no-auth, `/mcp` and `/view` require the API key). Full production-style stack is `sudo docker compose up --build` (runs `pnpm start`, not dev).

Required config: a gitignored `.env` at the repo root (created during install from `.env.example`). It sets `FOUNDATION_API_KEY` and `DATABASE_URL=postgres://foundation:foundation@localhost:5432/foundation`. Login shells source `/workspace/.env`. The server loads `.env` automatically, but the tests read `process.env.DATABASE_URL` directly, so `source .env` (export it) before running tests if it is not already in the environment.

Testing caveats:

- Tests skip silently when `DATABASE_URL` is unset (they don't fail — they just don't test anything). Always export it first.
- Run the full workspace suite serialized: `pnpm -r --workspace-concurrency=1 test`. Do NOT run plain `pnpm -r test` / `pnpm test` against a single Postgres: the `db` and `server` packages run in parallel and both issue `CREATE EXTENSION IF NOT EXISTS vector`, which races on Postgres's global catalog and fails with `duplicate key value violates unique constraint "pg_extension_name_index"`. This is a harness concurrency artifact, not a real failure. Per-package runs (e.g. `pnpm --filter @foundation/db test`) are safe because they are single-process.
- The root `pnpm test` also runs `scripts/backup-vault.test.sh` and `scripts/harness-docs.test.sh`; those print intentional "failed" lines for error-path cases and end with `ok`.
