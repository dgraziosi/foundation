#!/usr/bin/env bash
# Contract fixtures. No live vault. No real decrypt.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
restore_script="${script_dir}/restore-vault.sh"
backup_doc="${repo_root}/docs/BACKUP.md"
skill="${repo_root}/.agents/skills/backup-vault/SKILL.md"

fail() {
  echo "restore-vault.test: $*" >&2
  exit 1
}

if [[ ! -f "${restore_script}" ]]; then
  fail "scripts/restore-vault.sh is missing"
fi

bash -n "${restore_script}"

if grep -Eiq -- 'ssh|scp' "${restore_script}"; then
  fail "restore-vault.sh must not ssh or scp"
fi
if grep -E -- '--host|DATABASE_HOST' "${restore_script}"; then
  fail "restore-vault.sh must not take a host argument"
fi
if ! grep -Fq -- '--in-place' "${restore_script}"; then
  fail "restore-vault.sh must require --in-place"
fi
if ! grep -Fq -- '--confirm' "${restore_script}"; then
  fail "restore-vault.sh must require --confirm YYYYMMDD"
fi
if ! grep -Fq -- 'BACKUP_AGE_IDENTITY' "${restore_script}"; then
  fail "restore-vault.sh must decrypt with BACKUP_AGE_IDENTITY"
fi
if ! grep -Fq -- '.restore-lock' "${restore_script}"; then
  fail "restore-vault.sh must write .restore-lock under this FOUNDATION_DATA"
fi
if ! grep -Fq -- 'FOUNDATION_RESTORE_LOCK' "${restore_script}"; then
  fail "restore-vault.sh EXIT trap must keep lock path after foundation_restore_main returns"
fi
if ! grep -Eq -- 'DROP DATABASE|dropdb' "${restore_script}"; then
  fail "in-place restore must drop this vault's app database before load"
fi
if ! grep -Eq -- 'CREATE DATABASE|createdb' "${restore_script}"; then
  fail "in-place restore must recreate this vault's app database before load"
fi

if [[ ! -f "${backup_doc}" ]]; then
  fail "missing docs/BACKUP.md"
fi
if ! grep -Fq -- 'restore-vault.sh --in-place --confirm' "${backup_doc}"; then
  fail "docs/BACKUP.md does not document in-place restore"
fi
if ! grep -Fq -- 'throwaway' "${backup_doc}"; then
  fail "docs/BACKUP.md dropped throwaway restore"
fi

if [[ ! -f "${skill}" ]]; then
  fail "missing backup-vault skill"
fi
if grep -Fq -- 'Do not restore into a live vault.' "${skill}"; then
  fail "backup-vault skill still says do not restore into a live vault"
fi
if ! grep -Fq -- 'restore-vault.sh' "${skill}"; then
  fail "backup-vault skill does not name restore-vault.sh"
fi

unset FOUNDATION_DATA BACKUP_ROOT DATABASE_URL BACKUP_AGE_RECIPIENT BACKUP_AGE_IDENTITY BACKUP_KEEP_DAYS BACKUP_OFFSITE

tmp="$(mktemp -d)"
trap 'rm -rf -- "${tmp}"' EXIT

set +e
out="$("${restore_script}" 2>&1)"
rc=$?
set -e
if ((rc == 0)); then
  fail "restore without flags must refuse"
fi
if ! grep -Fq -- '--in-place' <<<"${out}"; then
  fail "restore usage must name --in-place (got: ${out})"
fi

set +e
out="$("${restore_script}" --in-place 2>&1)"
rc=$?
set -e
if ((rc == 0)); then
  fail "restore without --confirm must refuse"
fi

set +e
out="$("${restore_script}" --in-place --confirm 20000101 --host other.example 2>&1)"
rc=$?
set -e
if ((rc == 0)); then
  fail "restore must refuse a host argument"
fi
if ! grep -Fq -- 'unknown argument' <<<"${out}"; then
  fail "restore host argument must be unknown (got: ${out})"
