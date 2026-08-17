#!/usr/bin/env bash
# Per-boot startup for Foundation Cloud Agents.
#
# The base snapshot already contains Docker (configured for this nested VM) and
# the pgvector/pgvector:pg16 image. Dependencies are installed by the `install`
# script (pnpm install --frozen-lockfile). This script does per-boot work only:
#   1. Ensure a local .env exists (it is gitignored, so absent on a fresh checkout).
#   2. Start the Docker daemon.
#   3. Bring up Postgres (pgvector) via docker compose and wait for health.
#   4. Run the Foundation MCP server in dev mode (hot reload), staying attached.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '[start.sh] %s\n' "$*"; }

# 1. Local env config. Gitignored, so recreate it if the checkout does not have one.
if [ ! -f .env ]; then
  log "creating .env"
  cat > .env <<'EOF'
FOUNDATION_API_KEY=dev-local-foundation-key-please-change
DATABASE_URL=postgres://foundation:foundation@localhost:5432/foundation
FOUNDATION_DATA=./data
PORT=8787
EOF
fi
set -a
. ./.env
set +a

# 2. Docker daemon (idempotent: only start it if it is not already up).
if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: docker is not installed in this base image"
  exit 1
fi
if ! sudo docker info >/dev/null 2>&1; then
  log "starting dockerd"
  sudo bash -c 'nohup dockerd >/tmp/dockerd.log 2>&1 &'
  for _ in $(seq 1 30); do
    sudo docker info >/dev/null 2>&1 && break
    sleep 1
  done
  if ! sudo docker info >/dev/null 2>&1; then
    log "ERROR: dockerd did not become ready"
    tail -n 20 /tmp/dockerd.log 2>/dev/null || true
    exit 1
  fi
fi

# 3. Postgres (pgvector). Idempotent: compose reconciles the running container.
log "bringing up Postgres (pgvector)"
sudo -E docker compose up -d db
DBID="$(sudo docker compose ps -q db)"
for _ in $(seq 1 60); do
  if [ -n "$DBID" ] && sudo docker exec "$DBID" pg_isready -U foundation -d foundation >/dev/null 2>&1; then
    log "Postgres is ready"
    break
  fi
  sleep 1
done

# 4. Foundation MCP server (dev mode, hot reload). Runs migrations + seed on boot,
#    then stays attached so its logs are visible to the agent.
log "starting Foundation server (pnpm dev) on :${PORT:-8787}"
exec pnpm dev
