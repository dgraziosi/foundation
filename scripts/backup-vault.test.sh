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
if grep -Fq -- 'postgres://foundation:foundation@' "${backup_script}"; then
  fail "backup-vault.sh still ships a default URL with password foundation"
fi
if ! grep -Fq -- 'age -r' "${backup_script}"; then
  fail "backup-vault.sh must encrypt dumps with age"
fi
if ! grep -Fq -- 'BACKUP_AGE_RECIPIENT' "${backup_script}"; then
  fail "backup-vault.sh must require BACKUP_AGE_RECIPIENT"
fi
if ! grep -Fq -- 'foundation-${day}.sql.age' "${backup_script}"; then
  fail "backup-vault.sh must install foundation-YYYYMMDD.sql.age"
fi
if grep -Fq -- 'dump_path="${backup_abs}/sql/foundation-${day}.sql"' "${backup_script}"; then
  fail "backup-vault.sh still installs a plaintext .sql dump"
fi
if grep -Fq -- 'FOUNDATION_BACKUP_KEEP_DAYS=14' "${backup_script}"; then
  fail "retention is still a hard 14 with no override"
fi
if ! grep -Fq -- 'BACKUP_KEEP_DAYS' "${backup_script}"; then
  fail "backup-vault.sh must read BACKUP_KEEP_DAYS"
fi

# shellcheck source=backup-vault.sh
source "${backup_script}"

# Contract fixtures. No live vault. Drop leftover host env so clone .env
# resolution is not shadowed by a cluster this run did not create.
unset FOUNDATION_DATA BACKUP_ROOT DATABASE_URL BACKUP_AGE_RECIPIENT BACKUP_AGE_IDENTITY BACKUP_KEEP_DAYS BACKUP_OFFSITE

empty_clone="$(mktemp -d)"
if url="$(foundation_backup_database_url "${empty_clone}" 2>"${empty_clone}/nag")"; then
  fail "unset DATABASE_URL must nag, not invent a URL (got: ${url})"
fi
if ! grep -Fq -- '.env.example' "${empty_clone}/nag"; then
  fail "unset DATABASE_URL nag must mention .env.example (got: $(cat "${empty_clone}/nag"))"
fi
if recipient="$(foundation_backup_age_recipient "${empty_clone}" 2>"${empty_clone}/age-nag")"; then
  fail "unset BACKUP_AGE_RECIPIENT must refuse, not invent a recipient (got: ${recipient})"
fi
if ! grep -Fq -- 'BACKUP_AGE_RECIPIENT' "${empty_clone}/age-nag"; then
  fail "unset BACKUP_AGE_RECIPIENT nag must name BACKUP_AGE_RECIPIENT (got: $(cat "${empty_clone}/age-nag"))"
fi
rm -rf -- "${empty_clone}"

# Single dated dump older than 14 days must survive prune.
tmp_one="$(mktemp -d)"
trap 'rm -rf -- "${tmp_one}" "${tmp_two:-}" "${tmp_fail:-}" "${tmp_blobs:-}" "${tmp_abort:-}" "${tmp_swap:-}" "${tmp_env:-}" "${tmp_plain:-}" "${tmp_keep:-}" "${tmp_off:-}" "${tmp_after:-}" "${tmp_man:-}"' EXIT
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
printf '%s\n' '-- last good dump' >"${tmp_fail}/backup/sql/foundation-${fail_day}.sql.age"
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
if ! grep -qx -- '-- last good dump' "${tmp_fail}/backup/sql/foundation-${fail_day}.sql.age"; then
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
printf '%s\n' '-- last good dump' >"${tmp_blobs}/backup/sql/foundation-${blobs_day}.sql.age"
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
if ! grep -qx -- '-- last good dump' "${tmp_blobs}/backup/sql/foundation-${blobs_day}.sql.age"; then
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
printf '%s\n' '-- last good dump' >"${tmp_abort}/backup/sql/foundation-${abort_day}.sql.age"
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
if ! grep -qx -- '-- last good dump' "${tmp_abort}/backup/sql/foundation-${abort_day}.sql.age"; then
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
if [[ -e "${tmp_swap}/backup/sql/foundation-${swap_day}.sql.age" ]]; then
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

tmp_plain="$(mktemp -d)"
plain_day="$(date +%Y%m%d)"
mkdir -p "${tmp_plain}/backup/sql" "${tmp_plain}/backup/blobs" "${tmp_plain}/data/blobs"
printf '%s\n' "INSERT INTO nodes (id, title) VALUES ('00000000-0000-0000-0000-000000000001', 'Fixture person');" \
  >"${tmp_plain}/plain.sql"
printf '%s\n' 'keep' >"${tmp_plain}/data/blobs/keep"
enc_out="${tmp_plain}/dump.tmp"
foundation_backup_encrypt() {
  printf '%s\n' 'age-encryption.org/v1' >"$2"
  printf '%s\n' 'ciphertext-not-sql' >>"$2"
}
if ! foundation_backup_encrypt "${tmp_plain}/plain.sql" "${enc_out}" "age1fixture"; then
  fail "encrypt stub should succeed"
fi
if grep -Fq -- 'INSERT INTO nodes' "${enc_out}"; then
  fail "encrypted dump still contains plaintext SQL"