fi

# shellcheck source=restore-vault.sh
source "${restore_script}"

mkdir -p "${tmp}/data" "${tmp}/backups/sql"
printf '%s\n' '16' >"${tmp}/data/placeholder"
printf '%s\n' 'age-encryption.org/v1' >"${tmp}/backups/sql/foundation-20000101.sql.age"
printf '%s\n' 'postgres://foundation:change-me@localhost:5432/foundation' >"${tmp}/url"

set +e
out="$(
  FOUNDATION_DATA="${tmp}/data"
  BACKUP_ROOT="${tmp}/backups"
  DATABASE_URL='postgres://foundation:change-me@localhost:1/foundation'
  unset BACKUP_AGE_IDENTITY
  foundation_restore_main --in-place --confirm 20000101 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "restore without BACKUP_AGE_IDENTITY must refuse"
fi
if ! grep -Fq -- 'BACKUP_AGE_IDENTITY' <<<"${out}"; then
  fail "missing identity nag must name BACKUP_AGE_IDENTITY (got: ${out})"
fi
if [[ -e "${tmp}/data/.restore-lock" ]]; then
  fail "failed restore left .restore-lock"
fi

printf '%s\n' 'not-a-real-key' >"${tmp}/identity"
set +e
out="$(
  FOUNDATION_DATA="${tmp}/data"
  BACKUP_ROOT="${tmp}/backups"
  DATABASE_URL='postgres://foundation:change-me@localhost:1/foundation'
  BACKUP_AGE_IDENTITY="${tmp}/identity"
  foundation_restore_decrypt() { return 1; }
  foundation_restore_main --in-place --confirm 20000101 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "decrypt failure must fail restore"
fi
if grep -Fq -- 'unbound variable' <<<"${out}"; then
  fail "EXIT trap must still see lock and plaintext temp (got: ${out})"
fi
if [[ -e "${tmp}/data/.restore-lock" ]]; then
  fail "failed decrypt left .restore-lock"
fi
if compgen -G "${tmp}/data/restore.plain.*" >/dev/null; then
  fail "failed decrypt left a plaintext temp"
fi

mkdir -p "${tmp}/data/blobs" "${tmp}/backups/blobs"
printf '%s\n' 'live-blob' >"${tmp}/data/blobs/keep-me"
printf '%s\n' 'backup-blob' >"${tmp}/backups/blobs/from-dump"
set +e
out="$(
  FOUNDATION_DATA="${tmp}/data"
  BACKUP_ROOT="${tmp}/backups"
  DATABASE_URL='postgres://foundation:change-me@localhost:1/foundation'
  BACKUP_AGE_IDENTITY="${tmp}/identity"
  foundation_restore_decrypt() { printf '%s\n' '-- decrypted fixture' >"$3"; }
  foundation_restore_recreate_database() { return 0; }
  foundation_restore_load_sql() { return 1; }
  foundation_restore_copy_blobs() {
    fail "live blobs must not be rsync --delete before SQL succeeds"
  }
  foundation_restore_main --in-place --confirm 20000101 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "load failure must fail restore"
fi
if ! grep -qx 'live-blob' "${tmp}/data/blobs/keep-me"; then
  fail "failed load replaced live blobs"
fi
if [[ -e "${tmp}/data/blobs/from-dump" ]]; then
  fail "failed load wrote backup blobs into live blobs"
fi
if [[ -e "${tmp}/data/.restore-lock" ]]; then
  fail "failed load left .restore-lock"
fi

mkdir -p "${tmp}/sys"
if foundation_restore_recreate_database "postgres://foundation:change-me@localhost:1/postgres" "${tmp}/data" 2>"${tmp}/sys/nag"; then
  fail "recreate must refuse a postgres maintenance database"
fi
if ! grep -Fq -- 'postgres' "${tmp}/sys/nag"; then
  fail "refused system database nag must name postgres (got: $(cat "${tmp}/sys/nag"))"
fi

echo "restore-vault.test: ok"
