#!/usr/bin/env bash
# Syntax check plus prune fixture. No live vault, no real dump.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backup_script="${script_dir}/backup-vault.sh"

bash -n "${backup_script}"

# shellcheck source=backup-vault.sh
source "${backup_script}"

fail() {
  echo "backup-vault.test: $*" >&2
  exit 1
}

# Single dated dump older than 14 days must survive prune.
tmp_one="$(mktemp -d)"
trap 'rm -rf -- "${tmp_one}" "${tmp_two:-}" "${tmp_fail:-}" "${tmp_blobs:-}"' EXIT
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

echo "backup-vault.test: ok"
