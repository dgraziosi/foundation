#!/usr/bin/env bash
# Syntax check plus prune fixture. No live vault, no real dump.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backup_script="${script_dir}/backup-vault.sh"

fail() {
  echo "backup-vault.test: $*" >&2
  exit 1
}

bash -n "${backup_script}"

if grep -Eiq -- 'docker|compose exec' "${backup_script}"; then
  fail "backup-vault.sh must talk to localhost, not compose exec"
fi
if ! grep -Fq -- 'pg_dump --dbname=' "${backup_script}"; then
  fail "backup-vault.sh must dump with pg_dump against DATABASE_URL"
fi
if ! grep -Fq -- 'localhost' "${backup_script}"; then
  fail "backup-vault.sh must name localhost Postgres"
fi

# shellcheck source=backup-vault.sh
source "${backup_script}"

# Single dated dump older than 14 days must survive prune.
tmp_one="$(mktemp -d)"
trap 'rm -rf -- "${tmp_one}" "${tmp_two:-}" "${tmp_fail:-}" "${tmp_blobs:-}" "${tmp_abort:-}" "${tmp_swap:-}" "${tmp_env:-}"' EXIT
printf '%s\n' '-- fixture dump, not a vault' >"${tmp_one}/foundation-20000101.sql"
foundation_backup_prune_sql "${tmp_one}"
if [[ ! -f "${tmp_one}/foundation-20000101.sql" ]]; then
  fail "prune deleted the last remaining dump"
fi

# Two old dumps: drop the older name, keep one.
tmp_two="$(mktemp -d)"
printf '%s\n' '-- fixture dump, not a vault' >"${tmp_two}/foundation-20000101.sql"
printf '%s\n' '-- fixture dump, not a vault' >"${tmp_two}/foundation-20000102.sql"
foundation_backup_prune_sql "${tmp_two}"
if [[ -f "${tmp_two}/foundation-20000101.sql" ]]; then
  fail "prune left an extra dump older than 14 days"
fi
if [[ ! -f "${tmp_two}/foundation-20000102.sql" ]]; then
  fail "prune deleted the last remaining dump among two old files"
fi

# Failed later step (staging rsync) must not replace an existing same-day dump or MANIFEST.
tmp_fail="$(mktemp -d)"
fail_day="$(date +%Y%m%d)"
mkdir -p "${tmp_fail}/backup/sql" "${tmp_fail}/backup/blobs" "${tmp_fail}/data/blobs"
printf '%s\n' '-- last good dump' >"${tmp_fail}/backup/sql/foundation-${fail_day}.sql"
printf '%s\n' 'date=good' >"${tmp_fail}/backup/MANIFEST"
printf '%s\n' '-- fixture blob' >"${tmp_fail}/data/blobs/fixture"
printf '%s\n' '-- new dump temp' >"${tmp_fail}/dump.tmp"
chmod 0600 "${tmp_fail}/dump.tmp"

set +e
(
  foundation_backup_stage_blobs() { return 1; }
  foundation_backup_install \
    "${tmp_fail}/backup" \
    "${tmp_fail}/data" \
    "${fail_day}" \
    "${tmp_fail}/dump.tmp" \
    ""
)
fail_rc=$?
set -e
if ((fail_rc == 0)); then
  fail "install should fail when a later step fails"
fi
if ! grep -qx -- '-- last good dump' "${tmp_fail}/backup/sql/foundation-${fail_day}.sql"; then
  fail "failed later step replaced the same-day dump"
fi
if ! grep -qx 'date=good' "${tmp_fail}/backup/MANIFEST"; then
  fail "failed later step replaced MANIFEST"
fi
if [[ -e "${tmp_fail}/dump.tmp" ]]; then
  fail "failed later step left the temp dump"
fi
if compgen -G "${tmp_fail}/backup/MANIFEST.tmp.*" >/dev/null; then
  fail "failed later step left a MANIFEST temp"
fi

# Failed later step must not delete or replace a file already in BACKUP_ROOT/blobs/.
# Staging stand-in uses rsync --delete semantics on whatever dest install passes.
# If that dest were the live blob tree, keep-me would be removed.
tmp_blobs="$(mktemp -d)"
blobs_day="$(date +%Y%m%d)"
mkdir -p "${tmp_blobs}/backup/sql" "${tmp_blobs}/backup/blobs" "${tmp_blobs}/data/blobs"
printf '%s\n' '-- last good dump' >"${tmp_blobs}/backup/sql/foundation-${blobs_day}.sql"
printf '%s\n' 'date=good' >"${tmp_blobs}/backup/MANIFEST"
printf '%s\n' 'keep-original' >"${tmp_blobs}/backup/blobs/keep-me"
printf '%s\n' 'live-only' >"${tmp_blobs}/data/blobs/live-only"
printf '%s\n' '-- new dump temp' >"${tmp_blobs}/dump.tmp"
chmod 0600 "${tmp_blobs}/dump.tmp"

