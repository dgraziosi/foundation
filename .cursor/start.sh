#!/usr/bin/env bash
# Per-boot Cloud Agent start: Docker daemon + Postgres (pgvector).
# Idempotent. Returns after Postgres is ready. Do not install packages here.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo /workspace)"

ensure_dockerd() {
  if sudo docker info >/dev/null 2>&1; then
    return 0
  fi
  sudo service docker start >/dev/null 2>&1 || true
  if sudo docker info >/dev/null 2>&1; then
    return 0
  fi
  sudo dockerd >/tmp/dockerd.start.log 2>&1 &
  for _ in $(seq 1 30); do
    if sudo docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "dockerd failed to start" >&2
  tail -n 50 /tmp/dockerd.start.log >&2 || true
  return 1
}

ensure_dockerd
sudo docker compose up -d db

for _ in $(seq 1 60); do
  if sudo docker compose exec -T db pg_isready -U foundation -d foundation >/dev/null 2>&1; then
    echo "Postgres is ready on 127.0.0.1:5432"
    exit 0
  fi
  sleep 2
done

echo "Postgres failed to become ready" >&2
sudo docker compose ps >&2 || true
sudo docker compose logs db >&2 || true
exit 1
