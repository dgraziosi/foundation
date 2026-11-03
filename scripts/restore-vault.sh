#!/usr/bin/env bash
# Restore this vault from a dated encrypted dump. Host script, not a bot wake.
# This FOUNDATION_DATA and this DATABASE_URL only. No host argument.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup-vault.sh
source "${script_dir}/backup-vault.sh"
# shellcheck source=keep-vault-up.sh
source "${script_dir}/keep-vault-up.sh"

FOUNDATION_RESTORE_LOCK=""
FOUNDATION_RESTORE_PLAIN_TMP=""
FOUNDATION_RESTORE_BLOB_STAGING=""

foundation_restore_usage() {
  echo "restore-vault: usage: ./scripts/restore-vault.sh --in-place --confirm YYYYMMDD" >&2
}

foundation_restore_lock_path() {
  printf '%s/.restore-lock\n' "${1%/}"
}

foundation_restore_failed_path() {
  printf '%s/.restore-failed\n' "${1%/}"
}

foundation_restore_lock_pid_is_live() {
  foundation_keep_vault_up_restore_lock_pid_is_live "$1"
}

foundation_restore_stop_app() {
  foundation_keep_vault_up_stop_app "$1"
}

foundation_restore_cleanup() {
  foundation_backup_discard "${FOUNDATION_RESTORE_PLAIN_TMP:-}" "${FOUNDATION_RESTORE_BLOB_STAGING:-}"
  if [[ -n "${FOUNDATION_RESTORE_LOCK:-}" ]]; then
    rm -f -- "${FOUNDATION_RESTORE_LOCK}"
  fi
  FOUNDATION_RESTORE_PLAIN_TMP=""
  FOUNDATION_RESTORE_BLOB_STAGING=""
  FOUNDATION_RESTORE_LOCK=""
}

foundation_restore_decrypt() {
  local identity="$1"
  local src="$2"
  local dest="$3"
  if ! command -v age >/dev/null 2>&1; then
    echo "restore-vault: age is required to decrypt dumps. The package name is unknown in this repo." >&2
    return 1
  fi
  if [[ ! -f "${identity}" ]]; then
    echo "restore-vault: BACKUP_AGE_IDENTITY is not a file" >&2
    return 1
  fi
  age -d -i "${identity}" -o "${dest}" -- "${src}"
}

foundation_restore_database_name() {
  python3 -c '
from urllib.parse import urlparse, unquote
import sys
u = urlparse(sys.stdin.read().strip())
database = unquote((u.path or "").lstrip("/") or "foundation")
database = database.split("?", 1)[0].split("/", 1)[0] or "foundation"
print(database)
'
}

foundation_restore_role_name() {
  python3 -c '
from urllib.parse import urlparse, unquote
import sys
u = urlparse(sys.stdin.read().strip())
print(unquote(u.username or "foundation"))
'
}

foundation_restore_ident() {
  python3 -c '
import sys
s = sys.argv[1]
print("\"" + s.replace("\"", "\"\"") + "\"")
' "$1"
}

foundation_restore_literal() {
  python3 -c '
import sys
s = sys.argv[1]
q = chr(39)
print(q + s.replace(q, q + q) + q)
' "$1"
}

foundation_restore_recreate_database() {
  local url="$1"
  local data_dir="${2:-}"
  local name owner ident_db ident_role lit_db postgres
  name="$(printf '%s\n' "${url}" | foundation_restore_database_name)" || return 1
  case "${name}" in
    postgres|template0|template1|"")
      echo "restore-vault: will not drop system database ${name:-empty}" >&2
      return 1
      ;;
  esac
  if ! command -v psql >/dev/null 2>&1; then
    echo "restore-vault: psql is required to recreate this vault's database" >&2
    return 1
  fi
  owner="$(printf '%s\n' "${url}" | foundation_restore_role_name)" || return 1
  ident_db="$(foundation_restore_ident "${name}")"
  ident_role="$(foundation_restore_ident "${owner}")"
  lit_db="$(foundation_restore_literal "${name}")"
  if [[ -z "${data_dir}" ]]; then
    data_dir="$(foundation_keep_vault_up_data_dir "$(foundation_keep_vault_up_repo_root)")"
  fi
  postgres="${data_dir%/}/postgres"
  if ! foundation_keep_vault_up_pg_running "${postgres}"; then
    if ! foundation_keep_vault_up_start_postgres "${data_dir}"; then
      echo "restore-vault: vault Postgres did not start from the data dir" >&2
      return 1
    fi
  fi
  # OS socket superuser. The app role does not create databases.
  foundation_keep_vault_up_psql_local "${postgres}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${lit_db} AND pid <> pg_backend_pid();" >/dev/null
  foundation_keep_vault_up_psql_local "${postgres}" -c "DROP DATABASE IF EXISTS ${ident_db};"
  foundation_keep_vault_up_psql_local "${postgres}" -c "CREATE DATABASE ${ident_db} OWNER ${ident_role};"
}

