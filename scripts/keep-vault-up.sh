#!/usr/bin/env bash
# Keep the vault up. Quiet when green. Not a bot.
#
#   FOUNDATION_HEALTH_URL — optional. Default http://127.0.0.1:8787/health
#
# GET /health. If green, write nothing. If Docker is missing or not
# running, nag on stderr. Else `docker compose up -d` once from the
# clone (not --build). Wait about one minute. If health still fails,
# nag on stderr. Does not mkdir FOUNDATION_DATA. Does not write the
# graph. Does not put a live path in git.
set -euo pipefail

foundation_keep_vault_up_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  (cd "${script_dir}/.." && pwd)
}

foundation_keep_vault_up_health_url() {
  printf '%s\n' "${FOUNDATION_HEALTH_URL:-http://127.0.0.1:8787/health}"
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
  docker compose -f "${repo_root}/docker-compose.yml" --project-directory "${repo_root}" up -d >/dev/null
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

foundation_keep_vault_up_nag() {
  echo "vault is down: $*" >&2
}

foundation_keep_vault_up_main() {
  local repo_root

  if foundation_keep_vault_up_health_ok; then
    return 0
  fi

  if ! foundation_keep_vault_up_have_docker; then
    foundation_keep_vault_up_nag "Docker is not on this machine. Start Docker, then from the clone: docker compose up -d"
    return 1
  fi

  if ! foundation_keep_vault_up_engine_up; then
    foundation_keep_vault_up_nag "Docker is not running. Start Docker, then from the clone: docker compose up -d"
    return 1
  fi

  repo_root="$(foundation_keep_vault_up_repo_root)"
  if ! foundation_keep_vault_up_compose_up "${repo_root}"; then
    foundation_keep_vault_up_nag "compose up ran once and /health still failed. From the clone: docker compose up -d"
    return 1
  fi

  if foundation_keep_vault_up_wait_health; then
    return 0
  fi

  foundation_keep_vault_up_nag "compose up ran once and /health still failed. From the clone: docker compose up -d"
  return 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  foundation_keep_vault_up_main "$@"
fi
