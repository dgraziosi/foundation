#!/usr/bin/env bash
# Nightly vault backup. Host script, not a bot wake.
# Talks to localhost Postgres. Does not stop the vault.
# FOUNDATION_DATA, BACKUP_ROOT, DATABASE_URL, BACKUP_AGE_RECIPIENT,
# BACKUP_KEEP_DAYS, and BACKUP_OFFSITE come from the environment, else
# the clone .env, same as keep-vault-up. Relative paths are under the clone.
#
#   FOUNDATION_DATA         — the vault (default ./data under the clone)
#   DATABASE_URL            — required. Environment, else the clone .env.
#                             No silent default. Copy .env.example and fill it.
#   BACKUP_ROOT             — optional. Also read from the clone .env.
#                             Default: sibling of the data dir
#                             (./foundation-backups when FOUNDATION_DATA is ./data).
#                             Relative paths are under the clone.
#                             Must not be inside FOUNDATION_DATA.
#   BACKUP_AGE_RECIPIENT    — required. age public recipient. Refuse dump if unset.
#   BACKUP_KEEP_DAYS        — optional. Default 14. Integer of 1 or more.
#   BACKUP_OFFSITE          — optional. Directory this machine can write.
#                             After a good run, rsync sql/, MANIFEST, and blobs/.
#                             Must not be inside FOUNDATION_DATA or BACKUP_ROOT.
#
# Writes $BACKUP_ROOT/sql/foundation-YYYYMMDD.sql.age (mode 0600),
# rsyncs $FOUNDATION_DATA/blobs/ into a staging tree, rewrites
# $BACKUP_ROOT/MANIFEST from that temp dump and staging tree, then
# moves the dump and MANIFEST into place and swaps staging into
# $BACKUP_ROOT/blobs/. Same-day success overwrites that day's dump and
# ends with one blob tree that matches live (including deletions). On
# any abort after temps or staging exist, those are deleted. If dump and
# MANIFEST had already been moved, previous same-day copies are restored
# or the new first-of-day files are removed. The blob tree stays.
set -euo pipefail

FOUNDATION_BACKUP_SQL_PLAIN_GLOB='foundation-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].sql'
FOUNDATION_BACKUP_SQL_AGE_GLOB='foundation-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].sql.age'

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

foundation_backup_path_is_inside() {
  local outer="${1%/}"
  local inner="${2%/}"
  [[ "${inner}" == "${outer}" || "${inner}" == "${outer}/"* ]]
}

foundation_backup_keep_days() {
  local repo_root raw
  repo_root="$(foundation_backup_repo_root)"
  raw="$(foundation_backup_env_value "${repo_root}" BACKUP_KEEP_DAYS)"
  if [[ -z "${raw}" ]]; then
    printf '14\n'
    return 0
  fi
  if [[ ! "${raw}" =~ ^[1-9][0-9]*$ ]]; then
    echo "backup-vault: BACKUP_KEEP_DAYS must be an integer of 1 or more" >&2
    return 1
  fi
  printf '%s\n' "${raw}"
}

foundation_backup_sql_cutoff() {
  local days="$1"
  if date -d "${days} days ago" +%Y%m%d >/dev/null 2>&1; then
    date -d "${days} days ago" +%Y%m%d
    return 0
  fi
  if date -v-"${days}"d +%Y%m%d >/dev/null 2>&1; then
    date -v-"${days}"d +%Y%m%d
    return 0
  fi
  return 1
}

foundation_backup_sql_date() {
  local name
  name="$(basename -- "$1")"
  name="${name#foundation-}"
  name="${name%.sql.age}"
  name="${name%.sql}"
  printf '%s\n' "${name}"
}

foundation_backup_list_dumps() {
  local sql_dir="$1"
  find "${sql_dir}" -maxdepth 1 -type f \( \
    -name "${FOUNDATION_BACKUP_SQL_PLAIN_GLOB}" -o \
    -name "${FOUNDATION_BACKUP_SQL_AGE_GLOB}" \
  \) | LC_ALL=C sort
}

