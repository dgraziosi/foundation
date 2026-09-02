#!/usr/bin/env bash
# Restore this vault from a dated encrypted dump. Host script, not a bot wake.
# This FOUNDATION_DATA and this DATABASE_URL only. No host argument.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup-vault.sh
source "${script_dir}/backup-vault.sh"

foundation_restore_usage() {
  echo "restore-vault: usage: ./scripts/restore-vault.sh --in-place --confirm YYYYMMDD" >&2
}

foundation_restore_lock_path() {
  printf '%s/.restore-lock\n' "${1%/}"
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

foundation_restore_load_sql() {
  local url="$1"
  local sql="$2"
  if ! command -v psql >/dev/null 2>&1; then
    echo "restore-vault: psql is required to load the dump" >&2
    return 1
  fi
  psql "${url}" -v ON_ERROR_STOP=1 -f "${sql}"
}

foundation_restore_copy_blobs() {
  local backup_abs="$1"
  local data_abs="$2"
  if [[ ! -d "${backup_abs}/blobs" ]]; then
    return 0
  fi
  mkdir -p -- "${data_abs}/blobs"
  rsync -a --delete -- "${backup_abs}/blobs/" "${data_abs}/blobs/"
}

foundation_restore_main() {
  local in_place=0
  local confirm=""
  local repo_root data_dir backup_root data_abs backup_abs
  local url identity dump_path lock plain_tmp

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
    echo "restore-vault: restore is already running for this vault" >&2
    return 1
  fi
  printf '%s\n' "$$" >"${lock}"
  plain_tmp="$(mktemp "${data_abs}/restore.plain.XXXXXX")"
  chmod 0600 -- "${plain_tmp}"
  trap 'rm -f -- "${plain_tmp}"; rm -f -- "${lock}"' EXIT

  if ! foundation_restore_decrypt "${identity}" "${dump_path}" "${plain_tmp}"; then
    echo "restore-vault: decrypt failed" >&2
    return 1
  fi
  if ! foundation_restore_copy_blobs "${backup_abs}" "${data_abs}"; then
    echo "restore-vault: blob copy failed" >&2
    return 1
  fi
  if ! foundation_restore_load_sql "${url}" "${plain_tmp}"; then
    echo "restore-vault: load failed" >&2
    return 1
  fi

  rm -f -- "${plain_tmp}"
  rm -f -- "${lock}"
  trap - EXIT
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  foundation_restore_main "$@"
fi
