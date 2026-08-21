#!/usr/bin/env bash
# Host-readable live vault data dir. Contract helper. Compose does not
# call this yet.
#
# After a real cluster exists, the host user who runs Compose can read
# $FOUNDATION_DATA/postgres/PG_VERSION and $FOUNDATION_DATA/blobs.
# Unix mode stays 0700 or 0750, never world-writable.
#
#   FOUNDATION_DATA           — the vault (default ./data)
#   FOUNDATION_HOST_UID       — optional. Numeric uid of the host user
#                               who runs Compose. Never a baked-in 1000.
#   FOUNDATION_HOST_UID_PROBE — optional. File whose owner is that user
#                               (default: docker-compose.yml in the clone)
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

# Uid of the host user who runs Compose. Not a baked-in 1000.
foundation_vault_data_dir_host_uid() {
  local probe raw
  if [[ -n "${FOUNDATION_HOST_UID:-}" ]]; then
    raw="${FOUNDATION_HOST_UID}"
    if [[ ! "${raw}" =~ ^[0-9]+$ ]]; then
      echo "vault-data-dir: FOUNDATION_HOST_UID must be a numeric uid" >&2
      return 1
    fi
    printf '%s\n' "${raw}"
    return 0
  fi
  probe="${FOUNDATION_HOST_UID_PROBE:-}"
  if [[ -z "${probe}" ]]; then
    probe="$(foundation_vault_data_dir_repo_root)/docker-compose.yml"
  fi
  if [[ ! -e "${probe}" ]]; then
    echo "vault-data-dir: set FOUNDATION_HOST_UID or FOUNDATION_HOST_UID_PROBE to the host user who runs Compose" >&2
    return 1
  fi
  stat -c '%u' -- "${probe}"
}

# First compose up on an empty data dir may init. postgres/ already
# present without PG_VERSION is a miss: refuse. Does not mkdir.
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

# Host-side health: the user who runs Compose can read PG_VERSION.
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

# Named POSIX ACL read for the host user after a real cluster exists.
# Re-apply after the official image chmod 00700 on PGDATA (that call
# zeros the ACL mask). Does not mkdir a missing live path.
foundation_vault_data_dir_grant_host_read() {
  local data_dir="$1"
  local postgres blobs pg_version uid

  data_dir="${data_dir%/}"
  postgres="${data_dir}/postgres"
  blobs="${data_dir}/blobs"
  pg_version="${postgres}/PG_VERSION"

  if [[ ! -e "${pg_version}" ]]; then
    echo "vault-data-dir: no live cluster (PG_VERSION missing); will not grant or mkdir" >&2
    return 1
  fi
  if ! command -v setfacl >/dev/null 2>&1; then
    echo "vault-data-dir: setfacl is required to grant host read" >&2
    return 1
  fi

  uid="$(foundation_vault_data_dir_host_uid)" || return 1

  setfacl -m "u:${uid}:rX" -- "${postgres}"
  setfacl -m "u:${uid}:r" -- "${pg_version}"
  if [[ -d "${blobs}" ]]; then
    setfacl -R -m "u:${uid}:rX" -- "${blobs}"
    setfacl -d -m "u:${uid}:rX" -- "${blobs}"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "vault-data-dir: source this file; Compose does not call it yet" >&2
  exit 2
fi
