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

# Contract fixtures. No live vault. Drop leftover host env so fixtures
# do not count or start a cluster this run did not create.
unset FOUNDATION_DATA BACKUP_ROOT DATABASE_URL
export DATABASE_URL="postgres://foundation:foundation@127.0.0.1:1/foundation"

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
if grep -Fq -- ':foundation@' "${repo_root}/.env.example"; then
  fail ".env.example still ships password foundation"
fi
if grep -Fq -- 'u.password or "foundation"' "${keep_script}"; then
  fail "role SQL generator still defaults password to foundation"
fi
if grep -Fq -- 'postgres://foundation:foundation@' "${keep_script}"; then
  fail "keep-vault-up.sh still ships a default URL with password foundation"
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
if ! grep -Fq -- '-k' "${keep_script}"; then
  fail "keep-vault-up.sh must pass a unix socket dir with -k"
fi
if grep -Eq -- '-k[[:space:]]+/var/run/postgresql' "${keep_script}"; then
  fail "keep-vault-up.sh must not pass -k /var/run/postgresql"
fi
if ! grep -Fq -- 'vector' "${readme}"; then
  fail "README does not name vector beside the other extensions"
fi
if ! grep -Fq -- 'vector' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not name vector beside the other extensions"
fi
if ! grep -Fq -- 'initdb' "${readme}" || ! grep -Fq -- 'pg_ctl' "${readme}" || ! grep -Fq -- 'psql' "${readme}"; then
  fail "README does not say PATH must include initdb, pg_ctl, and psql"
fi
if ! grep -Fq -- 'initdb' "${health_doc}" || ! grep -Fq -- 'pg_ctl' "${health_doc}" || ! grep -Fq -- 'psql' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not say PATH must include initdb, pg_ctl, and psql"
fi
if ! grep -Fq -- 'mkdir -p ./data' "${readme}"; then
  fail "README does not mkdir the empty first-day data folder"
fi
if ! grep -Fq -- '`mkdir` the data dir' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not say to mkdir the empty first-day data dir"
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
if ! foundation_keep_vault_up_body_is_green '{"ok":true,"service":"foundation","db":"up"}'; then
  fail "compact green /health body should pass"
fi
if foundation_keep_vault_up_body_is_green '{"ok":true,"service":"foundation","db":"upx"}'; then
  fail "db upx must not count as up"
fi
if awk '/^foundation_keep_vault_up_body_is_green\(\)/,/^}/' "${keep_script}" | grep -q -- 'python3'; then
  fail "body_is_green must parse /health in bash, not python3"
fi
(
  PATH=/nonexistent
  if ! foundation_keep_vault_up_body_is_green "${green_json}"; then
    fail "green /health must parse without python3 on PATH"
  fi
)

dump_empty="$(mktemp)"
dump_people="$(mktemp)"
dump_copy="$(mktemp)"
dump_bad="$(mktemp)"
start_log="$(mktemp)"
tmp_root="$(mktemp -d)"
trap 'chmod u+r -- "${dump_bad}" 2>/dev/null || true; rm -f -- "${dump_empty}" "${dump_people}" "${dump_copy}" "${dump_bad}" "${start_log}"; rm -rf -- "${tmp_root}" "${empty_clone:-}"' EXIT

if awk '/^foundation_keep_vault_up_sql_has_people\(\)/,/^}/' "${keep_script}" | grep -q -- 'python3'; then
  fail "sql_has_people must parse dumps in bash, not python3"
fi

printf '%s\n' '-- first-day dump' 'COPY public.nodes (id) FROM stdin;' '\.' >"${dump_empty}"
if foundation_keep_vault_up_sql_has_people "${dump_empty}"; then
  fail "empty COPY nodes must not count as people"
fi

printf '%s\n' '-- dump with people' 'INSERT INTO nodes (id, title) VALUES ('\''00000000-0000-0000-0000-000000000001'\'', '\''Fixture person'\'');' >"${dump_people}"
if ! foundation_keep_vault_up_sql_has_people "${dump_people}"; then
  fail "INSERT INTO nodes must count as people"
fi

printf '%s\n' 'COPY public.nodes (id) FROM stdin;' '00000000-0000-0000-0000-000000000001' '\.' >"${dump_copy}"
if ! foundation_keep_vault_up_sql_has_people "${dump_copy}"; then
  fail "COPY nodes with a row must count as people"
fi

