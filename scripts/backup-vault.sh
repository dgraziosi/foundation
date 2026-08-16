#!/usr/bin/env bash
# Nightly vault backup. Driven only by env. Do not stop Compose.
#
#   FOUNDATION_DATA  — the vault (default ./data)
#   BACKUP_ROOT      — optional. Default: sibling of the data dir
#                      (./foundation-backups when FOUNDATION_DATA is ./data).
#                      Must not be inside FOUNDATION_DATA.
#
# Writes $BACKUP_ROOT/sql/foundation-YYYYMMDD.sql (mode 0600),
# rsyncs $FOUNDATION_DATA/blobs/ → $BACKUP_ROOT/blobs/,
# and rewrites $BACKUP_ROOT/MANIFEST. Same-day rerun overwrites that day's
# dump. On failure, the last good dump and MANIFEST stay in place.
set -euo pipefail

FOUNDATION_BACKUP_SQL_GLOB='foundation-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].sql'
FOUNDATION_BACKUP_KEEP_DAYS=14

foundation_backup_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  (cd "${script_dir}/.." && pwd)
}

foundation_backup_abs() {
  local raw="${1%/}"
  if command -v realpath >/dev/null 2>&1 && realpath -m / >/dev/null 2>&1; then
    realpath -m -- "${raw}"
    return 0
  fi
  python3 -c 'import os, sys; print(os.path.abspath(sys.argv[1]))' "${raw}"
}

foundation_backup_default_root() {
  local data_dir="${1%/}"
  printf '%s/foundation-backups\n' "$(dirname -- "${data_dir}")"
}

# Refuse a backup root at or under the live vault. Never write dumps into FOUNDATION_DATA.
foundation_backup_root_is_inside_data() {
  local data_abs="$1"
  local backup_abs="$2"
  [[ "${backup_abs}" == "${data_abs}" || "${backup_abs}" == "${data_abs}/"* ]]
}

foundation_backup_sql_cutoff() {
  if date -d "${FOUNDATION_BACKUP_KEEP_DAYS} days ago" +%Y%m%d >/dev/null 2>&1; then
    date -d "${FOUNDATION_BACKUP_KEEP_DAYS} days ago" +%Y%m%d
    return 0
  fi
  if date -v-"${FOUNDATION_BACKUP_KEEP_DAYS}"d +%Y%m%d >/dev/null 2>&1; then
    date -v-"${FOUNDATION_BACKUP_KEEP_DAYS}"d +%Y%m%d
    return 0
  fi
  return 1
}

foundation_backup_sql_date() {
  local name
  name="$(basename -- "$1")"
  printf '%s\n' "${name#foundation-}" | sed 's/\.sql$//'
}