set +e
(
  foundation_backup_stage_blobs() {
    local src="$1/blobs"
    local dest="$2"
    mkdir -p -- "${dest}"
    find "${dest}" -mindepth 1 -delete
    if [[ -d "${src}" ]]; then
      cp -a -- "${src}/." "${dest}/"
    fi
  }
  foundation_backup_write_manifest_tmp() { return 1; }
  foundation_backup_install \
    "${tmp_blobs}/backup" \
    "${tmp_blobs}/data" \
    "${blobs_day}" \
    "${tmp_blobs}/dump.tmp" \
    ""
)
blobs_rc=$?
set -e
if ((blobs_rc == 0)); then
  fail "install should fail when MANIFEST write fails after staging"
fi
if [[ ! -f "${tmp_blobs}/backup/blobs/keep-me" ]]; then
  fail "failed later step deleted a file already in BACKUP_ROOT/blobs"
fi
if ! grep -qx 'keep-original' "${tmp_blobs}/backup/blobs/keep-me"; then
  fail "failed later step replaced a file already in BACKUP_ROOT/blobs"
fi
if [[ -e "${tmp_blobs}/backup/blobs/live-only" ]]; then
  fail "failed later step wrote live blobs into BACKUP_ROOT/blobs"
fi
if ! grep -qx -- '-- last good dump' "${tmp_blobs}/backup/sql/foundation-${blobs_day}.sql"; then
  fail "failed later step replaced the same-day dump while leaving blobs"
fi
if ! grep -qx 'date=good' "${tmp_blobs}/backup/MANIFEST"; then
  fail "failed later step replaced MANIFEST while leaving blobs"
fi
if compgen -G "${tmp_blobs}/backup/blobs.staging.*" >/dev/null; then
  fail "failed later step left a blob staging tree"
fi

# Mid-install abort after staging is filled (set -e on rollback cp) must not
# leave blobs.staging.*. A second attempt must not accumulate another tree.
tmp_abort="$(mktemp -d)"
abort_day="$(date +%Y%m%d)"
mkdir -p "${tmp_abort}/backup/sql" "${tmp_abort}/backup/blobs" "${tmp_abort}/data/blobs"
printf '%s\n' '-- last good dump' >"${tmp_abort}/backup/sql/foundation-${abort_day}.sql"
printf '%s\n' 'date=good' >"${tmp_abort}/backup/MANIFEST"
printf '%s\n' 'keep-original' >"${tmp_abort}/backup/blobs/keep-me"
printf '%s\n' '-- new dump temp' >"${tmp_abort}/dump.tmp"
chmod 0600 "${tmp_abort}/dump.tmp"

run_abort_install() {
  set +e
  (
    foundation_backup_stage_blobs() {
      mkdir -p -- "$2"
      printf '%s\n' 'staged' >"$2/staged"
    }
    cp() { return 1; }
    foundation_backup_install \
      "${tmp_abort}/backup" \
      "${tmp_abort}/data" \
      "${abort_day}" \
      "${tmp_abort}/dump.tmp" \
      ""
  )
  abort_rc=$?
  set -e
  if ((abort_rc == 0)); then
    fail "install should abort when rollback cp fails after staging"
  fi
}

run_abort_install
# Recreate the dump temp so a retry can start the same way.
printf '%s\n' '-- new dump temp' >"${tmp_abort}/dump.tmp"
chmod 0600 "${tmp_abort}/dump.tmp"
run_abort_install

if compgen -G "${tmp_abort}/backup/blobs.staging.*" >/dev/null; then
  fail "mid-install abort left a blobs.staging.* tree"
fi
staging_count="$(find "${tmp_abort}/backup" -maxdepth 1 -type d -name 'blobs.staging.*' | wc -l | tr -d ' ')"
if ((staging_count != 0)); then
  fail "retry accumulated blobs.staging.* directories (${staging_count})"
fi
if [[ ! -f "${tmp_abort}/backup/blobs/keep-me" ]] || ! grep -qx 'keep-original' "${tmp_abort}/backup/blobs/keep-me"; then
  fail "mid-install abort mutated BACKUP_ROOT/blobs"
fi
if ! grep -qx -- '-- last good dump' "${tmp_abort}/backup/sql/foundation-${abort_day}.sql"; then
  fail "mid-install abort replaced the same-day dump"
fi
if ! grep -qx 'date=good' "${tmp_abort}/backup/MANIFEST"; then
  fail "mid-install abort replaced MANIFEST"
fi

