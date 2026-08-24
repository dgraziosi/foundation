#!/usr/bin/env bash
# Keep the vault up. Quiet when /health is green and the live folder is
# the intended real cluster. Not a bot.
#
#   FOUNDATION_HEALTH_URL — optional. Default http://127.0.0.1:8787/health
#   FOUNDATION_DATA       — the vault (default ./data under the clone;
#                           also read from the clone .env)
#   BACKUP_ROOT           — optional. Also read from the clone .env.
#                           Default: sibling of the data dir.
#                           Relative paths are under the clone.
#   DATABASE_URL          — optional. Also read from the clone .env.
#                           Default postgres://foundation:foundation@localhost:5432/foundation
#
# Starts Postgres 16 (the data folder's postgres tree) and the app
# (`pnpm start`) when /health is down. First-day 0 user records is
# healthy. Refuses a missing data folder, a postgres/ tree without
# PG_VERSION, and an empty live cluster next to a real one (a second
# postgres tree or a backup that has people while live has 0) before
# any start or initdb. A failed count is not empty: a stopped real
# vault must start. Count-unknown refuses only when live looks empty
# without psql (no blobs, and no postgres/ or a first-day-empty
# cluster). After start (or when /health is already green), numeric
# 0 next to people nags empty-next-to-real. First-day 0 with no
# people nearby stays healthy. People means blob files or a dump
# with node rows. A sibling postgres/base tree is not people. Does
# not mkdir over a miss. Does not write the graph. Does not put a
# live path in git.
#
#   scripts/keep-vault-up.sh        — start if needed, then check
#   scripts/keep-vault-up.sh stop   — stop the app, then Postgres.
#                                     Does not delete the data folder.
set -euo pipefail

foundation_keep_vault_up_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  (cd "${script_dir}/.." && pwd)
}

foundation_keep_vault_up_health_url() {
  printf '%s\n' "${FOUNDATION_HEALTH_URL:-http://127.0.0.1:8787/health}"
}

