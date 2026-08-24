#!/usr/bin/env bash
# Contract fixtures for keep-vault-up. No live vault. No Docker.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
keep_script="${script_dir}/keep-vault-up.sh"
health_doc="${repo_root}/docs/VAULT_HEALTH.md"
readme="${repo_root}/README.md"

# shellcheck source=keep-vault-up.sh
source "${keep_script}"

fail() {
  echo "keep-vault-up.test: $*" >&2
  exit 1
}

bash -n "${keep_script}"

if [[ ! -f "${health_doc}" ]]; then
  fail "missing ${health_doc}"
fi
if [[ ! -f "${readme}" ]]; then
  fail "missing ${readme}"
fi

if ! grep -Fq -- 'scripts/keep-vault-up.sh' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not name scripts/keep-vault-up.sh"
fi
if ! grep -Fq -- 'scripts/keep-vault-up.sh' "${readme}"; then
  fail "README does not name scripts/keep-vault-up.sh"
fi
if ! grep -Fq -- '*/15 * * * * /path/to/the/clone/scripts/keep-vault-up.sh' "${health_doc}"; then
  fail "VAULT_HEALTH.md is missing the placeholder schedule line"
fi
if ! grep -Fq -- 'green is not enough' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not say /health green is not enough"
fi
if ! grep -Fq -- 'Do not create an empty cluster over that miss' "${health_doc}" \
  && ! grep -Fq -- 'Do not mkdir an empty live cluster over a miss' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not refuse mkdir over a miss"
fi
if ! grep -Fq -- '0 user records' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not say first-day 0 user records is healthy"
fi
if ! grep -Fq -- 'empty cluster next to a real one' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not refuse an empty cluster next to a real one"
fi

if grep -Eq -- '(^|[^[:alnum:]])(operator|seat)([^[:alnum:]]|$)' "${keep_script}" "${health_doc}"; then
  fail "keep-vault-up copy must not write operator or seat"
fi
if grep -Eq -- '/Users/|/home/[a-zA-Z]' "${keep_script}"; then
  fail "keep-vault-up.sh must not contain a live home path"
fi
if grep -Eiq -- 'docker|compose' "${keep_script}"; then
  fail "keep-vault-up.sh must not mention Docker or Compose"
fi
if grep -Eiq -- 'bot wake|wake a bot' "${keep_script}"; then
  fail "keep-vault-up.sh must not wake a bot"
fi
if ! grep -Fq -- 'pnpm start' "${keep_script}"; then
  fail "keep-vault-up.sh must start the app with pnpm start"
fi
if ! grep -Fq -- 'CREATE ROLE' "${keep_script}"; then
  fail "keep-vault-up.sh must create the app database role after initdb"
fi
if ! grep -Fq -- 'pg_ctl' "${keep_script}"; then
  fail "keep-vault-up.sh must start Postgres with pg_ctl"
fi
if ! grep -Fq -- 'http://127.0.0.1:8787/health' "${keep_script}"; then
  fail "keep-vault-up.sh does not default to localhost /health"
fi
if grep -Eiq -- '(^|[^[:alnum:]])(persist|watchdog|sentinel)([^[:alnum:]]|$)' "${keep_script}"; then
  fail "keep-vault-up.sh must not mint insider words"
fi

green_json='{ "ok": true, "service": "foundation", "db": "up" }'
down_json='{ "ok": false, "service": "foundation", "db": "down" }'
if ! foundation_keep_vault_up_body_is_green "${green_json}"; then
  fail "green /health body should pass"
fi
if foundation_keep_vault_up_body_is_green "${down_json}"; then
  fail "db down body should fail"
fi
if foundation_keep_vault_up_body_is_green '{ "ok": true, "service": "other", "db": "up" }'; then
  fail "wrong service should fail"
fi
if foundation_keep_vault_up_body_is_green ''; then
  fail "empty body should fail"
fi

dump_empty="$(mktemp)"
dump_people="$(mktemp)"
start_log="$(mktemp)"
tmp_root="$(mktemp -d)"
trap 'rm -f -- "${dump_empty}" "${dump_people}" "${start_log}"; rm -rf -- "${tmp_root}"' EXIT