foundation_restore_load_sql() {
  local url="$1"
  local sql="$2"
  local url_file
  if ! command -v psql >/dev/null 2>&1; then
    echo "restore-vault: psql is required to load the dump" >&2
    return 1
  fi
  url_file="$(mktemp)"
  chmod 600 -- "${url_file}"
  printf '%s\n' "${url}" >"${url_file}"
  if ! foundation_keep_vault_up_psql_app "${url_file}" -f "${sql}"; then
    rm -f -- "${url_file}"
    return 1
  fi
  rm -f -- "${url_file}"
}

foundation_restore_stage_blobs() {
  local backup_abs="$1"
  local staging="$2"
  mkdir -p -- "${staging}"
  if [[ -d "${backup_abs}/blobs" ]]; then
    rsync -a --delete -- "${backup_abs}/blobs/" "${staging}/"
  fi
}

foundation_restore_main() {
  local in_place=0
  local confirm=""
  local repo_root data_dir backup_root data_abs backup_abs
  local url identity dump_path lock pid plain_tmp staging

  while (($# > 0)); do
    case "$1" in
      --in-place)
        in_place=1
        shift
        ;;
      --confirm)
        if (($# < 2)); then
          foundation_restore_usage
          return 1
        fi
        confirm="$2"
        shift 2
        ;;
      *)
        echo "restore-vault: unknown argument" >&2
        foundation_restore_usage
        return 1
        ;;
    esac
  done

  if ((in_place != 1)) || [[ ! "${confirm}" =~ ^[0-9]{8}$ ]]; then
    foundation_restore_usage
    return 1
  fi

  repo_root="$(foundation_backup_repo_root)"
  data_dir="$(foundation_backup_data_dir "${repo_root}")"
  backup_root="$(foundation_backup_backup_root "${data_dir}")"
  url="$(foundation_backup_database_url "${repo_root}")" || return 1
  identity="$(foundation_backup_age_identity "${repo_root}")" || return 1

  if [[ ! -d "${data_dir}" ]]; then
    echo "restore-vault: FOUNDATION_DATA is not a directory" >&2
    return 1
  fi

  data_abs="$(foundation_backup_abs "${data_dir}")"
  backup_abs="$(foundation_backup_abs "${backup_root}")"
  if foundation_backup_root_is_inside_data "${data_abs}" "${backup_abs}"; then
    echo "restore-vault: BACKUP_ROOT must be a sibling of the data dir, never inside FOUNDATION_DATA" >&2
    return 1
  fi

  dump_path="${backup_abs}/sql/foundation-${confirm}.sql.age"
  if [[ ! -f "${dump_path}" ]]; then
    echo "restore-vault: dump not found for that day" >&2
    return 1
  fi

  if [[ "${identity}" != /* ]]; then
    identity="${repo_root}/${identity#./}"
  fi

  lock="$(foundation_restore_lock_path "${data_abs}")"
  if [[ -e "${lock}" ]]; then
    pid="$(tr -d '[:space:]' < "${lock}" 2>/dev/null || true)"
    if foundation_restore_lock_pid_is_live "${pid}"; then
      echo "restore-vault: restore is already running for this vault" >&2
      return 1
    fi
    rm -f -- "${lock}"
  fi

  (
    set -euo pipefail
    printf '%s\n' "$$" >"${lock}"
    FOUNDATION_RESTORE_LOCK="${lock}"
    plain_tmp="$(mktemp "${data_abs}/restore.plain.XXXXXX")"
    chmod 0600 -- "${plain_tmp}"
    FOUNDATION_RESTORE_PLAIN_TMP="${plain_tmp}"
    trap 'foundation_restore_cleanup' EXIT

    if ! foundation_restore_decrypt "${identity}" "${dump_path}" "${plain_tmp}"; then
      echo "restore-vault: decrypt failed" >&2
      exit 1
    fi

    staging="$(mktemp -d "${data_abs}/blobs.staging.XXXXXX")"
    FOUNDATION_RESTORE_BLOB_STAGING="${staging}"
    if ! foundation_restore_stage_blobs "${backup_abs}" "${staging}"; then
      echo "restore-vault: blob stage failed" >&2
      exit 1
    fi
    if ! foundation_restore_stop_app "${data_abs}"; then
      echo "restore-vault: could not stop this vault's app" >&2
      exit 1
    fi
    failed="$(foundation_restore_failed_path "${data_abs}")"
    printf '%s\n' "in-place restore did not finish" >"${failed}"
    if ! foundation_restore_recreate_database "${url}" "${data_abs}"; then
      echo "restore-vault: recreate failed" >&2
      exit 1
    fi
    if ! foundation_restore_load_sql "${url}" "${plain_tmp}"; then
      echo "restore-vault: load failed" >&2
      exit 1
    fi
    if ! foundation_backup_swap_blobs "${data_abs}" "${staging}"; then
      echo "restore-vault: blob swap failed" >&2
      exit 1
    fi
    FOUNDATION_RESTORE_BLOB_STAGING=""

    rm -f -- "${plain_tmp}"
    FOUNDATION_RESTORE_PLAIN_TMP=""
    rm -f -- "${failed}"
    rm -f -- "${lock}"
    FOUNDATION_RESTORE_LOCK=""
    trap - EXIT
  )
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  foundation_restore_main "$@"
fi