printf '%s\n' '-- unreadable dump' >"${dump_bad}"
chmod a-r -- "${dump_bad}"
if ! foundation_keep_vault_up_sql_has_people "${dump_bad}"; then
  fail "unreadable dump must count as people-unknown, not no people"
fi
chmod u+r -- "${dump_bad}"

(
  PATH=/nonexistent
  if ! foundation_keep_vault_up_sql_has_people "${dump_people}"; then
    fail "INSERT dump must count as people without python3 on PATH"
  fi
  if foundation_keep_vault_up_sql_has_people "${dump_empty}"; then
    fail "empty COPY must stay not-people without python3 on PATH"
  fi
)

if role_sql="$(foundation_keep_vault_up_app_role_sql 'postgres://foundation@localhost:5432/foundation' role 2>/dev/null)"; then
  fail "role SQL must refuse a URL with no password (got: ${role_sql})"
fi
if grep -Fq -- "PASSWORD 'foundation'" <<<"${role_sql:-}"; then
  fail "role SQL must not emit PASSWORD 'foundation' when the URL has no password"
fi

unset DATABASE_URL
empty_clone="$(mktemp -d)"
if url="$(foundation_keep_vault_up_database_url "${empty_clone}" 2>"${empty_clone}/nag")"; then
  fail "unset DATABASE_URL must nag, not invent a URL (got: ${url})"
fi
if ! grep -Fq -- '.env.example' "${empty_clone}/nag"; then
  fail "unset DATABASE_URL nag must mention .env.example (got: $(cat "${empty_clone}/nag"))"
fi
export DATABASE_URL="postgres://foundation:foundation@127.0.0.1:1/foundation"

role_sql="$(foundation_keep_vault_up_app_role_sql 'postgres://foundation:foundation@localhost:5432/foundation' role)"
if ! grep -Fq -- 'CREATE ROLE "foundation"' <<<"${role_sql}"; then
  fail "app role SQL must CREATE ROLE foundation (got: ${role_sql})"
fi
if ! grep -Fq -- 'DO $do$' <<<"${role_sql}"; then
  fail "default role SQL should use \$do\$ (got: ${role_sql})"
fi
if ! grep -Fq -- 'CREATE DATABASE "foundation" OWNER "foundation"' \
  <<<"$(foundation_keep_vault_up_app_role_sql 'postgres://foundation:foundation@localhost:5432/foundation' createdb)"; then
  fail "app role SQL must CREATE DATABASE foundation"
fi

# Password (or user) containing $do$ must pick $do1$, not a broken quote.
odd_sql="$(foundation_keep_vault_up_app_role_sql 'postgres://foundation:pass$do$word@localhost:5432/foundation' role)"
if grep -Fq -- 'DO $do$' <<<"${odd_sql}"; then
  fail "role SQL must not use \$do\$ when the password contains that tag (got: ${odd_sql})"
fi
if ! grep -Fq -- 'DO $do1$' <<<"${odd_sql}"; then
  fail "role SQL should pick \$do1\$ when \$do\$ is in the password (got: ${odd_sql})"
fi
if ! grep -Fq -- "PASSWORD 'pass\$do\$word'" <<<"${odd_sql}"; then
  fail "role SQL must keep a \$do\$ password intact (got: ${odd_sql})"
fi
odd_user_sql="$(foundation_keep_vault_up_app_role_sql 'postgres://user$do$1:foundation@localhost:5432/foundation' role)"
if grep -Fq -- 'DO $do$' <<<"${odd_user_sql}"; then
  fail "role SQL must not use \$do\$ when the user contains that tag (got: ${odd_user_sql})"
fi
if ! grep -Fq -- 'DO $do1$' <<<"${odd_user_sql}"; then
  fail "role SQL should pick \$do1\$ when \$do\$ is in the user (got: ${odd_user_sql})"
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