printf '%s\n' '-- first-day dump' 'COPY public.nodes (id) FROM stdin;' '\.' >"${dump_empty}"
if foundation_keep_vault_up_sql_has_people "${dump_empty}"; then
  fail "empty COPY nodes must not count as people"
fi

printf '%s\n' '-- dump with people' 'INSERT INTO nodes (id, title) VALUES ('\''00000000-0000-0000-0000-000000000001'\'', '\''Fixture person'\'');' >"${dump_people}"
if ! foundation_keep_vault_up_sql_has_people "${dump_people}"; then
  fail "INSERT INTO nodes must count as people"
fi

role_sql="$(foundation_keep_vault_up_app_role_sql 'postgres://foundation:foundation@localhost:5432/foundation' role)"
if ! grep -Fq -- 'CREATE ROLE "foundation"' <<<"${role_sql}"; then
  fail "app role SQL must CREATE ROLE foundation (got: ${role_sql})"
fi
if ! grep -Fq -- 'CREATE DATABASE "foundation" OWNER "foundation"' \
  <<<"$(foundation_keep_vault_up_app_role_sql 'postgres://foundation:foundation@localhost:5432/foundation' createdb)"; then
  fail "app role SQL must CREATE DATABASE foundation"
fi

# Health + intended real cluster (records > 0): write nothing. Do not start.
: >"${start_log}"
out="$(
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_cluster_ok() { return 0; }
  foundation_keep_vault_up_refuse_missing_folder() { return 0; }
  foundation_keep_vault_up_refuse_miss() { return 0; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
if ((rc != 0)); then
  fail "health + real cluster should exit 0 (got ${rc})"
fi
if [[ -n "${out}" ]]; then
  fail "health + real cluster should write nothing (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "health + real cluster must not start"
fi

# Missing data folder: refuse. Do not start. Do not mkdir.
missing="${tmp_root}/missing-folder"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${missing}"
  BACKUP_ROOT="${tmp_root}/backups-missing"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    mkdir -p "${missing}/postgres"
    printf '%s\n' '16' >"${missing}/postgres/PG_VERSION"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "missing data folder should fail"
fi
if ! grep -Fq -- 'data dir is missing' <<<"${out}"; then
  fail "missing data folder did not nag (got: ${out})"
fi
if [[ -e "${missing}" ]]; then
  fail "must not mkdir a missing data folder"
fi
if [[ -s "${start_log}" ]]; then
  fail "missing data folder must not start"
fi

# Down, then start once, then health + first-day 0 records: quiet.
: >"${start_log}"
first_day="${tmp_root}/first-day"
mkdir -p "${first_day}/postgres"
printf '%s\n' '16' >"${first_day}/postgres/PG_VERSION"
out="$(
  FOUNDATION_DATA="${first_day}"
  BACKUP_ROOT="${tmp_root}/backups-first"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() { return 0; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '0'; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
if ((rc != 0)); then
  fail "healed first-day 0 user records should exit 0 (got ${rc})"
fi
if [[ -n "${out}" ]]; then
  fail "healed first-day 0 user records should write nothing (got: ${out})"
fi
if [[ "$(wc -l <"${start_log}" | tr -d ' ')" != "1" ]]; then
  fail "start must run once (log: $(cat "${start_log}"))"
fi

# /health already green + first-day 0 user records: quiet. Do not start.
: >"${start_log}"
out="$(
  FOUNDATION_DATA="${first_day}"
  BACKUP_ROOT="${tmp_root}/backups-first"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '0'; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
if ((rc != 0)); then
  fail "green first-day 0 user records should exit 0 (got ${rc})"
fi
if [[ -n "${out}" ]]; then
  fail "green first-day 0 user records should write nothing (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "green first-day must not start"
fi

# Still down after start once: nag.
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${first_day}"
  BACKUP_ROOT="${tmp_root}/backups-first"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() { return 1; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "still-down after start should fail"
fi
if ! grep -Fq -- 'start ran once and /health still failed' <<<"${out}"; then
  fail "still-down did not nag (got: ${out})"
fi
if [[ "$(wc -l <"${start_log}" | tr -d ' ')" != "1" ]]; then
  fail "still-down must not loop start"
fi

# Start itself fails: nag that start failed, not that /health still failed.
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${first_day}"
  BACKUP_ROOT="${tmp_root}/backups-first"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    foundation_keep_vault_up_nag "start failed. Postgres did not start from the data dir."
    return 1
  }
  foundation_keep_vault_up_wait_health() {
    echo waited >>"${start_log}"
    return 1
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "start failure should fail"
fi
if ! grep -Fq -- 'start failed' <<<"${out}"; then
  fail "start failure did not nag (got: ${out})"
fi
if grep -Fq -- '/health still failed' <<<"${out}"; then
  fail "start failure must not claim /health still failed (got: ${out})"
fi
if [[ "$(wc -l <"${start_log}" | tr -d ' ')" != "1" ]]; then
  fail "start failure must not wait on health (log: $(cat "${start_log}"))"
fi

# Existing data dir, postgres/ without PG_VERSION: refuse. Do not mkdir. Do not start.
miss_pg="${tmp_root}/miss-pg"
mkdir -p "${miss_pg}/postgres"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${miss_pg}"
  BACKUP_ROOT="${tmp_root}/backups-miss"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    printf '%s\n' '16' >"${miss_pg}/postgres/PG_VERSION"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "missing PG_VERSION should fail"
fi
if ! grep -Fq -- 'no PG_VERSION' <<<"${out}"; then
  fail "missing PG_VERSION did not nag (got: ${out})"
fi
if [[ -e "${miss_pg}/postgres/PG_VERSION" ]]; then
  fail "must not mkdir PG_VERSION over a miss"
fi
if [[ -s "${start_log}" ]]; then
  fail "missing PG_VERSION must not start"
fi

# /health green, data dir exists, PG_VERSION missing: nag. Do not mkdir.
miss_up="${tmp_root}/miss-up"
mkdir -p "${miss_up}/postgres"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${miss_up}"
  BACKUP_ROOT="${tmp_root}/backups-miss-up"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "green /health with missing PG_VERSION should fail"
fi
if ! grep -Fq -- 'no PG_VERSION' <<<"${out}"; then
  fail "green /health with missing PG_VERSION did not nag (got: ${out})"
fi
if [[ -e "${miss_up}/postgres/PG_VERSION" ]]; then
  fail "green /health miss must not mkdir PG_VERSION"
fi
if [[ -s "${start_log}" ]]; then
  fail "green /health miss must not start"
fi

# Empty live (0 records, has PG_VERSION) next to a backup that has people: refuse.
empty_live="${tmp_root}/empty-live"
mkdir -p "${empty_live}/postgres" "${tmp_root}/backups-people/sql"
printf '%s\n' '16' >"${empty_live}/postgres/PG_VERSION"
printf '%s\n' 'INSERT INTO nodes (id, title) VALUES ('\''00000000-0000-0000-0000-000000000001'\'', '\''Fixture person'\'');' \
  >"${tmp_root}/backups-people/sql/foundation-20000101.sql"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${empty_live}"
  BACKUP_ROOT="${tmp_root}/backups-people"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '0'; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "empty live next to a backup with people should fail"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "empty-live-next-to-backup did not nag (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "empty-live-next-to-backup must not start"
fi

# Empty live next to a second postgres tree that has people: refuse.
sibling="${tmp_root}/vaults"
mkdir -p "${sibling}/live/postgres" "${sibling}/real/postgres/base/16384" "${sibling}/real/blobs"
printf '%s\n' '16' >"${sibling}/live/postgres/PG_VERSION"
printf '%s\n' '16' >"${sibling}/real/postgres/PG_VERSION"
printf '%s\n' 'fixture-blob' >"${sibling}/real/blobs/fixture"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${sibling}/live"
  BACKUP_ROOT="${tmp_root}/backups-empty"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '0'; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "empty live next to a second tree with people should fail"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "empty-live-next-to-second-tree did not nag (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "empty-live-next-to-second-tree must not start"
fi

# First-day 0 records next to a sibling initdb cluster (base/ exists, no people): healthy.
empty_sib="${tmp_root}/empty-sib"
mkdir -p "${empty_sib}/live/postgres" "${empty_sib}/restore-data/postgres/base/1"
printf '%s\n' '16' >"${empty_sib}/live/postgres/PG_VERSION"
printf '%s\n' '16' >"${empty_sib}/restore-data/postgres/PG_VERSION"
: >"${start_log}"
out="$(
  FOUNDATION_DATA="${empty_sib}/live"
  BACKUP_ROOT="${tmp_root}/backups-empty-sib"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '0'; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
if ((rc != 0)); then
  fail "first-day next to empty sibling cluster should exit 0 (got ${rc}: ${out})"
fi
if [[ -n "${out}" ]]; then
  fail "first-day next to empty sibling cluster should write nothing (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "first-day next to empty sibling cluster must not start"
fi

# BACKUP_ROOT from clone .env; relative path is under the clone, not cwd.
env_clone="${tmp_root}/env-clone"
mkdir -p "${env_clone}/data/postgres" "${env_clone}/my-backups/sql"
printf '%s\n' '16' >"${env_clone}/data/postgres/PG_VERSION"
printf '%s\n' 'BACKUP_ROOT=./my-backups' >"${env_clone}/.env"
printf '%s\n' 'INSERT INTO nodes (id, title) VALUES ('\''00000000-0000-0000-0000-000000000001'\'', '\''Fixture person'\'');' \
  >"${env_clone}/my-backups/sql/foundation-20000101.sql"
backup_got="$(
  cd "${tmp_root}"
  unset BACKUP_ROOT
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${env_clone}"; }
  foundation_keep_vault_up_backup_root "${env_clone}/data"
)"
if [[ "${backup_got}" != "${env_clone}/my-backups" ]]; then
  fail "BACKUP_ROOT from clone .env should resolve under the clone (got: ${backup_got})"
