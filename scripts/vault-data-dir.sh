#!/usr/bin/env bash
# Host-readable live vault data dir. Same user as Postgres and the app.
# Health is the host-side check.
#
#   prepare <data-dir>  — refuse if postgres/ exists without PG_VERSION
#   health <data-dir>   — fail if this user cannot read PG_VERSION
#
#   FOUNDATION_DATA     — the vault (default ./data)
#
# Empty first-day folder may init. Existing folder without PG_VERSION:
# refuse. Does not mkdir. Does not grant ACLs. Does not use a second uid.
set -euo pipefail

foundation_vault_data_dir_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  (cd "${script_dir}/.." && pwd)
}

foundation_vault_data_dir_abs() {
  local raw="${1%/}"
  if command -v realpath >/dev/null 2>&1 && realpath -m / >/dev/null 2>&1; then
    realpath -m -- "${raw}"
    return 0
  fi
  python3 -c 'import os, sys; print(os.path.abspath(sys.argv[1]))' "${raw}"
}

# Empty first-day folder may init. postgres/ already present without
# PG_VERSION is a miss: refuse. Does not mkdir.
foundation_vault_data_dir_prepare() {
  local data_dir="$1"
  local postgres="${data_dir%/}/postgres"

  if [[ ! -e "${postgres}" ]]; then
    return 0
  fi
  if [[ ! -e "${postgres}/PG_VERSION" ]]; then
    echo "vault-data-dir: postgres/ exists without PG_VERSION; refuse (do not init over a miss)" >&2
    return 1
  fi
  return 0
}

# Host-side health: this user can read PG_VERSION.
# Never creates postgres/ or PG_VERSION.
foundation_vault_data_dir_health_pg_version() {
  local data_dir="$1"
  local pg_version="${data_dir%/}/postgres/PG_VERSION"

  if [[ ! -r "${pg_version}" ]]; then
    echo "vault-data-dir: host cannot read postgres/PG_VERSION" >&2
    return 1
  fi
  return 0
}

foundation_vault_data_dir_usage() {
  echo "vault-data-dir: prepare|health <data-dir>" >&2
  return 2
}

foundation_vault_data_dir_main() {
  local cmd="${1:-}"
  local data_dir="${2:-${FOUNDATION_DATA:-./data}}"
  case "${cmd}" in
    prepare) foundation_vault_data_dir_prepare "${data_dir}" ;;
    health) foundation_vault_data_dir_health_pg_version "${data_dir}" ;;
    *) foundation_vault_data_dir_usage ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  foundation_vault_data_dir_main "$@"
fi
