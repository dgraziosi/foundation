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
trap 'rm -rf -- "${tmp_one}" "${tmp_two:-}"' EXIT
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

echo "backup-vault.test: ok"