# KEY from the environment, else the clone .env. Does not print .env.
foundation_keep_vault_up_env_value() {
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

# FOUNDATION_DATA from the environment, else the clone .env, else ./data.
# Relative paths are under the clone. Does not print .env.
foundation_keep_vault_up_data_dir() {
  local repo_root="$1"
  local raw
  raw="$(foundation_keep_vault_up_env_value "${repo_root}" FOUNDATION_DATA)"
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
foundation_keep_vault_up_backup_root() {
  local data_dir="${1%/}"
  local repo_root raw
  repo_root="$(foundation_keep_vault_up_repo_root)"
  raw="$(foundation_keep_vault_up_env_value "${repo_root}" BACKUP_ROOT)"
  if [[ -z "${raw}" ]]; then
    raw="$(dirname -- "${data_dir}")/foundation-backups"
  fi
  raw="${raw%/}"
  if [[ "${raw}" != /* ]]; then
    printf '%s\n' "${repo_root}/${raw#./}"
  else
    printf '%s\n' "${raw}"
  fi
}

foundation_keep_vault_up_database_url() {
  local repo_root="$1"
  local raw
  raw="$(foundation_keep_vault_up_env_value "${repo_root}" DATABASE_URL)"
  printf '%s\n' "${raw:-postgres://foundation:foundation@localhost:5432/foundation}"
}

# HTTP 200 and { ok: true, service: "foundation", db: "up" }.
# Bash only. A missing python3 must not treat a live green body as down.
foundation_keep_vault_up_json_field() {
  local compact="$1"
  local needle="$2"
  [[ "${compact}" == *"${needle},"* || "${compact}" == *"${needle}}"* ]]
}

foundation_keep_vault_up_body_is_green() {
  local body="$1"
  local compact="${body//[$' \t\n\r']/}"
  [[ -n "${compact}" ]] || return 1
  foundation_keep_vault_up_json_field "${compact}" '"ok":true' || return 1
  foundation_keep_vault_up_json_field "${compact}" '"service":"foundation"' || return 1
  foundation_keep_vault_up_json_field "${compact}" '"db":"up"' || return 1
  return 0
}

foundation_keep_vault_up_health_ok() {
  local url body
  url="$(foundation_keep_vault_up_health_url)"
  body="$(curl -fsS --max-time 5 "${url}" 2>/dev/null || true)"
  foundation_keep_vault_up_body_is_green "${body}"
}

foundation_keep_vault_up_nag() {
  echo "vault is down: $*" >&2
}

# A SQL dump has people when it copies or inserts at least one nodes row.
# Empty COPY (header then \.) is not people. First-day schema-only is not.
# Bash only. Missing python3 must not treat a dump with people as empty.
# Unreadable or unscanable dump: people-unknown (return 0), never "no people".
foundation_keep_vault_up_sql_has_people() {
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

# Backup dumps under BACKUP_ROOT (and default sibling) that have people.
foundation_keep_vault_up_backup_has_people() {
  local backup_root="$1"
  local f
  [[ -d "${backup_root}" ]] || return 1
  while IFS= read -r f; do
    [[ -n "${f}" ]] || continue
    if foundation_keep_vault_up_sql_has_people "${f}"; then
      return 0
    fi
  done < <(find "${backup_root}" -type f \( -name 'foundation-*.sql' -o -name '*.sql' \) 2>/dev/null | LC_ALL=C sort)
  return 1
}

# Another data-dir/postgres/PG_VERSION under the parent of the live
# data dir. That other tree "has people" when it has blob files or a
# dump with people. An initdb cluster (postgres/base exists) with no
# blobs and no dump is not people — first-day or a throwaway restore
# folder next to live must stay healthy.
foundation_keep_vault_up_second_tree_has_people() {
  local data_dir="${1%/}"
  local parent other pg f
  parent="$(dirname -- "${data_dir}")"
  [[ -d "${parent}" ]] || return 1
  while IFS= read -r pg; do
    [[ -n "${pg}" ]] || continue
    other="$(cd "$(dirname -- "${pg}")/.." && pwd)"
    if [[ "${other}" == "${data_dir}" ]]; then
      continue
    fi
    if [[ -d "${other}/blobs" ]] && find "${other}/blobs" -type f -print -quit 2>/dev/null | grep -q .; then
      return 0
    fi
    while IFS= read -r f; do
      [[ -n "${f}" ]] || continue
      if foundation_keep_vault_up_sql_has_people "${f}"; then
        return 0
      fi
    done < <(find "${other}" -type f -name '*.sql' 2>/dev/null | LC_ALL=C sort)
  done < <(find "${parent}" -mindepth 2 -maxdepth 3 -type f -path '*/postgres/PG_VERSION' 2>/dev/null | LC_ALL=C sort)
  return 1
}

foundation_keep_vault_up_nearby_has_people() {
  local data_dir="$1"
  local backup_root="$2"
  if foundation_keep_vault_up_backup_has_people "${backup_root}"; then
    return 0
  fi
  foundation_keep_vault_up_second_tree_has_people "${data_dir}"
}

# Live blob files. Same rule as a second tree: files in blobs/, not
# an empty blobs/ folder.
foundation_keep_vault_up_live_has_blobs() {
  local data_dir="${1%/}"
  local found=""
  [[ -d "${data_dir}/blobs" ]] || return 1
  found="$(find "${data_dir}/blobs" -type f -print -quit 2>/dev/null || true)"
  [[ -n "${found}" ]]
}

# Real cluster: PG_VERSION plus postgres/base with entries. A lone
# version file (first-day-empty leftover) is not a real tree.
foundation_keep_vault_up_live_has_real_postgres_tree() {
  local postgres="${1%/}/postgres"
  local found=""
  [[ -e "${postgres}/PG_VERSION" && -d "${postgres}/base" ]] || return 1
  found="$(find "${postgres}/base" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)"
  [[ -n "${found}" ]]
}

# Without psql: empty when there are no live blobs and either no
# postgres/ (first-day) or only a first-day-empty cluster (PG_VERSION,
# no real base/). Blobs or a real postgres tree are not empty.
foundation_keep_vault_up_live_looks_empty_without_psql() {
  local data_dir="${1%/}"
  if foundation_keep_vault_up_live_has_blobs "${data_dir}"; then
    return 1
  fi
  if foundation_keep_vault_up_may_init "${data_dir}"; then
    return 0
  fi
  if foundation_keep_vault_up_live_has_real_postgres_tree "${data_dir}"; then
    return 1
  fi
  return 0
}

# Numeric 0 is empty. A failed count is not empty unless live looks
# empty without psql. Nearby people then refuse. Do not start. Do not
# initdb. A stopped real vault must start.
foundation_keep_vault_up_live_is_empty() {
  local repo_root="$1"
  local data_dir="$2"
  local count
  count="$(foundation_keep_vault_up_live_user_record_count "${repo_root}" || true)"
  count="${count//[$' \t\n\r']/}"
  if [[ "${count}" =~ ^[0-9]+$ ]]; then
    if [[ "${count}" == "0" ]]; then
      return 0
    fi
    return 1
  fi
  foundation_keep_vault_up_live_looks_empty_without_psql "${data_dir}"
}

foundation_keep_vault_up_refuse_empty_next_to_real() {
  local repo_root="$1"
  local data_dir="$2"
  local backup_root="$3"
  if ! foundation_keep_vault_up_live_is_empty "${repo_root}" "${data_dir}"; then
    return 0
  fi
  if foundation_keep_vault_up_nearby_has_people "${data_dir}" "${backup_root}"; then
    foundation_keep_vault_up_nag "the live vault has no user records, but a backup or another postgres tree nearby has people. This looks like an empty cluster next to a real one."
    return 1
  fi
  return 0
}

# Data folder missing: refuse. Do not mkdir.
foundation_keep_vault_up_refuse_missing_folder() {
  local data_dir="$1"
  if [[ ! -d "${data_dir}" ]]; then
    foundation_keep_vault_up_nag "data dir is missing. Do not create an empty cluster over a miss."
    return 1
  fi
  return 0
}

# postgres/ without PG_VERSION is a miss. Do not mkdir.
foundation_keep_vault_up_refuse_miss() {
  local data_dir="$1"
  local postgres="${data_dir%/}/postgres"
  local pg_version="${postgres}/PG_VERSION"

  if [[ -e "${postgres}" && ! -e "${pg_version}" ]]; then
    foundation_keep_vault_up_nag "Postgres files are missing from the data dir (no PG_VERSION). Do not create an empty cluster over that miss."
    return 1
  fi
  return 0
}

# Empty first-day folder (exists, no postgres tree) may init.
foundation_keep_vault_up_may_init() {
  local data_dir="$1"
  local postgres="${data_dir%/}/postgres"
  [[ -d "${data_dir}" && ! -e "${postgres}" ]]
}

foundation_keep_vault_up_pg_running() {
  local postgres="$1"
  command -v pg_ctl >/dev/null 2>&1 || return 1
  [[ -d "${postgres}" ]] || return 1
  pg_ctl -D "${postgres}" status >/dev/null 2>&1
}

# First-day init into the data folder's postgres tree. Does not mkdir
# the data folder itself. Does not init over a miss. Role and database
# from DATABASE_URL are created after Postgres is up (initdb alone
# only makes a cluster for the OS user).
foundation_keep_vault_up_init_postgres() {
  local data_dir="$1"
  local postgres="${data_dir%/}/postgres"
  if ! command -v initdb >/dev/null 2>&1; then
    foundation_keep_vault_up_nag "Postgres 16 is not on PATH (initdb). The package name is unknown in this repo."
    return 1
  fi
  initdb -D "${postgres}" --no-instructions >/dev/null
}

# SQL for the DATABASE_URL role/database. kind is role|exists|createdb.
foundation_keep_vault_up_app_role_sql() {
  local url="$1"
  local kind="$2"
  python3 -c '
from urllib.parse import urlparse, unquote
import sys

def ident(s):
    return "\"" + s.replace("\"", "\"\"") + "\""

def literal(s):
    q = chr(39)
    return q + s.replace(q, q + q) + q

u = urlparse(sys.argv[1])
user = unquote(u.username or "foundation")
password = unquote(u.password or "foundation")
database = unquote((u.path or "").lstrip("/") or "foundation")
database = database.split("?", 1)[0].split("/", 1)[0] or "foundation"
kind = sys.argv[2]
if kind == "role":
    tag = "do"
    n = 0
    while ("$" + tag + "$") in user or ("$" + tag + "$") in password:
        n += 1
        tag = "do%s" % n
    print("DO $%s$" % tag)
    print("BEGIN")
    print("  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = %s) THEN" % literal(user))
    print("    CREATE ROLE %s LOGIN SUPERUSER PASSWORD %s;" % (ident(user), literal(password)))
    print("  ELSE")
    print("    ALTER ROLE %s WITH LOGIN SUPERUSER PASSWORD %s;" % (ident(user), literal(password)))
    print("  END IF;")
    print("END")
    print("$%s$;" % tag)
elif kind == "exists":
    print("SELECT 1 FROM pg_database WHERE datname = %s" % literal(database))
elif kind == "createdb":
    print("CREATE DATABASE %s OWNER %s;" % (ident(database), ident(user)))
' "${url}" "${kind}"
}

# Local socket into this cluster (OS superuser from initdb). Not DATABASE_URL.
foundation_keep_vault_up_psql_local() {
  local postgres="$1"
  shift
  local pid_file="${postgres}/postmaster.pid"
  local socket_dir="" port=""
  if [[ -f "${pid_file}" ]]; then
    port="$(sed -n '4p' "${pid_file}" | tr -d '[:space:]')"
    socket_dir="$(sed -n '5p' "${pid_file}" | tr -d '[:space:]')"
  fi
  if [[ -n "${socket_dir}" && -n "${port}" ]]; then
    psql -h "${socket_dir}" -p "${port}" -d postgres -v ON_ERROR_STOP=1 "$@"
  else
    psql -d postgres -p "${port:-5432}" -v ON_ERROR_STOP=1 "$@"
  fi
}

# App URL already works, or create that role/database in this cluster.
foundation_keep_vault_up_ensure_app_database() {
  local repo_root="$1"
  local data_dir="$2"
  local postgres="${data_dir%/}/postgres"
  local url role_sql exists_sql create_sql exists

  url="$(foundation_keep_vault_up_database_url "${repo_root}")"
  if ! command -v psql >/dev/null 2>&1; then
    foundation_keep_vault_up_nag "psql is not on PATH. Cannot create the app database role."
    return 1
  fi
  if psql "${url}" -tAc "SELECT 1" >/dev/null 2>&1; then
    return 0
  fi
  role_sql="$(foundation_keep_vault_up_app_role_sql "${url}" role)" || return 1
  exists_sql="$(foundation_keep_vault_up_app_role_sql "${url}" exists)" || return 1
  create_sql="$(foundation_keep_vault_up_app_role_sql "${url}" createdb)" || return 1
  if ! foundation_keep_vault_up_psql_local "${postgres}" -c "${role_sql}"; then
    foundation_keep_vault_up_nag "start failed. Could not create the app database role."
    return 1
  fi
  exists="$(foundation_keep_vault_up_psql_local "${postgres}" -tAc "${exists_sql}" | tr -d '[:space:]')"
  if [[ "${exists}" != "1" ]]; then
    if ! foundation_keep_vault_up_psql_local "${postgres}" -c "${create_sql}"; then
      foundation_keep_vault_up_nag "start failed. Could not create the app database."
      return 1
    fi
  fi
  return 0
}

# Start the live cluster. Quiet so a healed run writes nothing.
foundation_keep_vault_up_start_postgres() {
  local data_dir="$1"
  local postgres="${data_dir%/}/postgres"
  local logfile="${postgres}/pg.log"

  if ! command -v pg_ctl >/dev/null 2>&1; then
    foundation_keep_vault_up_nag "Postgres 16 is not on PATH (pg_ctl). The package name is unknown in this repo."
    return 1
  fi
  if foundation_keep_vault_up_pg_running "${postgres}"; then
    return 0
  fi
  mkdir -p -- "$(dirname -- "${logfile}")"
  pg_ctl -D "${postgres}" -l "${logfile}" -o "-h 127.0.0.1 -p 5432" start >/dev/null 2>&1
}

foundation_keep_vault_up_app_pid_file() {
  local data_dir="${1%/}"
  printf '%s/app.pid\n' "${data_dir}"
}

# Official app start: pnpm start (wait db, migrate, seed). Background.
# Quiet so a healed run writes nothing.
foundation_keep_vault_up_start_app() {
  local repo_root="$1"
  local data_dir="$2"
  local pid_file log_file
  pid_file="$(foundation_keep_vault_up_app_pid_file "${data_dir}")"
  log_file="${data_dir%/}/app.log"

  if [[ -f "${pid_file}" ]]; then
    if kill -0 "$(cat "${pid_file}")" 2>/dev/null; then
      return 0
    fi
    rm -f -- "${pid_file}"
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    foundation_keep_vault_up_nag "pnpm is not on PATH. Node 22 + pnpm are required to start the app."
    return 1
  fi
  (
    set -m
    cd "${repo_root}" || exit 1
    nohup pnpm start >>"${log_file}" 2>&1 &
    echo $! >"${pid_file}"
  ) >/dev/null 2>&1
}

# About one minute: 12 tries, 5 seconds apart.
foundation_keep_vault_up_wait_health() {
  local i
  local tries="${FOUNDATION_KEEP_VAULT_UP_TRIES:-12}"
  local pause="${FOUNDATION_KEEP_VAULT_UP_SLEEP:-5}"
  i=0
  while ((i < tries)); do
    if foundation_keep_vault_up_health_ok; then
      return 0
    fi
    sleep "${pause}"
    i=$((i + 1))
  done
  return 1
}

# Live user records only (nodes, not seed types). Localhost psql.
foundation_keep_vault_up_live_user_record_count() {
  local repo_root="$1"
  local url
  url="$(foundation_keep_vault_up_database_url "${repo_root}")"
  if ! command -v psql >/dev/null 2>&1; then
    return 1
  fi
  psql "${url}" -tAc "SELECT COUNT(*) FROM nodes WHERE deleted_at IS NULL" 2>/dev/null
}

# After a start (or when /health is already green): existing data dir
# must have the live Postgres files. First-day 0 user records is
# healthy. Numeric 0 next to people nags empty-next-to-real; do not
# stay quiet. A failed count here may nag could-not-count; it must
# not refuse start. /health green is not enough. Does not mkdir.
foundation_keep_vault_up_cluster_ok() {
  local repo_root="$1"
  local data_dir="$2"
  local backup_root="$3"
  local postgres="${data_dir%/}/postgres"
  local pg_version="${postgres}/PG_VERSION"
  local count

  if [[ -e "${postgres}" && ! -e "${pg_version}" ]]; then
    foundation_keep_vault_up_nag "Postgres files are missing from the data dir (no PG_VERSION). Do not create an empty cluster over that miss."
    return 1
  fi
  if [[ ! -e "${pg_version}" ]]; then
    foundation_keep_vault_up_nag "Postgres files are missing from the data dir (no PG_VERSION). Do not create an empty cluster over that miss."
    return 1
  fi

  count="$(foundation_keep_vault_up_live_user_record_count "${repo_root}" || true)"
  count="$(printf '%s' "${count}" | tr -d '[:space:]')"
  if [[ ! "${count}" =~ ^[0-9]+$ ]]; then
    foundation_keep_vault_up_nag "could not count records in the live cluster."
    return 1
  fi
  if [[ "${count}" == "0" ]] && foundation_keep_vault_up_nearby_has_people "${data_dir}" "${backup_root}"; then
    foundation_keep_vault_up_nag "the live vault has no user records, but a backup or another postgres tree nearby has people. This looks like an empty cluster next to a real one."
    return 1
  fi
  return 0
}

# Start Postgres then the app once. Not a rebuild. Quiet when it works.
foundation_keep_vault_up_start() {
  local repo_root="$1"
  local data_dir="$2"
  local postgres="${data_dir%/}/postgres"

  if foundation_keep_vault_up_may_init "${data_dir}"; then
    if ! foundation_keep_vault_up_init_postgres "${data_dir}"; then
      return 1
    fi
  fi

  if ! foundation_keep_vault_up_start_postgres "${data_dir}"; then
    foundation_keep_vault_up_nag "start failed. Postgres did not start from the data dir."
    return 1
  fi

  if ! foundation_keep_vault_up_ensure_app_database "${repo_root}" "${data_dir}"; then
    return 1
  fi

  if ! foundation_keep_vault_up_start_app "${repo_root}" "${data_dir}"; then
    foundation_keep_vault_up_nag "start failed. The app did not start (pnpm start)."
    return 1
  fi
  return 0
}

# Kill a pid and its descendants. A later stop cannot wait(1) a pid
# from the start invocation.
foundation_keep_vault_up_stop_pid_tree() {
  local pid="$1"
  local sig="${2:-TERM}"
  local child
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 0
  kill -0 "${pid}" 2>/dev/null || return 0
  while IFS= read -r child; do
    [[ -n "${child}" ]] || continue
    foundation_keep_vault_up_stop_pid_tree "${child}" "${sig}"
  done < <(pgrep -P "${pid}" 2>/dev/null || true)
  kill "-${sig}" "${pid}" 2>/dev/null || true
}

# Stop the app, then Postgres. Does not delete the data folder.
# Kills the pnpm wrapper and the Node listener (process group + tree).
# Does not wait(1) a pid from another process.
foundation_keep_vault_up_stop() {
  local repo_root data_dir postgres pid_file pid i
  repo_root="$(foundation_keep_vault_up_repo_root)"
  data_dir="$(foundation_keep_vault_up_data_dir "${repo_root}")"
  postgres="${data_dir%/}/postgres"
  pid_file="$(foundation_keep_vault_up_app_pid_file "${data_dir}")"

  if [[ -f "${pid_file}" ]]; then
    pid="$(tr -d '[:space:]' <"${pid_file}")"
    if [[ "${pid}" =~ ^[0-9]+$ ]] && kill -0 "${pid}" 2>/dev/null; then
      kill -- "-${pid}" 2>/dev/null || true
      foundation_keep_vault_up_stop_pid_tree "${pid}" TERM
      i=0
      while ((i < 5)) && kill -0 "${pid}" 2>/dev/null; do
        sleep 1
        i=$((i + 1))
      done
      if kill -0 "${pid}" 2>/dev/null; then
        kill -9 -- "-${pid}" 2>/dev/null || true
        foundation_keep_vault_up_stop_pid_tree "${pid}" KILL
      fi
    fi
    rm -f -- "${pid_file}"
  fi
  if command -v pg_ctl >/dev/null 2>&1 && [[ -d "${postgres}" ]]; then
    pg_ctl -D "${postgres}" stop -m fast >/dev/null 2>&1 || true
  fi
  return 0
}

foundation_keep_vault_up_main() {
  local repo_root data_dir backup_root

  repo_root="$(foundation_keep_vault_up_repo_root)"
  data_dir="$(foundation_keep_vault_up_data_dir "${repo_root}")"
  backup_root="$(foundation_keep_vault_up_backup_root "${data_dir}")"

  if ! foundation_keep_vault_up_refuse_missing_folder "${data_dir}"; then
    return 1
  fi
  if ! foundation_keep_vault_up_refuse_miss "${data_dir}"; then
    return 1
  fi
  if ! foundation_keep_vault_up_refuse_empty_next_to_real "${repo_root}" "${data_dir}" "${backup_root}"; then
    return 1
  fi

  if foundation_keep_vault_up_health_ok; then
    foundation_keep_vault_up_cluster_ok "${repo_root}" "${data_dir}" "${backup_root}"
    return $?
  fi

  if ! foundation_keep_vault_up_start "${repo_root}" "${data_dir}"; then
    return 1
  fi

  if ! foundation_keep_vault_up_wait_health; then
    foundation_keep_vault_up_nag "start ran once and /health still failed. Start Postgres, then from the clone: pnpm start"
    return 1
  fi

  foundation_keep_vault_up_cluster_ok "${repo_root}" "${data_dir}" "${backup_root}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if [[ "${1:-}" == "stop" ]]; then
    foundation_keep_vault_up_stop
  else
    foundation_keep_vault_up_main "$@"
  fi
fi