fi
: >"${start_log}"
set +e
out="$(
  cd "${tmp_root}"
  unset BACKUP_ROOT
  FOUNDATION_DATA="${env_clone}/data"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${env_clone}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '0'; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "empty live next to .env BACKUP_ROOT with people should fail"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "empty-live-next-to-env-backup did not nag (got: ${out})"
fi

# Stop kills the recorded pid and its child (not wait of another process).
stop_dir="${tmp_root}/stop-tree"
mkdir -p "${stop_dir}/postgres"
(
  sleep 120 &
  echo $! >"${tmp_root}/stop-child.pid"
  sleep 120
) &
echo $! >"${stop_dir}/app.pid"
i=0
while ((i < 5)) && [[ ! -s "${tmp_root}/stop-child.pid" ]]; do
  sleep 1
  i=$((i + 1))
done
stop_parent="$(tr -d '[:space:]' <"${stop_dir}/app.pid")"
stop_child="$(tr -d '[:space:]' <"${tmp_root}/stop-child.pid")"
if ! kill -0 "${stop_parent}" 2>/dev/null || ! kill -0 "${stop_child}" 2>/dev/null; then
  fail "stop fixture did not start a parent/child tree"
fi
(
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_data_dir() { printf '%s\n' "${stop_dir}"; }
  foundation_keep_vault_up_stop
)
if kill -0 "${stop_parent}" 2>/dev/null; then
  fail "stop left the app wrapper running"
fi
if kill -0 "${stop_child}" 2>/dev/null; then
  fail "stop left the app child running"
fi

# Health + PG_VERSION + records: quiet.
real="${tmp_root}/real-only"
mkdir -p "${real}/postgres"
printf '%s\n' '16' >"${real}/postgres/PG_VERSION"
out="$(
  FOUNDATION_DATA="${real}"
  BACKUP_ROOT="${tmp_root}/backups-real"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '3'; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
if ((rc != 0)); then
  fail "health + real cluster fixture should exit 0 (got ${rc})"
fi
if [[ -n "${out}" ]]; then
  fail "health + real cluster fixture should write nothing (got: ${out})"
fi

echo "keep-vault-up.test: ok"