fi
foundation_backup_stage_blobs() {
  mkdir -p -- "$2"
  if [[ -d "$1/blobs" ]]; then
    cp -a -- "$1/blobs/." "$2/"
  fi
}
if ! foundation_backup_install \
  "${tmp_plain}/backup" \
  "${tmp_plain}/data" \
  "${plain_day}" \
  "${enc_out}" \
  "" \
  "yes"; then
  fail "install of encrypted dump should succeed"
fi
if [[ ! -f "${tmp_plain}/backup/sql/foundation-${plain_day}.sql.age" ]]; then
  fail "install did not write foundation-YYYYMMDD.sql.age"
fi
if [[ -f "${tmp_plain}/backup/sql/foundation-${plain_day}.sql" ]]; then
  fail "install wrote a plaintext .sql dump"
fi
if grep -Fq -- 'INSERT INTO nodes' "${tmp_plain}/backup/sql/foundation-${plain_day}.sql.age"; then
  fail "installed dump stayed plaintext SQL"
fi
if ! grep -Fq -- 'has_people=yes' "${tmp_plain}/backup/MANIFEST"; then
  fail "MANIFEST missing has_people=yes"
fi
if ! grep -Fq -- "dump=sql/foundation-${plain_day}.sql.age" "${tmp_plain}/backup/MANIFEST"; then
  fail "MANIFEST dump path is not .sql.age"
fi

tmp_keep="$(mktemp -d)"
if ! old20="$(date -d '20 days ago' +%Y%m%d 2>/dev/null || date -v-20d +%Y%m%d 2>/dev/null)"; then
  fail "cannot compute a date 20 days ago"
fi
today="$(date +%Y%m%d)"
printf '%s\n' 'age-old' >"${tmp_keep}/foundation-${old20}.sql.age"
printf '%s\n' 'age-today' >"${tmp_keep}/foundation-${today}.sql.age"
unset BACKUP_KEEP_DAYS
foundation_backup_prune_sql "${tmp_keep}"
if [[ -f "${tmp_keep}/foundation-${old20}.sql.age" ]]; then
  fail "default prune left a dump older than 14 days"
fi
if [[ ! -f "${tmp_keep}/foundation-${today}.sql.age" ]]; then
  fail "default prune deleted the last remaining dump"
fi

printf '%s\n' 'age-old' >"${tmp_keep}/foundation-${old20}.sql.age"
printf '%s\n' 'age-today' >"${tmp_keep}/foundation-${today}.sql.age"
BACKUP_KEEP_DAYS=40
foundation_backup_prune_sql "${tmp_keep}"
if [[ ! -f "${tmp_keep}/foundation-${old20}.sql.age" ]]; then
  fail "BACKUP_KEEP_DAYS=40 deleted a 20-day-old dump"
fi
if [[ ! -f "${tmp_keep}/foundation-${today}.sql.age" ]]; then
  fail "BACKUP_KEEP_DAYS=40 deleted today's dump"
fi
unset BACKUP_KEEP_DAYS

printf '%s\n' '-- leftover plaintext' >"${tmp_keep}/foundation-${today}.sql"
foundation_backup_prune_sql "${tmp_keep}"
if [[ ! -f "${tmp_keep}/foundation-${today}.sql" ]]; then
  fail "prune wiped leftover plaintext on the same night as an encrypted dump"
fi

tmp_off="$(mktemp -d)"
data_abs="$(foundation_backup_abs "${tmp_off}/data")"
backup_abs="$(foundation_backup_abs "${tmp_off}/backups")"
if ! foundation_backup_offsite_is_forbidden "${data_abs}" "${backup_abs}" "${data_abs}/offsite"; then
  fail "BACKUP_OFFSITE inside FOUNDATION_DATA must be forbidden"
fi
if ! foundation_backup_offsite_is_forbidden "${data_abs}" "${backup_abs}" "${backup_abs}/copy"; then
  fail "BACKUP_OFFSITE inside BACKUP_ROOT must be forbidden"
fi
if foundation_backup_offsite_is_forbidden "${data_abs}" "${backup_abs}" "${tmp_off}/offsite"; then
  fail "BACKUP_OFFSITE beside the vault must be allowed"
fi

tmp_after="$(mktemp -d)"
mkdir -p "${tmp_after}/sql"
printf '%s\n' 'age-old' >"${tmp_after}/sql/foundation-${old20}.sql.age"
printf '%s\n' 'age-today' >"${tmp_after}/sql/foundation-${today}.sql.age"
unset BACKUP_KEEP_DAYS
foundation_backup_copy_offsite() { return 1; }
set +e
foundation_backup_after_install "${tmp_after}" "${tmp_after}/offsite"
after_rc=$?
set -e
if ((after_rc == 0)); then
  fail "failed off-site copy must still return an error"
fi
if [[ -f "${tmp_after}/sql/foundation-${old20}.sql.age" ]]; then
  fail "off-site failure skipped dump retention"
fi
if [[ ! -f "${tmp_after}/sql/foundation-${today}.sql.age" ]]; then
  fail "off-site failure pruned the last remaining dump"
fi

tmp_man="$(mktemp -d)"
printf '%s\n' 'CREATE TABLE nodes (id text);' >"${tmp_man}/empty.sql"
if foundation_backup_sql_has_people "${tmp_man}/empty.sql"; then
  fail "schema-only dump must not count as people"
fi
printf '%s\n' "INSERT INTO nodes (id) VALUES ('1');" >"${tmp_man}/people.sql"
if ! foundation_backup_sql_has_people "${tmp_man}/people.sql"; then
  fail "INSERT INTO nodes must count as people"
fi

echo "backup-vault.test: ok"