# Delete dated dumps older than BACKUP_KEEP_DAYS (default 14).
# Never delete the last remaining dump.
foundation_backup_prune_sql() {
  local sql_dir="$1"
  local cutoff=""
  local days=""
  local -a dumps=()
  local f remaining dump_date

  if [[ ! -d "${sql_dir}" ]]; then
    return 0
  fi

  while IFS= read -r f; do
    [[ -n "${f}" ]] || continue
    dumps+=("${f}")
  done < <(foundation_backup_list_dumps "${sql_dir}")

  if ((${#dumps[@]} <= 1)); then
    return 0
  fi

  if ! days="$(foundation_backup_keep_days)"; then
    echo "backup-vault: cannot read BACKUP_KEEP_DAYS; leaving dumps in place" >&2
    return 0
  fi
  if ! cutoff="$(foundation_backup_sql_cutoff "${days}")"; then
    echo "backup-vault: cannot compute prune cutoff; leaving dumps in place" >&2
    return 0
  fi

  for f in "${dumps[@]}"; do
    remaining="$(foundation_backup_list_dumps "${sql_dir}" | wc -l | tr -d ' ')"
    if ((remaining <= 1)); then
      break
    fi
    dump_date="$(foundation_backup_sql_date "${f}")"
    if [[ "${dump_date}" < "${cutoff}" ]]; then
      rm -f -- "${f}"
    fi
  done
}

foundation_backup_sql_has_people() {
  local file="$1"
  local line stripped
  local in_copy=0

  if [[ ! -e "${file}" ]]; then
    return 1
  fi
  if [[ ! -f "${file}" || ! -r "${file}" ]]; then
    return 0
  fi

  while IFS= read -r line || [[ -n "${line}" ]]; do
    stripped="${line#"${line%%[![:space:]]*}"}"
    if [[ "${stripped}" =~ ^[Ii][Nn][Ss][Ee][Rr][Tt][[:space:]]+[Ii][Nn][Tt][Oo][[:space:]]+([Pp][Uu][Bb][Ll][Ii][Cc]\.)?[Nn][Oo][Dd][Ee][Ss]([^[:alnum:]_]|$) ]]; then
      return 0
    fi
    if [[ "${stripped}" =~ ^[Cc][Oo][Pp][Yy][[:space:]]+([Pp][Uu][Bb][Ll][Ii][Cc]\.)?[Nn][Oo][Dd][Ee][Ss]([^[:alnum:]_]|$) ]]; then
      in_copy=1
      continue
    fi
    if ((in_copy)); then
      if [[ "${line}" == '\.' ]]; then
        in_copy=0
        continue
      fi
      if [[ -n "${stripped}" ]]; then
        return 0
      fi
    fi
  done < "${file}" || return 0
  return 1
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

foundation_backup_discard() {
  local p
  for p in "$@"; do
    [[ -n "${p}" ]] || continue
    rm -rf -- "${p}"
  done
}

foundation_backup_encrypt() {
  local plaintext="$1"
  local dest="$2"
  local recipient="$3"
  if ! command -v age >/dev/null 2>&1; then
    echo "backup-vault: age is required to encrypt dumps. The package name is unknown in this repo." >&2
    return 1
  fi
  age -r "${recipient}" -o "${dest}" -- "${plaintext}"
}

# Write MANIFEST content to dest_tmp from the encrypted dump and the staging blob tree.
# Does not replace MANIFEST.
foundation_backup_write_manifest_tmp() {
  local dest_tmp="$1"
  local day="$2"
  local dump_path="$3"
  local git_sha="$4"
  local blobs_dir="$5"
  local has_people="$6"
  local size checksum blobs

  size="$(wc -c < "${dump_path}" | tr -d ' ')"
  checksum="$(foundation_backup_sha256 "${dump_path}")"
  blobs="$(foundation_backup_blob_count "${blobs_dir}")"
  if [[ "${has_people}" != "yes" && "${has_people}" != "no" ]]; then
    has_people="yes"
  fi

  {
    printf 'date=%s\n' "${day}"
    printf 'dump=sql/foundation-%s.sql.age\n' "${day}"
    printf 'dump_size=%s\n' "${size}"
    printf 'blob_count=%s\n' "${blobs}"
    printf 'has_people=%s\n' "${has_people}"
    if [[ -n "${git_sha}" ]]; then
      printf 'git_sha=%s\n' "${git_sha}"
    fi
    printf 'dump_checksum=sha256:%s\n' "${checksum}"
  } >"${dest_tmp}"
}

# Rsync live blobs into staging. Never writes $BACKUP_ROOT/blobs/.
foundation_backup_stage_blobs() {
  local data_abs="$1"
  local staging="$2"
  mkdir -p -- "${staging}"
  if [[ -d "${data_abs}/blobs" ]]; then
    rsync -a --delete -- "${data_abs}/blobs/" "${staging}/"
  fi
}

# Replace $BACKUP_ROOT/blobs/ with staging. Previous tree stays until this swap.
# On failure, put the previous tree back (if it was moved) and return 1.
foundation_backup_swap_blobs() {
  local backup_abs="$1"
  local staging="$2"
  local live="${backup_abs}/blobs"
  local prev=""

  if [[ ! -e "${live}" ]]; then
    mv -- "${staging}" "${live}"
    return 0
  fi

  prev="$(mktemp -d "${backup_abs}/blobs.prev.XXXXXX")"
  rmdir -- "${prev}"
  if ! mv -- "${live}" "${prev}"; then
    return 1
  fi
  if ! mv -- "${staging}" "${live}"; then
    mv -- "${prev}" "${live}"
    return 1
  fi
  rm -rf -- "${prev}" || true
}

# All-or-nothing: if dump/MANIFEST were already moved, restore the previous
# same-day copies when they exist; otherwise remove the newly written files so
# the backup root matches the start of this run. Then drop temps and every
# blobs.staging.* tree. Live $BACKUP_ROOT/blobs/ is not touched.
foundation_backup_install_abort() {
  local dump_tmp="$1"
  local manifest_tmp="$2"
  local staging="$3"
  local saved_dump="$4"
  local saved_manifest="$5"
  local dump_path="$6"
  local manifest="$7"
  local backup_abs="$8"

  if [[ -z "${dump_tmp}" ]]; then
    if [[ -n "${saved_dump}" && -f "${saved_dump}" ]]; then
      mv -- "${saved_dump}" "${dump_path}" || true
      saved_dump=""
    elif [[ -n "${dump_path}" ]]; then
      rm -f -- "${dump_path}"
    fi
  fi
  if [[ -z "${manifest_tmp}" ]]; then
    if [[ -n "${saved_manifest}" && -f "${saved_manifest}" ]]; then
      mv -- "${saved_manifest}" "${manifest}" || true
      saved_manifest=""
    elif [[ -n "${manifest}" ]]; then
      rm -f -- "${manifest}"
    fi
  fi
  foundation_backup_discard "${dump_tmp}" "${manifest_tmp}" "${staging}" "${saved_dump}" "${saved_manifest}"
  if [[ -n "${backup_abs}" && -d "${backup_abs}" ]]; then
    find "${backup_abs}" -maxdepth 1 -type d -name 'blobs.staging.*' -exec rm -rf {} +
  fi
}

# After a dump sits in dump_tmp: stage blobs, write MANIFEST from that temp dump
# and staging tree, commit dump + MANIFEST, then swap staging into blobs/.
# A subshell EXIT trap discards temps and staging on any abort (including set -e
# after mktemp/cp). Previous dump, MANIFEST, and blob tree stay put.
foundation_backup_install() {
  local backup_abs="$1"
  local data_abs="$2"
  local day="$3"
  local dump_tmp="$4"
  local git_sha="$5"
  local has_people="${6:-yes}"

  (
    set -euo pipefail
    local dump_path manifest
    local manifest_tmp="" staging="" saved_dump="" saved_manifest=""

    dump_path="${backup_abs}/sql/foundation-${day}.sql.age"
    manifest="${backup_abs}/MANIFEST"

    trap 'foundation_backup_install_abort \
      "${dump_tmp}" "${manifest_tmp}" "${staging}" \
      "${saved_dump}" "${saved_manifest}" \
      "${dump_path}" "${manifest}" "${backup_abs}"' EXIT

    staging="$(mktemp -d "${backup_abs}/blobs.staging.XXXXXX")"
    manifest_tmp="$(mktemp "${manifest}.tmp.XXXXXX")"
    foundation_backup_stage_blobs "${data_abs}" "${staging}" \
      || { echo "backup-vault: rsync failed; last good dump, MANIFEST, and blobs left in place" >&2; exit 1; }
    foundation_backup_write_manifest_tmp "${manifest_tmp}" "${day}" "${dump_tmp}" "${git_sha}" "${staging}" "${has_people}" \
      || { echo "backup-vault: MANIFEST write failed; last good dump, MANIFEST, and blobs left in place" >&2; exit 1; }

    if [[ -f "${dump_path}" ]]; then
      saved_dump="$(mktemp "${dump_path}.prev.XXXXXX")"
      cp -p -- "${dump_path}" "${saved_dump}"
    fi
    if [[ -f "${manifest}" ]]; then
      saved_manifest="$(mktemp "${manifest}.prev.XXXXXX")"
      cp -p -- "${manifest}" "${saved_manifest}"
    fi

    mv -- "${dump_tmp}" "${dump_path}"
    dump_tmp=""
    chmod 0600 -- "${dump_path}"
    mv -- "${manifest_tmp}" "${manifest}"
    manifest_tmp=""

    foundation_backup_swap_blobs "${backup_abs}" "${staging}" \
      || { echo "backup-vault: blob swap failed; last good dump, MANIFEST, and blobs left in place" >&2; exit 1; }
    staging=""
    foundation_backup_discard "${saved_dump}" "${saved_manifest}"
    saved_dump=""
    saved_manifest=""
    trap - EXIT
  )
}

# KEY from the environment, else the clone .env. Does not print .env.
foundation_backup_env_value() {
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

foundation_backup_database_url() {
  local repo_root="$1"
  local raw
  raw="$(foundation_backup_env_value "${repo_root}" DATABASE_URL)"
  if [[ -z "${raw}" ]]; then
    echo "backup-vault: DATABASE_URL is unset. Copy .env.example to .env and fill it." >&2
    return 1
  fi
  printf '%s\n' "${raw}"
}

foundation_backup_age_recipient() {
  local repo_root="$1"
  local raw
  raw="$(foundation_backup_env_value "${repo_root}" BACKUP_AGE_RECIPIENT)"
  if [[ -z "${raw}" ]]; then
    echo "backup-vault: BACKUP_AGE_RECIPIENT is unset. Copy .env.example to .env and set the age recipient." >&2
    return 1
  fi
  printf '%s\n' "${raw}"
}

foundation_backup_age_identity() {
  local repo_root="$1"
  local raw
  raw="$(foundation_backup_env_value "${repo_root}" BACKUP_AGE_IDENTITY)"
  if [[ -z "${raw}" ]]; then
    echo "backup-vault: BACKUP_AGE_IDENTITY is unset. Copy .env.example to .env and set the age identity file." >&2
    return 1
  fi
  printf '%s\n' "${raw}"
}

# FOUNDATION_DATA from the environment, else the clone .env, else ./data.
# Relative paths are under the clone. Does not print .env.
foundation_backup_data_dir() {
  local repo_root="$1"
  local raw
  raw="$(foundation_backup_env_value "${repo_root}" FOUNDATION_DATA)"
  raw="${raw:-./data}"
  raw="${raw%/}"
  if [[ "${raw}" != /* ]]; then
    printf '%s\n' "${repo_root}/${raw#./}"
  else
    printf '%s\n' "${raw}"
  fi
}

# BACKUP_ROOT from the environment, else the clone .env, else a sibling
# of the data dir. Relative paths are under the clone (not cwd).
foundation_backup_backup_root() {
  local data_dir="${1%/}"
  local repo_root raw
  repo_root="$(foundation_backup_repo_root)"
  raw="$(foundation_backup_env_value "${repo_root}" BACKUP_ROOT)"
  if [[ -z "${raw}" ]]; then
    raw="$(foundation_backup_default_root "${data_dir}")"
  fi
  raw="${raw%/}"
  if [[ "${raw}" != /* ]]; then
    printf '%s\n' "${repo_root}/${raw#./}"
  else
    printf '%s\n' "${raw}"
  fi
}

foundation_backup_offsite_root() {
  local repo_root="$1"
  local raw
  raw="$(foundation_backup_env_value "${repo_root}" BACKUP_OFFSITE)"
  if [[ -z "${raw}" ]]; then
    return 0
  fi
  raw="${raw%/}"
  if [[ "${raw}" != /* ]]; then
    printf '%s\n' "${repo_root}/${raw#./}"
  else
    printf '%s\n' "${raw}"
  fi
}

foundation_backup_offsite_is_forbidden() {
  local data_abs="$1"
  local backup_abs="$2"
  local offsite_abs="$3"
  if foundation_backup_path_is_inside "${data_abs}" "${offsite_abs}"; then
    return 0
  fi
  if foundation_backup_path_is_inside "${backup_abs}" "${offsite_abs}"; then
    return 0
  fi
  return 1
}

foundation_backup_copy_offsite() {
  local backup_abs="$1"
  local offsite_abs="$2"
  mkdir -p -- "${offsite_abs}/sql"
  if [[ -d "${backup_abs}/sql" ]]; then
    rsync -a --delete -- "${backup_abs}/sql/" "${offsite_abs}/sql/" \
      || { echo "backup-vault: off-site rsync of sql/ failed" >&2; return 1; }
  fi
  if [[ -f "${backup_abs}/MANIFEST" ]]; then
    rsync -a -- "${backup_abs}/MANIFEST" "${offsite_abs}/MANIFEST" \
      || { echo "backup-vault: off-site rsync of MANIFEST failed" >&2; return 1; }
  fi
  if [[ -d "${backup_abs}/blobs" ]]; then
    mkdir -p -- "${offsite_abs}/blobs"
    rsync -a --delete -- "${backup_abs}/blobs/" "${offsite_abs}/blobs/" \
      || { echo "backup-vault: off-site rsync of blobs/ failed" >&2; return 1; }
  fi
}

# Online dump against localhost Postgres.
foundation_backup_pg_dump() {
  local repo_root="$1"
  local dest="$2"
  local url
  url="$(foundation_backup_database_url "${repo_root}")"
  pg_dump --dbname="${url}" --no-owner --no-acl >"${dest}"
}

foundation_backup_main() {
  local data_dir backup_root repo_root data_abs backup_abs
  local day dump_path dump_tmp enc_tmp git_sha recipient has_people
  local offsite_raw offsite_abs

  repo_root="$(foundation_backup_repo_root)"
  data_dir="$(foundation_backup_data_dir "${repo_root}")"
  backup_root="$(foundation_backup_backup_root "${data_dir}")"

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

  if ! recipient="$(foundation_backup_age_recipient "${repo_root}")"; then
    return 1
  fi

  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "backup-vault: pg_dump is required for online dump (localhost Postgres)" >&2
    return 1
  fi
  if ! command -v rsync >/dev/null 2>&1; then
    echo "backup-vault: rsync is required to copy blobs" >&2
    return 1
  fi
  if ! command -v age >/dev/null 2>&1; then
    echo "backup-vault: age is required to encrypt dumps. The package name is unknown in this repo." >&2
    return 1
  fi

  offsite_raw="$(foundation_backup_offsite_root "${repo_root}")"
  if [[ -n "${offsite_raw}" ]]; then
    offsite_abs="$(foundation_backup_abs "${offsite_raw}")"
    if foundation_backup_offsite_is_forbidden "${data_abs}" "${backup_abs}" "${offsite_abs}"; then
      echo "backup-vault: BACKUP_OFFSITE must not be inside FOUNDATION_DATA or BACKUP_ROOT" >&2
      return 1
    fi
  fi

  mkdir -p -- "${backup_abs}/sql"

  day="$(date +%Y%m%d)"
  dump_path="${backup_abs}/sql/foundation-${day}.sql.age"
  dump_tmp="$(mktemp "${dump_path}.plain.XXXXXX")"
  chmod 0600 -- "${dump_tmp}"
  # Global so the EXIT trap can still see the path after this function returns.
  FOUNDATION_BACKUP_MAIN_DUMP_TMP="${dump_tmp}"
  trap 'foundation_backup_discard "${FOUNDATION_BACKUP_MAIN_DUMP_TMP:-}" "${FOUNDATION_BACKUP_MAIN_ENC_TMP:-}"' EXIT

  # Online dump. The vault stays up. Dump, MANIFEST, and the live blob tree stay
  # put until staging rsync, MANIFEST, and the final blob swap all succeed.
  if ! foundation_backup_pg_dump "${repo_root}" "${dump_tmp}"; then
    foundation_backup_discard "${dump_tmp}"
    FOUNDATION_BACKUP_MAIN_DUMP_TMP=""
    trap - EXIT
    echo "backup-vault: pg_dump failed; last good dump and MANIFEST left in place" >&2
    return 1
  fi
  if [[ ! -s "${dump_tmp}" ]]; then
    foundation_backup_discard "${dump_tmp}"
    FOUNDATION_BACKUP_MAIN_DUMP_TMP=""
    trap - EXIT
    echo "backup-vault: pg_dump wrote an empty file; last good dump and MANIFEST left in place" >&2
    return 1
  fi

  has_people="no"
  if foundation_backup_sql_has_people "${dump_tmp}"; then
    has_people="yes"
  fi

  enc_tmp="$(mktemp "${dump_path}.tmp.XXXXXX")"
  chmod 0600 -- "${enc_tmp}"
  FOUNDATION_BACKUP_MAIN_ENC_TMP="${enc_tmp}"
  if ! foundation_backup_encrypt "${dump_tmp}" "${enc_tmp}" "${recipient}"; then
    foundation_backup_discard "${dump_tmp}" "${enc_tmp}"
    FOUNDATION_BACKUP_MAIN_DUMP_TMP=""
    FOUNDATION_BACKUP_MAIN_ENC_TMP=""
    trap - EXIT
    echo "backup-vault: encrypt failed; last good dump and MANIFEST left in place" >&2
    return 1
  fi
  foundation_backup_discard "${dump_tmp}"
  FOUNDATION_BACKUP_MAIN_DUMP_TMP=""
  dump_tmp="${enc_tmp}"

  git_sha="$(foundation_backup_git_sha "${repo_root}" || true)"
  if ! foundation_backup_install "${backup_abs}" "${data_abs}" "${day}" "${dump_tmp}" "${git_sha}" "${has_people}"; then
    FOUNDATION_BACKUP_MAIN_ENC_TMP=""
    trap - EXIT
    return 1
  fi
  FOUNDATION_BACKUP_MAIN_ENC_TMP=""
  trap - EXIT

  if [[ -n "${offsite_abs:-}" ]]; then
    if ! foundation_backup_copy_offsite "${backup_abs}" "${offsite_abs}"; then
      return 1
    fi
  fi

  foundation_backup_prune_sql "${backup_abs}/sql"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  foundation_backup_main "$@"
fi
