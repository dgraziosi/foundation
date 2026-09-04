#!/usr/bin/env bash
# Activity retention prune. Host script, not a bot wake.
# Deletes activity older than vault_settings.activity_retention_days.
# Bots may claim job name activity-prune before a pass. This script
# does not claim. DATABASE_URL comes from the environment, else the
# clone .env. No silent default.
set -euo pipefail

foundation_activity_prune_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  (cd "${script_dir}/.." && pwd)
}

foundation_activity_prune_env_value() {
  local repo_root="$1"
  local key="$2"
  local raw=""
  local line

  eval "raw=\"\${${key}:-}\""
  if [[ -z "${raw}" && -f "${repo_root}/.env" ]]; then
    line="$(grep -E "^[[:space:]]*${key}=" "${repo_root}/.env" | tail -n 1 || true)"
    raw="${line#*"${key}"=}"
    raw="${raw%$'\r'}"
    if [[ "${raw}" == \"*\" && "${raw}" == *\" ]]; then
      raw="${raw#\"}"
      raw="${raw%\"}"
    fi
  fi
  printf '%s\n' "${raw}"
}

foundation_activity_prune_database_url() {
  local repo_root="$1"
  local raw
  raw="$(foundation_activity_prune_env_value "${repo_root}" DATABASE_URL)"
  if [[ -z "${raw}" ]]; then
    echo "activity-prune: DATABASE_URL is unset. Copy .env.example to .env and fill it." >&2
    return 1
  fi
  printf '%s\n' "${raw}"
}

main() {
  local repo_root
  repo_root="$(foundation_activity_prune_repo_root)"
  DATABASE_URL="$(foundation_activity_prune_database_url "${repo_root}")"
  export DATABASE_URL
  cd "${repo_root}"
  exec pnpm --filter @foundation/db prune-activity
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