# /health down, live 0, dump with people: refuse BEFORE start.
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${empty_live}"
  BACKUP_ROOT="${tmp_root}/backups-people"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '0'; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() {
    echo waited >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "down + empty live next to a dump with people should fail"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "down empty-live-next-to-dump did not nag (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "down empty-live-next-to-dump must not start (log: $(cat "${start_log}"))"
fi

# /health down, empty-looking live (PG_VERSION only, no blobs, no real
# cluster), real count miss (do not inject 0), dump with people: refuse
# BEFORE start. Nag empty-next-to-real, not only could-not-count.
count_miss="${tmp_root}/count-miss"
mkdir -p "${count_miss}/postgres"
printf '%s\n' '16' >"${count_miss}/postgres/PG_VERSION"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${count_miss}"
  BACKUP_ROOT="${tmp_root}/backups-people"
  DATABASE_URL='postgres://foundation:foundation@127.0.0.1:1/foundation'
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() {
    echo waited >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "count-unknown next to a dump with people should fail"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "count-unknown next to dump did not nag empty-next-to-real (got: ${out})"
fi
if grep -Fq -- 'could not count records' <<<"${out}"; then
  fail "count-unknown next to people must nag empty-next-to-real, not only could-not-count (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "count-unknown next to dump must not start (log: $(cat "${start_log}"))"
fi

# Same count miss next to a second tree with people (blobs), not an injected 0.
count_miss_sib="${tmp_root}/count-miss-sib"
mkdir -p "${count_miss_sib}/live/postgres" "${count_miss_sib}/real/postgres/base/1" "${count_miss_sib}/real/blobs"
printf '%s\n' '16' >"${count_miss_sib}/live/postgres/PG_VERSION"
printf '%s\n' '16' >"${count_miss_sib}/real/postgres/PG_VERSION"
printf '%s\n' 'fixture-blob' >"${count_miss_sib}/real/blobs/fixture"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${count_miss_sib}/live"
  BACKUP_ROOT="${tmp_root}/backups-count-miss-sib"
  DATABASE_URL='postgres://foundation:foundation@127.0.0.1:1/foundation'
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() {
    echo waited >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "count-unknown next to a second tree with people should fail"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "count-unknown next to second tree did not nag empty-next-to-real (got: ${out})"
fi
if grep -Fq -- 'could not count records' <<<"${out}"; then
  fail "count-unknown next to second tree must nag empty-next-to-real, not only could-not-count (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "count-unknown next to second tree must not start (log: $(cat "${start_log}"))"
fi

# Count miss on a real postgres tree (PG_VERSION + base/), backups nearby:
# START (heal). Do not refuse as empty-next-to-real. Nested so a later
# first-day folder under tmp_root does not see these blobs as people.
heal_box="${tmp_root}/heal-box"
heal_real="${heal_box}/real"
mkdir -p "${heal_real}/postgres/base/16384"
printf '%s\n' '16' >"${heal_real}/postgres/PG_VERSION"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${heal_real}"
  BACKUP_ROOT="${tmp_root}/backups-people"
  DATABASE_URL='postgres://foundation:foundation@127.0.0.1:1/foundation'
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() { return 0; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if [[ "$(wc -l <"${start_log}" | tr -d ' ')" != "1" ]]; then
  fail "count-miss on a real postgres tree must start (log: $(cat "${start_log}"); out: ${out})"
fi
if grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "heal path must not refuse as empty-next-to-real (got: ${out})"
fi

# Count miss on live with blobs, backups nearby: START (heal).
heal_blobs="${heal_box}/blobs"
mkdir -p "${heal_blobs}/postgres" "${heal_blobs}/blobs"
printf '%s\n' '16' >"${heal_blobs}/postgres/PG_VERSION"
printf '%s\n' 'live-blob' >"${heal_blobs}/blobs/fixture"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${heal_blobs}"
  BACKUP_ROOT="${tmp_root}/backups-people"
  DATABASE_URL='postgres://foundation:foundation@127.0.0.1:1/foundation'
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() { return 0; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if [[ "$(wc -l <"${start_log}" | tr -d ' ')" != "1" ]]; then
  fail "count-miss on live with blobs must start (log: $(cat "${start_log}"); out: ${out})"
fi
if grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "live blobs heal path must not refuse as empty-next-to-real (got: ${out})"
fi

# After heal start, count becomes numeric 0 next to people: nag
# empty-next-to-real. First count misses (heal). Do not inject 0
# before start.
heal_then_zero="${heal_box}/then-zero"
mkdir -p "${heal_then_zero}/postgres/base/16384"
printf '%s\n' '16' >"${heal_then_zero}/postgres/PG_VERSION"
# Count is read inside $(...); persist calls in a file, not a shell var.
printf '%s\n' '0' >"${tmp_root}/heal-then-zero-count"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${heal_then_zero}"
  BACKUP_ROOT="${tmp_root}/backups-people"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_live_user_record_count() {
    local n
    n="$(tr -d '[:space:]' <"${tmp_root}/heal-then-zero-count")"
    n=$((n + 1))
    printf '%s\n' "${n}" >"${tmp_root}/heal-then-zero-count"
    if ((n == 1)); then
      return 1
    fi
    printf '%s\n' '0'
  }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() { return 0; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if [[ "$(wc -l <"${start_log}" | tr -d ' ')" != "1" ]]; then
  fail "heal then 0+people must start (log: $(cat "${start_log}"); out: ${out})"
fi
if ((rc == 0)); then
  fail "heal then 0+people must not stay quiet (out: ${out})"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "heal then 0+people did not nag empty-next-to-real (got: ${out})"
fi

# First-day folder (no postgres/) next to a dump with people: refuse. Do not initdb.
first_init="${tmp_root}/first-init"
mkdir -p "${first_init}"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${first_init}"
  BACKUP_ROOT="${tmp_root}/backups-people"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "first-day next to a dump with people should fail"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "first-day-next-to-dump did not nag (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "first-day next to a dump with people must not start"
fi
if [[ -e "${first_init}/postgres" ]]; then
  fail "first-day next to a dump with people must not initdb"
fi

# First-day folder (no postgres/) and no nearby people: may start (init).
# Own parent so other fixtures under tmp_root are not "nearby people".
blank_box="${tmp_root}/blank-box"
blank_first="${blank_box}/first"
mkdir -p "${blank_first}" "${blank_box}/backups-blank"
: >"${start_log}"
out="$(
  FOUNDATION_DATA="${blank_first}"
  BACKUP_ROOT="${blank_box}/backups-blank"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    mkdir -p "${blank_first}/postgres"
    printf '%s\n' '16' >"${blank_first}/postgres/PG_VERSION"
    return 0
  }
  foundation_keep_vault_up_wait_health() { return 0; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '0'; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
if ((rc != 0)); then
  fail "first-day with no nearby people should start (got ${rc}: ${out})"
fi
if [[ "$(wc -l <"${start_log}" | tr -d ' ')" != "1" ]]; then
  fail "first-day with no nearby people must start once (log: $(cat "${start_log}"))"
fi

# python3 missing: dump with INSERT still refuses empty live (no start).
nopy="${tmp_root}/nopython"
mkdir -p "${nopy}"
printf '%s\n' '#!/bin/sh' 'echo python3-should-not-run >&2' 'exit 127' >"${nopy}/python3"
chmod +x "${nopy}/python3"
: >"${start_log}"
set +e
out="$(
  PATH="${nopy}:${PATH}"
  FOUNDATION_DATA="${empty_live}"
  BACKUP_ROOT="${tmp_root}/backups-people"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
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
  fail "empty live + dump with people must refuse without python3"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "no-python3 dump people did not nag (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "no-python3 dump people must not start"
fi

# Unreadable dump: people-unknown. Empty live must refuse, not start.
mkdir -p "${tmp_root}/backups-unreadable/sql"
printf '%s\n' '-- cannot scan' >"${tmp_root}/backups-unreadable/sql/foundation-20000101.sql"
chmod a-r -- "${tmp_root}/backups-unreadable/sql/foundation-20000101.sql"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${empty_live}"
  BACKUP_ROOT="${tmp_root}/backups-unreadable"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '0'; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
chmod u+r -- "${tmp_root}/backups-unreadable/sql/foundation-20000101.sql" || true
if ((rc == 0)); then
  fail "empty live + unreadable dump must refuse"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "unreadable dump did not nag (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "unreadable dump must not start"
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
set +e
out="$(
  FOUNDATION_DATA="${real}"
  BACKUP_ROOT="${tmp_root}/backups-real"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_live_user_record_count() { printf '%s\n' '3'; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc != 0)); then
  fail "health + real cluster fixture should exit 0 (got ${rc})"
fi
if [[ -n "${out}" ]]; then
  fail "health + real cluster fixture should write nothing (got: ${out})"
fi

socket_got="$(foundation_keep_vault_up_socket_dir /tmp/vault-data)"
if [[ "${socket_got}" != "/tmp/vault-data/pg-sock" ]]; then
  fail "socket dir should be under the data folder (got: ${socket_got})"
fi
listen_got="$(foundation_keep_vault_up_postgres_listen_args "/tmp/vault data/pg-sock")"
if [[ "${listen_got}" != "-h 127.0.0.1 -p 5432 -k '/tmp/vault data/pg-sock'" ]]; then
  fail "listen args must quote -k as one directory (got: ${listen_got})"
fi

# start_postgres mkdir's pg-sock and passes -k as one directory.
# Fake pg_ctl; no live cluster. Data folder path has a space.
sock_tmp="$(mktemp -d)"
data_dir="${sock_tmp}/vault data"
mkdir -p "${sock_tmp}/bin" "${data_dir}/postgres"
printf '%s\n' '16' >"${data_dir}/postgres/PG_VERSION"
cat >"${sock_tmp}/bin/pg_ctl" <<'EOF'
#!/bin/sh
# Record the -o string as one argv. status means not running.
while [ $# -gt 0 ]; do
  case "$1" in
    -o)
      printf 'O=%s\n' "$2" >> "${PG_CTL_LOG:?}"
      shift 2
      ;;
    status)
      exit 1
      ;;
    *)
      shift
      ;;
  esac
done
exit 0
EOF
chmod +x "${sock_tmp}/bin/pg_ctl"
export PG_CTL_LOG="${sock_tmp}/pg_ctl.log"
set +e
PATH="${sock_tmp}/bin:${PATH}" foundation_keep_vault_up_start_postgres "${data_dir}"
start_rc=$?
set -e
if ((start_rc != 0)); then
  fail "start_postgres failed (rc ${start_rc}; log: $(cat "${PG_CTL_LOG}" 2>/dev/null || true))"
fi
want_sock="${data_dir}/pg-sock"
if [[ ! -d "${want_sock}" ]]; then
  fail "start_postgres must mkdir the data-folder socket dir"
fi
if [[ ! -f "${PG_CTL_LOG}" ]]; then
  fail "fake pg_ctl did not record -o"
fi
o="$(sed -n 's/^O=//p' "${PG_CTL_LOG}" | tail -n 1)"
if [[ -z "${o}" ]]; then
  fail "start_postgres must pass -o (got: $(cat "${PG_CTL_LOG}"))"
fi
# pg_ctl feeds -o through a shell. -k must stay one directory.
eval "set -- ${o}"
k_dir=""
while (($# > 0)); do
  if [[ "$1" == "-k" ]]; then
    k_dir="${2-}"
    break
  fi
  shift
done
if [[ "${k_dir}" != "${want_sock}" ]]; then
  fail "pg_ctl -o -k must be one directory with a space (got: '${k_dir}'; -o: ${o})"
fi
if grep -Fq -- '/var/run/postgresql' <<<"${o}"; then
  fail "start_postgres must not pass /var/run/postgresql"
fi
rm -rf -- "${sock_tmp}"

age_live="${tmp_root}/empty-live-age"
mkdir -p "${age_live}/postgres" "${tmp_root}/backups-age/sql"
printf '%s\n' '16' >"${age_live}/postgres/PG_VERSION"
printf '%s\n' 'age-encryption.org/v1' >"${tmp_root}/backups-age/sql/foundation-20000101.sql.age"
printf '%s\n' 'has_people=yes' >"${tmp_root}/backups-age/MANIFEST"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${age_live}"
  BACKUP_ROOT="${tmp_root}/backups-age"
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
  fail "empty live next to a .sql.age dump with people should fail"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "empty-live-next-to-.sql.age did not nag (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "empty-live-next-to-.sql.age must not start"
fi

age_unknown="${tmp_root}/empty-live-age-unknown"
mkdir -p "${age_unknown}/postgres" "${tmp_root}/backups-age-unknown/sql"
printf '%s\n' '16' >"${age_unknown}/postgres/PG_VERSION"
printf '%s\n' 'age-encryption.org/v1' >"${tmp_root}/backups-age-unknown/sql/foundation-20000101.sql.age"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${age_unknown}"
  BACKUP_ROOT="${tmp_root}/backups-age-unknown"
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
  fail "empty live next to a .sql.age dump without MANIFEST should fail"
fi
if ! grep -Fq -- 'empty cluster next to a real one' <<<"${out}"; then
  fail "empty-live-next-to-.sql.age-unknown did not nag (got: ${out})"
fi

lock_live="${tmp_root}/lock-live"
mkdir -p "${lock_live}/postgres"
printf '%s\n' '16' >"${lock_live}/postgres/PG_VERSION"
printf '%s\n' '1' >"${lock_live}/.restore-lock"
: >"${start_log}"
set +e
out="$(
  FOUNDATION_DATA="${lock_live}"
  BACKUP_ROOT="${tmp_root}/backups-empty"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_start() {
    echo start >>"${start_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "restore lock must stop keep-up from starting"
fi
if ! grep -Fq -- 'restore is running for this vault' <<<"${out}"; then
  fail "restore lock did not nag (got: ${out})"
fi
if [[ -s "${start_log}" ]]; then
  fail "restore lock must not start"
fi

echo "keep-vault-up.test: ok"