# Delete dated dumps older than 14 days. Never delete the last remaining dump.
foundation_backup_prune_sql() {
  local sql_dir="$1"
  local cutoff=""
  local -a dumps=()
  local f remaining dump_date

  if [[ ! -d "${sql_dir}" ]]; then
    return 0
  fi

  while IFS= read -r f; do
    [[ -n "${f}" ]] || continue
    dumps+=("${f}")
  done < <(find "${sql_dir}" -maxdepth 1 -type f -name "${FOUNDATION_BACKUP_SQL_GLOB}" | LC_ALL=C sort)

  if ((${#dumps[@]} <= 1)); then
    return 0
  fi

  if ! cutoff="$(foundation_backup_sql_cutoff)"; then
    echo "backup-vault: cannot compute prune cutoff; leaving dumps in place" >&2
    return 0
  fi

  for f in "${dumps[@]}"; do
    remaining="$(find "${sql_dir}" -maxdepth 1 -type f -name "${FOUNDATION_BACKUP_SQL_GLOB}" | wc -l | tr -d ' ')"
    if ((remaining <= 1)); then
      break
    fi
    dump_date="$(foundation_backup_sql_date "${f}")"
    if [[ "${dump_date}" < "${cutoff}" ]]; then
      rm -f -- "${f}"
    fi
  done
}

foundation_backup_sha256() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -- "${file}" | awk '{print $1}'
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -- "${file}" | awk '{print $1}'
    return 0
  fi
  echo "backup-vault: need sha256sum or shasum" >&2
  return 1
}

foundation_backup_git_sha() {
  local repo_root="$1"
  if git -C "${repo_root}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "${repo_root}" rev-parse HEAD
  fi
}

foundation_backup_blob_count() {
  local blobs_dir="$1"
  if [[ ! -d "${blobs_dir}" ]]; then
    printf '0\n'
    return 0
  fi
  find "${blobs_dir}" -type f | wc -l | tr -d ' '
}

foundation_backup_write_manifest() {
  local backup_root="$1"
  local day="$2"
  local dump_path="$3"
  local git_sha="$4"
  local manifest tmp size checksum blobs

  manifest="${backup_root}/MANIFEST"
  tmp="$(mktemp "${manifest}.tmp.XXXXXX")"
  size="$(wc -c < "${dump_path}" | tr -d ' ')"
  checksum="$(foundation_backup_sha256 "${dump_path}")"
  blobs="$(foundation_backup_blob_count "${backup_root}/blobs")"

  {
    printf 'date=%s\n' "${day}"
    printf 'dump=sql/foundation-%s.sql\n' "${day}"
    printf 'dump_size=%s\n' "${size}"
    printf 'blob_count=%s\n' "${blobs}"
    if [[ -n "${git_sha}" ]]; then
      printf 'git_sha=%s\n' "${git_sha}"
    fi
    printf 'dump_checksum=sha256:%s\n' "${checksum}"
  } >"${tmp}"
  mv -- "${tmp}" "${manifest}"
}

foundation_backup_compose_exec() {
  local repo_root="$1"
  shift
  docker compose -f "${repo_root}/docker-compose.yml" --project-directory "${repo_root}" exec -T "$@"
}

foundation_backup_main() {
  local data_dir backup_root repo_root data_abs backup_abs
  local day dump_path dump_tmp git_sha

  data_dir="${FOUNDATION_DATA:-./data}"
  data_dir="${data_dir%/}"
  if [[ -n "${BACKUP_ROOT:-}" ]]; then
    backup_root="${BACKUP_ROOT%/}"
  else
    backup_root="$(foundation_backup_default_root "${data_dir}")"
  fi

  if [[ ! -d "${data_dir}" ]]; then
    echo "backup-vault: FOUNDATION_DATA is not a directory: ${data_dir}" >&2
    return 1
  fi

  data_abs="$(foundation_backup_abs "${data_dir}")"
  backup_abs="$(foundation_backup_abs "${backup_root}")"
  if foundation_backup_root_is_inside_data "${data_abs}" "${backup_abs}"; then
    echo "backup-vault: BACKUP_ROOT must be a sibling of the data dir, never inside FOUNDATION_DATA" >&2
    return 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "backup-vault: docker is required for online pg_dump" >&2
    return 1
  fi
  if ! command -v rsync >/dev/null 2>&1; then
    echo "backup-vault: rsync is required to copy blobs" >&2
    return 1
  fi

  repo_root="$(foundation_backup_repo_root)"
  mkdir -p -- "${backup_abs}/sql" "${backup_abs}/blobs"

  day="$(date +%Y%m%d)"
  dump_path="${backup_abs}/sql/foundation-${day}.sql"
  dump_tmp="$(mktemp "${dump_path}.tmp.XXXXXX")"
  chmod 0600 -- "${dump_tmp}"

  # Online dump. Compose stays up. Temp file so a failed dump cannot replace the last good copy.
  if ! foundation_backup_compose_exec "${repo_root}" db pg_dump -U foundation -d foundation >"${dump_tmp}"; then
    rm -f -- "${dump_tmp}"
    echo "backup-vault: pg_dump failed; last good dump and MANIFEST left in place" >&2
    return 1
  fi
  if [[ ! -s "${dump_tmp}" ]]; then
    rm -f -- "${dump_tmp}"
    echo "backup-vault: pg_dump wrote an empty file; last good dump and MANIFEST left in place" >&2
    return 1
  fi
  mv -- "${dump_tmp}" "${dump_path}"
  chmod 0600 -- "${dump_path}"

  # One blob tree, not a dated copy. Skip uploads/ and the live postgres/ cluster.
  if [[ -d "${data_abs}/blobs" ]]; then
    rsync -a --delete -- "${data_abs}/blobs/" "${backup_abs}/blobs/"
  fi

  git_sha="$(foundation_backup_git_sha "${repo_root}" || true)"
  foundation_backup_write_manifest "${backup_abs}" "${day}" "${dump_path}" "${git_sha}"
  foundation_backup_prune_sql "${backup_abs}/sql"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  foundation_backup_main "$@"
fi