# First-of-day: dump and MANIFEST are committed, then swap fails. Remove the
# new dump and MANIFEST so the backup root matches the start of this run.
# Blobs stay untouched.
tmp_swap="$(mktemp -d)"
swap_day="$(date +%Y%m%d)"
mkdir -p "${tmp_swap}/backup/sql" "${tmp_swap}/backup/blobs" "${tmp_swap}/data/blobs"
printf '%s\n' '-- yesterday dump' >"${tmp_swap}/backup/sql/foundation-20000101.sql"
printf '%s\n' 'keep-original' >"${tmp_swap}/backup/blobs/keep-me"
printf '%s\n' '-- new dump temp' >"${tmp_swap}/dump.tmp"
chmod 0600 "${tmp_swap}/dump.tmp"

set +e
(
  foundation_backup_stage_blobs() {
    mkdir -p -- "$2"
    printf '%s\n' 'staged' >"$2/staged"
  }
  foundation_backup_swap_blobs() { return 1; }
  foundation_backup_install \
    "${tmp_swap}/backup" \
    "${tmp_swap}/data" \
    "${swap_day}" \
    "${tmp_swap}/dump.tmp" \
    ""
)
swap_rc=$?
set -e
if ((swap_rc == 0)); then
  fail "install should fail when blob swap fails after dump/MANIFEST commit"
fi
if [[ -e "${tmp_swap}/backup/sql/foundation-${swap_day}.sql" ]]; then
  fail "first-of-day swap failure left a new dump"
fi
if [[ -e "${tmp_swap}/backup/MANIFEST" ]]; then
  fail "first-of-day swap failure left a new MANIFEST"
fi
if [[ ! -f "${tmp_swap}/backup/sql/foundation-20000101.sql" ]]; then
  fail "first-of-day swap failure removed a prior day's dump"
fi
if [[ ! -f "${tmp_swap}/backup/blobs/keep-me" ]] || ! grep -qx 'keep-original' "${tmp_swap}/backup/blobs/keep-me"; then
  fail "first-of-day swap failure mutated BACKUP_ROOT/blobs"
fi
if [[ -e "${tmp_swap}/backup/blobs/staged" ]]; then
  fail "first-of-day swap failure swapped staging into blobs"
fi
if compgen -G "${tmp_swap}/backup/blobs.staging.*" >/dev/null; then
  fail "first-of-day swap failure left a blobs.staging.* tree"
fi

# FOUNDATION_DATA and BACKUP_ROOT from clone .env, same as keep-up.
# Relative paths are under the clone, not cwd. Process env wins.
tmp_env="$(mktemp -d)"
mkdir -p "${tmp_env}/clone/vault-data" "${tmp_env}/elsewhere"
printf '%s\n' 'FOUNDATION_DATA=./vault-data' 'BACKUP_ROOT=./my-backups' >"${tmp_env}/clone/.env"

data_got="$(
  cd "${tmp_env}/elsewhere"
  unset FOUNDATION_DATA BACKUP_ROOT
  foundation_backup_repo_root() { printf '%s\n' "${tmp_env}/clone"; }
  foundation_backup_data_dir "${tmp_env}/clone"
)"
if [[ "${data_got}" != "${tmp_env}/clone/vault-data" ]]; then
  fail "FOUNDATION_DATA from clone .env should resolve under the clone (got: ${data_got})"
fi

backup_got="$(
  cd "${tmp_env}/elsewhere"
  unset FOUNDATION_DATA BACKUP_ROOT
  foundation_backup_repo_root() { printf '%s\n' "${tmp_env}/clone"; }
  foundation_backup_backup_root "${tmp_env}/clone/vault-data"
)"
if [[ "${backup_got}" != "${tmp_env}/clone/my-backups" ]]; then
  fail "BACKUP_ROOT from clone .env should resolve under the clone (got: ${backup_got})"
fi

override_data="${tmp_env}/elsewhere/override-data"
override_backups="${tmp_env}/elsewhere/override-backups"
mkdir -p "${override_data}"
data_env="$(
  cd "${tmp_env}/elsewhere"
  unset BACKUP_ROOT
  FOUNDATION_DATA="${override_data}"
  foundation_backup_repo_root() { printf '%s\n' "${tmp_env}/clone"; }
  foundation_backup_data_dir "${tmp_env}/clone"
)"
if [[ "${data_env}" != "${override_data}" ]]; then
  fail "process FOUNDATION_DATA must win over clone .env (got: ${data_env})"
fi
backup_env="$(
  cd "${tmp_env}/elsewhere"
  unset FOUNDATION_DATA
  BACKUP_ROOT="${override_backups}"
  foundation_backup_repo_root() { printf '%s\n' "${tmp_env}/clone"; }
  foundation_backup_backup_root "${tmp_env}/clone/vault-data"
)"
if [[ "${backup_env}" != "${override_backups}" ]]; then
  fail "process BACKUP_ROOT must win over clone .env (got: ${backup_env})"
fi

echo "backup-vault.test: ok"
