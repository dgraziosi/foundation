#!/usr/bin/env bash
# Keep the vault up. Quiet when actually green (health + real cluster).
# Not a bot.
#
#   FOUNDATION_HEALTH_URL — optional. Default http://127.0.0.1:8787/health
#   FOUNDATION_DATA       — the vault (default ./data under the clone;
#                           also read from the clone .env)
#
# GET /health. If Docker is missing or not running, nag on stderr.
# Else start Compose once from the clone (do not rebuild). Wait about
# one minute. If health still fails, nag. /health green is not enough:
# on an existing data dir after a start, refuse or nag if PG_VERSION
# (or the live Postgres files) is missing, or if the live record count
# is 0. Compose can serve an empty cluster while the real graph is
# still on disk. Does not mkdir an empty live cluster over a miss.
# Does not write the graph. Does not put a live path in git.
set -euo pipefail

foundation_keep_vault_up_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  (cd "${script_dir}/.." && pwd)
}

foundation_keep_vault_up_health_url() {
  printf '%s\n' "${FOUNDATION_HEALTH_URL:-http://127.0.0.1:8787/health}"
}

# FOUNDATION_DATA from the environment, else the clone .env, else ./data.
# Relative paths are under the clone. Does not print .env.
foundation_keep_vault_up_data_dir() {
  local repo_root="$1"
  local raw="${FOUNDATION_DATA:-}"
  local line

  if [[ -z "${raw}" && -f "${repo_root}/.env" ]]; then
    line="$(grep -E '^[[:space:]]*FOUNDATION_DATA=' "${repo_root}/.env" | tail -n 1 || true)"
    raw="${line#*FOUNDATION_DATA=}"
    raw="${raw%$'\r'}"
    if [[ "${raw}" == \"*\" && "${raw}" == *\" ]]; then
      raw="${raw#\"}"
      raw="${raw%\"}"
    fi
  fi
  raw="${raw:-./data}"
  raw="${raw%/}"
  if [[ "${raw}" != /* ]]; then
    printf '%s\n' "${repo_root}/${raw#./}"
  else
    printf '%s\n' "${raw}"
  fi
}

# HTTP 200 and { ok: true, service: "foundation", db: "up" }.
foundation_keep_vault_up_body_is_green() {
  local body="$1"
  printf '%s' "${body}" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
if data.get("ok") is True and data.get("service") == "foundation" and data.get("db") == "up":
    sys.exit(0)
sys.exit(1)
'
}

foundation_keep_vault_up_health_ok() {
  local url body
  url="$(foundation_keep_vault_up_health_url)"
  body="$(curl -fsS --max-time 5 "${url}" 2>/dev/null || true)"
  foundation_keep_vault_up_body_is_green "${body}"
}

foundation_keep_vault_up_have_docker() {
  command -v docker >/dev/null 2>&1
}

foundation_keep_vault_up_engine_up() {
  docker info >/dev/null 2>&1
}

# Once. Not --build. Quiet so a healed run writes nothing.
foundation_keep_vault_up_compose_up() {
  local repo_root="$1"
  docker compose -f "${repo_root}/docker-compose.yml" --project-directory "${repo_root}" up -d >/dev/null 2>&1
}

# About one minute: 12 tries, 5 seconds apart.
foundation_keep_vault_up_wait_health() {
  local i
  local tries="${FOUNDATION_KEEP_VAULT_UP_TRIES:-12}"
  local pause="${FOUNDATION_KEEP_VAULT_UP_SLEEP:-5}"
  i=0
  while ((i < tries)); do
    if foundation_keep_vault_up_health_ok; then
      return 0
    fi
    sleep "${pause}"
    i=$((i + 1))
  done
  return 1
}

# Live records only. Does not mkdir.
foundation_keep_vault_up_live_node_count() {
  local repo_root="$1"
  docker compose -f "${repo_root}/docker-compose.yml" --project-directory "${repo_root}" \
    exec -T db psql -U foundation -d foundation -tAc \
    "SELECT COUNT(*) FROM nodes WHERE deleted_at IS NULL"
}

foundation_keep_vault_up_nag() {
  echo "vault is down: $*" >&2
}

# postgres/ without PG_VERSION is a miss. Do not mkdir. Do not compose up.
foundation_keep_vault_up_refuse_miss() {
  local data_dir="$1"
  local postgres="${data_dir%/}/postgres"
  local pg_version="${postgres}/PG_VERSION"

  if [[ -e "${postgres}" && ! -e "${pg_version}" ]]; then
    foundation_keep_vault_up_nag "Postgres files are missing from the data dir (no PG_VERSION). Do not create an empty cluster over that miss."
    return 1
  fi
  return 0
}

# After a start (or when /health is already green): existing data dir must
# have the live Postgres files and at least one record. /health green is
# not enough. Does not mkdir.
foundation_keep_vault_up_cluster_ok() {
  local repo_root="$1"
  local data_dir="$2"
  local postgres="${data_dir%/}/postgres"
  local pg_version="${postgres}/PG_VERSION"
  local count

  if [[ -e "${postgres}" && ! -e "${pg_version}" ]]; then
    foundation_keep_vault_up_nag "Postgres files are missing from the data dir (no PG_VERSION). Do not create an empty cluster over that miss."
    return 1
  fi
  if [[ ! -e "${pg_version}" ]]; then
    foundation_keep_vault_up_nag "Postgres files are missing from the data dir (no PG_VERSION). Do not create an empty cluster over that miss."
    return 1
  fi

  count="$(foundation_keep_vault_up_live_node_count "${repo_root}" || true)"
  count="$(printf '%s' "${count}" | tr -d '[:space:]')"
  if [[ ! "${count}" =~ ^[0-9]+$ ]]; then
    foundation_keep_vault_up_nag "could not count records in the live cluster."
    return 1
  fi
  if ((count == 0)); then
    foundation_keep_vault_up_nag "the vault is up but it has no records. If you already had a graph, the real files may still be on disk. Do not create an empty cluster over them."
    return 1
  fi
  return 0
}

foundation_keep_vault_up_main() {
  local repo_root data_dir

  repo_root="$(foundation_keep_vault_up_repo_root)"
  data_dir="$(foundation_keep_vault_up_data_dir "${repo_root}")"

  if ! foundation_keep_vault_up_refuse_miss "${data_dir}"; then
    return 1
  fi

  if foundation_keep_vault_up_health_ok; then
    foundation_keep_vault_up_cluster_ok "${repo_root}" "${data_dir}"
    return $?
  fi

  if ! foundation_keep_vault_up_have_docker; then
    foundation_keep_vault_up_nag "Docker is not on this machine. Start Docker, then from the clone: docker compose up -d"
    return 1
  fi

  if ! foundation_keep_vault_up_engine_up; then
    foundation_keep_vault_up_nag "Docker is not running. Start Docker, then from the clone: docker compose up -d"
    return 1
  fi

  if ! foundation_keep_vault_up_compose_up "${repo_root}"; then
    foundation_keep_vault_up_nag "compose up failed to start. From the clone: docker compose up -d"
    return 1
  fi

  if ! foundation_keep_vault_up_wait_health; then
    foundation_keep_vault_up_nag "compose up ran once and /health still failed. From the clone: docker compose up -d"
    return 1
  fi

  foundation_keep_vault_up_cluster_ok "${repo_root}" "${data_dir}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  foundation_keep_vault_up_main "$@"
fi
