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
#   DATABASE_URL          — required. Environment, else the clone .env.
#                           Missing or published values are minted into .env.
#
# Starts Postgres 16 (the data folder's postgres tree) and the app
# (`pnpm start`) when /health is down. Postgres listens on
# 127.0.0.1:5432 and a unix socket under the data folder (pg-sock),
# not /var/run/postgresql. First-day 0 user records is
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
# Refuses start while .restore-lock is live or .restore-failed is present.
set -euo pipefail

# Published strings from .env.example. A running vault must not keep these.
FOUNDATION_PUBLISHED_API_KEY="change-me-to-a-long-random-string"
FOUNDATION_PUBLISHED_DB_PASSWORD="change-me-to-a-password"
FOUNDATION_MIN_KEY_LENGTH=32
FOUNDATION_KEEP_VAULT_UP_ENV_CHANGED=0

# Names loadConfig reads. env -i forwards these plus PATH/HOME/TMPDIR/LANG/LC_ALL/USER.
FOUNDATION_KEEP_VAULT_UP_ENV_NAMES=(
  FOUNDATION_API_KEY
  FOUNDATION_API_KEY_LABEL
  FOUNDATION_VIEW_KEY
  DATABASE_URL
  FOUNDATION_DATA
  PORT
  HOST
  VIEW_PORT
  VIEW_HOST
  FOUNDATION_ALLOWED_HOSTS
  VIEW_PUBLIC_ORIGIN
  FOUNDATION_ALLOW_CLEARTEXT
  FOUNDATION_LEASE_TTL_SECONDS
)

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

foundation_keep_vault_up_key_needs_mint() {
  local value="$1"
  [[ -z "${value}" || "${value}" == "${FOUNDATION_PUBLISHED_API_KEY}" || "${#value}" -lt "${FOUNDATION_MIN_KEY_LENGTH}" ]]
}

foundation_keep_vault_up_mint_secret() {
  if ! command -v openssl >/dev/null 2>&1; then
    foundation_keep_vault_up_nag "openssl is not on PATH. Cannot mint a vault secret."
    return 1
  fi
  openssl rand -hex 32
}

# Write KEY=value into .env without printing the value. Value arrives on stdin.
foundation_keep_vault_up_upsert_env() {
  local dest="$1"
  local key="$2"
  python3 -c '
import pathlib, sys
dest = pathlib.Path(sys.argv[1])
key = sys.argv[2]
value = sys.stdin.read().rstrip("\n")
lines = dest.read_text().splitlines() if dest.exists() else []
prefix = key + "="
out = []
found = False
for line in lines:
    raw = line.strip()
    if raw.startswith(prefix):
        out.append(prefix + value)
        found = True
        continue
    out.append(line)
if not found:
    out.append(prefix + value)
dest.write_text(("\n".join(out) + "\n") if out else prefix + value + "\n")
' "${dest}" "${key}"
  chmod 600 -- "${dest}"
}

foundation_keep_vault_up_url_password() {
  python3 -c '
from urllib.parse import urlparse, unquote
import sys
raw = sys.stdin.read().strip()
if not raw:
    raise SystemExit(0)
u = urlparse(raw)
if u.password:
    sys.stdout.write(unquote(u.password))
'
}

foundation_keep_vault_up_rewrite_url_password() {
  python3 -c '
from urllib.parse import urlparse, quote, unquote
import sys
raw = sys.stdin.readline().rstrip("\n")
password = sys.stdin.read().rstrip("\n")
u = urlparse(raw)
user = unquote(u.username or "foundation")
host = u.hostname or "127.0.0.1"
port = u.port or 5432
database = unquote((u.path or "").lstrip("/") or "foundation").split("?", 1)[0] or "foundation"
auth = "%s:%s" % (quote(user, safe=""), quote(password, safe=""))
sys.stdout.write("%s://%s@%s:%s/%s" % (u.scheme or "postgres", auth, host, port, database))
'
}

# Mint missing, published, or short door keys and a published database password.
# Quiet. Writes .env mode 600. Does not print a secret.
foundation_keep_vault_up_ensure_env_secrets() {
  local repo_root="$1"
  local env_file="${repo_root}/.env"
  local api view url password minted
  FOUNDATION_KEEP_VAULT_UP_ENV_CHANGED=0

  api="$(foundation_keep_vault_up_env_value "${repo_root}" FOUNDATION_API_KEY)"
  view="$(foundation_keep_vault_up_env_value "${repo_root}" FOUNDATION_VIEW_KEY)"
  url="$(foundation_keep_vault_up_env_value "${repo_root}" DATABASE_URL)"

  if foundation_keep_vault_up_key_needs_mint "${api}"; then
    api="$(foundation_keep_vault_up_mint_secret)" || return 1
    printf '%s\n' "${api}" | foundation_keep_vault_up_upsert_env "${env_file}" FOUNDATION_API_KEY
    export FOUNDATION_API_KEY="${api}"
    FOUNDATION_KEEP_VAULT_UP_ENV_CHANGED=1
  fi

  if foundation_keep_vault_up_key_needs_mint "${view}"; then
    view="$(foundation_keep_vault_up_mint_secret)" || return 1
    while [[ "${view}" == "${api}" ]]; do
      view="$(foundation_keep_vault_up_mint_secret)" || return 1
    done
    printf '%s\n' "${view}" | foundation_keep_vault_up_upsert_env "${env_file}" FOUNDATION_VIEW_KEY
    export FOUNDATION_VIEW_KEY="${view}"
    FOUNDATION_KEEP_VAULT_UP_ENV_CHANGED=1
  fi

  password="$(printf '%s\n' "${url}" | foundation_keep_vault_up_url_password)"
  if [[ -z "${url}" || -z "${password}" || "${password}" == "${FOUNDATION_PUBLISHED_DB_PASSWORD}" ]]; then
    minted="$(foundation_keep_vault_up_mint_secret)" || return 1
    if [[ -z "${url}" ]]; then
      url="postgres://foundation:x@127.0.0.1:5432/foundation"
    fi
    url="$(printf '%s\n%s\n' "${url}" "${minted}" | foundation_keep_vault_up_rewrite_url_password)"
    printf '%s\n' "${url}" | foundation_keep_vault_up_upsert_env "${env_file}" DATABASE_URL
    export DATABASE_URL="${url}"
    FOUNDATION_KEEP_VAULT_UP_ENV_CHANGED=1
  fi

  if [[ -f "${env_file}" ]]; then
    chmod 600 -- "${env_file}"
  fi
  return 0
}

foundation_keep_vault_up_write_url_file() {
  local repo_root="$1"
  local dest="$2"
  umask 077
  foundation_keep_vault_up_env_value "${repo_root}" DATABASE_URL >"${dest}"
  chmod 600 -- "${dest}"
}

# Parse a mode-600 URL file into host, port, user, database (tab-separated). Password stays out.
foundation_keep_vault_up_url_fields() {
  python3 -c '
from urllib.parse import urlparse, unquote
import pathlib, sys
u = urlparse(pathlib.Path(sys.argv[1]).read_text().strip())
database = unquote((u.path or "").lstrip("/") or "foundation")
database = database.split("?", 1)[0].split("/", 1)[0] or "foundation"
sys.stdout.write("\t".join([
    u.hostname or "127.0.0.1",
    str(u.port or 5432),
    unquote(u.username or "foundation"),
    database,
]))
' "$1"
}

foundation_keep_vault_up_url_password_file() {
  python3 -c '
from urllib.parse import urlparse, unquote
import pathlib, sys
u = urlparse(pathlib.Path(sys.argv[1]).read_text().strip())
if not u.password:
    sys.stderr.write("DATABASE_URL has no password. Copy .env.example to .env and fill it.\n")
    raise SystemExit(1)
sys.stdout.write(unquote(u.password))
' "$1"
}

# App psql using discrete args. URL stays in a mode-600 file, not argv.
foundation_keep_vault_up_psql_app() {
  local url_file="$1"
  shift
  local fields host port user database password
  fields="$(foundation_keep_vault_up_url_fields "${url_file}")" || return 1
  IFS=$'\t' read -r host port user database <<<"${fields}"
  password="$(foundation_keep_vault_up_url_password_file "${url_file}")" || return 1
  PGPASSWORD="${password}" psql -h "${host}" -p "${port}" -U "${user}" -d "${database}" -v ON_ERROR_STOP=1 "$@"
}

foundation_keep_vault_up_hba_has_trust() {
  local hba="$1"
  python3 -c '
import pathlib, re, sys
text = pathlib.Path(sys.argv[1]).read_text() if pathlib.Path(sys.argv[1]).exists() else ""
for line in text.splitlines():
    raw = line.split("#", 1)[0]
    if re.match(r"^\s*(local|host)\b", raw) and re.search(r"\btrust\b", raw):
        raise SystemExit(0)
raise SystemExit(1)
' "${hba}"
}

# Rewrite every uncommented trust line, including replication. Exit 0 when the file changed.
foundation_keep_vault_up_rewrite_hba() {
  local hba="$1"
  python3 -c '
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
changed = False
out = []
for line in path.read_text().splitlines(True):
    raw = line.split("#", 1)[0]
    if re.match(r"^\s*local\b", raw) and re.search(r"\btrust\b", raw):
        line = re.sub(r"\btrust\b", "peer", line, count=1)
        changed = True
    elif re.match(r"^\s*host\b", raw) and re.search(r"\btrust\b", raw):
        line = re.sub(r"\btrust\b", "scram-sha-256", line, count=1)
        changed = True
    out.append(line)
if changed:
    path.write_text("".join(out))
    raise SystemExit(0)
raise SystemExit(1)
' "${hba}"
}

foundation_keep_vault_up_listen_pinned() {
  local conf="$1"
  python3 -c '
import pathlib, re, sys
text = pathlib.Path(sys.argv[1]).read_text() if pathlib.Path(sys.argv[1]).exists() else ""
raise SystemExit(0 if re.search(r"(?m)^\s*listen_addresses\s*=\s*'\''127\.0\.0\.1'\''", text) else 1)
' "${conf}"
}

foundation_keep_vault_up_pin_listen() {
  local conf="$1"
  python3 -c '
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text() if path.exists() else ""
wanted = "listen_addresses = '\''127.0.0.1'\''"
if re.search(r"(?m)^\s*listen_addresses\s*=\s*'\''127\.0\.0\.1'\''", text):
    raise SystemExit(1)
new, n = re.subn(r"(?m)^\s*#?\s*listen_addresses\s*=.*$", wanted, text, count=1)
if n == 0:
    new = text.rstrip() + "\n" + wanted + "\n"
path.write_text(new)
' "${conf}"
}

foundation_keep_vault_up_is_loopback_bind() {
  local host="$1"
  [[ -z "${host}" ]] && return 0
  host="${host,,}"
  [[ "${host}" == "localhost" || "${host}" == "127.0.0.1" || "${host}" == "::1" || "${host}" == "[::1]" ]] && return 0
  [[ "${host}" =~ ^127\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# Refuse a bind beyond this machine unless the tunnel Host is named.
foundation_keep_vault_up_bind_ok() {
  local repo_root="$1"
  local host view_host origin clear names
  host="$(foundation_keep_vault_up_env_value "${repo_root}" HOST)"
  view_host="$(foundation_keep_vault_up_env_value "${repo_root}" VIEW_HOST)"
  origin="$(foundation_keep_vault_up_env_value "${repo_root}" VIEW_PUBLIC_ORIGIN)"
  clear="$(foundation_keep_vault_up_env_value "${repo_root}" FOUNDATION_ALLOW_CLEARTEXT)"
  host="${host:-127.0.0.1}"
  view_host="${view_host:-127.0.0.1}"
  names=""
  if ! foundation_keep_vault_up_is_loopback_bind "${host}"; then
    names="HOST=${host}"
  fi
  if ! foundation_keep_vault_up_is_loopback_bind "${view_host}"; then
    if [[ -n "${names}" ]]; then
      names="${names} and VIEW_HOST=${view_host}"
    else
      names="VIEW_HOST=${view_host}"
    fi
  fi
  if [[ -z "${names}" ]]; then
    return 0
  fi
  if [[ -z "${origin}" ]]; then
    foundation_keep_vault_up_nag "${names} listens beyond this machine. Set VIEW_PUBLIC_ORIGIN to the origin the browser opens."
    return 1
  fi
  if [[ "${origin}" != https://* ]] && [[ "${clear}" != "1" && "${clear}" != "true" && "${clear}" != "yes" ]]; then
    foundation_keep_vault_up_nag "${names} listens beyond this machine on plain http. Serve VIEW_PUBLIC_ORIGIN over https, or set FOUNDATION_ALLOW_CLEARTEXT=1."
    return 1
  fi
  return 0
}

foundation_keep_vault_up_write_allowlist() {
  local repo_root="$1"
  local dest="$2"
  python3 -c '
import os, pathlib, shlex, sys
repo = pathlib.Path(sys.argv[1])
dest = pathlib.Path(sys.argv[2])
names = sys.argv[3].split(",")
lines = []
for name in ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "USER"]:
    value = os.environ.get(name, "")
    if value:
        lines.append("%s=%s" % (name, shlex.quote(value)))
env_text = repo.joinpath(".env").read_text() if repo.joinpath(".env").exists() else ""
for name in names:
    value = os.environ.get(name, "")
    if not value:
        for line in env_text.splitlines():
            raw = line.strip()
            if raw.startswith(name + "="):
                value = raw[len(name) + 1:]
                if len(value) >= 2 and value[0] == value[-1] == "\"":
                    value = value[1:-1]
                break
    if value:
        lines.append("%s=%s" % (name, shlex.quote(value)))
dest.write_text("\n".join(lines) + ("\n" if lines else ""))
' "${repo_root}" "${dest}" "$(IFS=','; echo "${FOUNDATION_KEEP_VAULT_UP_ENV_NAMES[*]}")"
  chmod 600 -- "${dest}"
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
  if [[ -z "${raw}" ]]; then
    foundation_keep_vault_up_nag "DATABASE_URL is unset. Copy .env.example to .env and fill it."
    return 1
  fi
  printf '%s\n' "${raw}"
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

foundation_keep_vault_up_manifest_has_people() {
  local backup_root="$1"
  local manifest="${backup_root%/}/MANIFEST"
  local raw=""
  local line

  if [[ ! -f "${manifest}" || ! -r "${manifest}" ]]; then
    return 0
  fi
  line="$(grep -E '^[[:space:]]*has_people=' "${manifest}" | tail -n 1 || true)"
  raw="${line#*has_people=}"
  raw="${raw%$'\r'}"
  if [[ "${raw}" == "no" ]]; then
    return 1
  fi
  return 0
}

# Backup dumps under BACKUP_ROOT (and default sibling) that have people.
foundation_keep_vault_up_backup_has_people() {
  local backup_root="$1"
  local f
  local age_dump=""
  [[ -d "${backup_root}" ]] || return 1
  while IFS= read -r f; do
    [[ -n "${f}" ]] || continue
    if foundation_keep_vault_up_sql_has_people "${f}"; then
      return 0
    fi
  done < <(find "${backup_root}" -type f \( -name 'foundation-*.sql' -o -name '*.sql' \) ! -name '*.age' 2>/dev/null | LC_ALL=C sort)

  while IFS= read -r f; do
    [[ -n "${f}" ]] || continue
    age_dump="${f}"
    break
  done < <(find "${backup_root}" -type f -name 'foundation-*.sql.age' 2>/dev/null | LC_ALL=C sort)
  if [[ -z "${age_dump}" ]]; then
    return 1
  fi
  foundation_keep_vault_up_manifest_has_people "${backup_root}"
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
  initdb -D "${postgres}" --auth-local=peer --auth-host=scram-sha-256 --no-instructions >/dev/null
}

# SQL for the DATABASE_URL role/database. kind is role|exists|createdb|user.
# URL arrives on stdin, never argv.
foundation_keep_vault_up_app_role_sql() {
  local kind="$1"
  python3 -c '
from urllib.parse import urlparse, unquote
import sys

def ident(s):
    return "\"" + s.replace("\"", "\"\"") + "\""

def literal(s):
    q = chr(39)
    return q + s.replace(q, q + q) + q

u = urlparse(sys.stdin.read().strip())
user = unquote(u.username or "foundation")
if not u.password:
    sys.stderr.write("DATABASE_URL has no password. Copy .env.example to .env and fill it.\n")
    sys.exit(1)
password = unquote(u.password)
database = unquote((u.path or "").lstrip("/") or "foundation")
database = database.split("?", 1)[0].split("/", 1)[0] or "foundation"
kind = sys.argv[1]
if kind == "user":
    print(user)
elif kind == "role":
    tag = "do"
    n = 0
    while ("$" + tag + "$") in user or ("$" + tag + "$") in password:
        n += 1
        tag = "do%s" % n
    print("DO $%s$" % tag)
    print("BEGIN")
    print("  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = %s) THEN" % literal(user))
    print("    CREATE ROLE %s LOGIN PASSWORD %s;" % (ident(user), literal(password)))
    print("  ELSE")
    print("    ALTER ROLE %s WITH LOGIN PASSWORD %s;" % (ident(user), literal(password)))
    print("  END IF;")
    print("END")
    print("$%s$;" % tag)
elif kind == "exists":
    print("SELECT 1 FROM pg_database WHERE datname = %s" % literal(database))
elif kind == "createdb":
    print("CREATE DATABASE %s OWNER %s;" % (ident(database), ident(user)))
' "${kind}"
}

# Unix socket directory for this vault. Under the data folder, not
# PGDATA and not /var/run/postgresql.
foundation_keep_vault_up_socket_dir() {
  local data_dir="${1%/}"
  printf '%s/pg-sock\n' "${data_dir}"
}

# Single-quote for the shell pg_ctl uses when it applies -o.
foundation_keep_vault_up_shell_quote() {
  local s="$1"
  printf "'%s'" "${s//\'/\'\\\'\'}"
}

# -k must stay one directory after pg_ctl feeds -o through a shell.
foundation_keep_vault_up_postgres_listen_args() {
  local socket_dir="$1"
  printf '%s\n' "-h 127.0.0.1 -p 5432 -k $(foundation_keep_vault_up_shell_quote "${socket_dir}")"
}

# Local socket into this cluster (OS superuser from initdb). Not DATABASE_URL.
# Optional: --dbname NAME before psql args. Refuses when this data dir is
# not the running cluster. Never a default libpq socket.
foundation_keep_vault_up_psql_local() {
  local postgres="$1"
  shift
  local pid_file="${postgres}/postmaster.pid"
  local data_dir socket_dir port="5432" db="postgres" socket pid_port pid_sock
  if [[ "${1:-}" == "--dbname" ]]; then
    db="$2"
    shift 2
  fi
  if ! foundation_keep_vault_up_pg_running "${postgres}"; then
    return 1
  fi
  data_dir="$(dirname -- "${postgres}")"
  socket_dir="$(foundation_keep_vault_up_socket_dir "${data_dir}")"
  if [[ -f "${pid_file}" ]]; then
    pid_port="$(sed -n '4p' "${pid_file}" | tr -d '[:space:]')"
    pid_sock="$(sed -n '5p' "${pid_file}" | tr -d '[:space:]')"
    if [[ -n "${pid_port}" ]]; then
      port="${pid_port}"
    fi
    if [[ -n "${pid_sock}" ]]; then
      socket_dir="${pid_sock}"
    fi
  fi
  if [[ -z "${socket_dir}" || -z "${port}" ]]; then
    return 1
  fi
  socket="${socket_dir}/.s.PGSQL.${port}"
  if [[ ! -S "${socket}" ]]; then
    return 1
  fi
  psql -q -h "${socket_dir}" -p "${port}" -d "${db}" -v ON_ERROR_STOP=1 "$@"
}

foundation_keep_vault_up_reload_postgres() {
  local postgres="$1"
  if foundation_keep_vault_up_pg_running "${postgres}"; then
    pg_ctl -D "${postgres}" reload >/dev/null 2>&1 || true
  fi
}

# Rewrite leftover trust and pin listen only when those files still need it.
foundation_keep_vault_up_harden_cluster_files() {
  local data_dir="$1"
  local postgres="${data_dir%/}/postgres"
  local hba="${postgres}/pg_hba.conf"
  local conf="${postgres}/postgresql.conf"
  local reload=0
  if foundation_keep_vault_up_hba_has_trust "${hba}"; then
    foundation_keep_vault_up_rewrite_hba "${hba}" || true
    reload=1
  fi
  if ! foundation_keep_vault_up_listen_pinned "${conf}"; then
    foundation_keep_vault_up_pin_listen "${conf}" || true
    reload=1
  fi
  if ((reload)); then
    foundation_keep_vault_up_reload_postgres "${postgres}"
  fi
}

# Create the app role without SUPERUSER, own the database, install extensions
# as the OS superuser, then drop SUPERUSER unless the URL user is the initdb role.
# Always ALTER ROLE password through the peer socket. A second healthy run
# skips file rewrites and NOSUPERUSER.
foundation_keep_vault_up_ensure_app_database() {
  local repo_root="$1"
  local data_dir="$2"
  local postgres="${data_dir%/}/postgres"
  local url_file role_sql exists_sql create_sql exists user os_user super fields database

  if ! command -v psql >/dev/null 2>&1; then
    foundation_keep_vault_up_nag "psql is not on PATH. Cannot create the app database role."
    return 1
  fi

  foundation_keep_vault_up_harden_cluster_files "${data_dir}"

  url_file="$(mktemp "${data_dir%/}/.database-url.XXXXXX")"
  chmod 600 -- "${url_file}"
  foundation_keep_vault_up_write_url_file "${repo_root}" "${url_file}"
  if [[ ! -s "${url_file}" ]]; then
    rm -f -- "${url_file}"
    foundation_keep_vault_up_nag "DATABASE_URL is unset. Copy .env.example to .env and fill it."
    return 1
  fi

  role_sql="$(foundation_keep_vault_up_app_role_sql role <"${url_file}")" || { rm -f -- "${url_file}"; return 1; }
  exists_sql="$(foundation_keep_vault_up_app_role_sql exists <"${url_file}")" || { rm -f -- "${url_file}"; return 1; }
  create_sql="$(foundation_keep_vault_up_app_role_sql createdb <"${url_file}")" || { rm -f -- "${url_file}"; return 1; }
  user="$(foundation_keep_vault_up_app_role_sql user <"${url_file}")" || { rm -f -- "${url_file}"; return 1; }
  fields="$(foundation_keep_vault_up_url_fields "${url_file}")" || { rm -f -- "${url_file}"; return 1; }
  IFS=$'\t' read -r _ _ _ database <<<"${fields}"
  os_user="$(id -un)"

  if ! foundation_keep_vault_up_psql_local "${postgres}" -c "${role_sql}"; then
    rm -f -- "${url_file}"
    foundation_keep_vault_up_nag "start failed. Could not create the app database role."
    return 1
  fi
  exists="$(foundation_keep_vault_up_psql_local "${postgres}" -tAc "${exists_sql}" | tr -d '[:space:]')"
  if [[ "${exists}" != "1" ]]; then
    if ! foundation_keep_vault_up_psql_local "${postgres}" -c "${create_sql}"; then
      rm -f -- "${url_file}"
      foundation_keep_vault_up_nag "start failed. Could not create the app database."
      return 1
    fi
  fi

  ext_ok="$(foundation_keep_vault_up_psql_local "${postgres}" --dbname "${database}" -tAc \
    "SELECT COUNT(*) FROM pg_extension WHERE extname IN ('vector','pgcrypto','unaccent','pg_trgm')" | tr -d '[:space:]')"
  if [[ "${ext_ok}" != "4" ]]; then
    if ! foundation_keep_vault_up_psql_local "${postgres}" --dbname "${database}" -c \
      "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null; then
      rm -f -- "${url_file}"
      foundation_keep_vault_up_nag "start failed. Could not create database extensions."
      return 1
    fi
  fi

  if [[ "${user}" != "${os_user}" ]]; then
    super="$(foundation_keep_vault_up_psql_local "${postgres}" -tAc "SELECT rolsuper FROM pg_roles WHERE rolname = '${user//\'/\'\'}'" | tr -d '[:space:]')"
    if [[ "${super}" == "t" ]]; then
      if ! foundation_keep_vault_up_psql_local "${postgres}" -c "ALTER ROLE \"${user//\"/\"\"}\" NOSUPERUSER NOCREATEDB NOCREATEROLE;"; then
        rm -f -- "${url_file}"
        foundation_keep_vault_up_nag "start failed. Could not drop app-role superuser."
        return 1
      fi
    fi
  fi

  rm -f -- "${url_file}"
  return 0
}

# Start the live cluster. Quiet so a healed run writes nothing.
# Socket lives under the data folder so a first-day vault can start
# without write access to /var/run/postgresql.
foundation_keep_vault_up_start_postgres() {
  local data_dir="$1"
  local postgres="${data_dir%/}/postgres"
  local logfile="${postgres}/pg.log"
  local socket_dir
  socket_dir="$(foundation_keep_vault_up_socket_dir "${data_dir}")"

  if ! command -v pg_ctl >/dev/null 2>&1; then
    foundation_keep_vault_up_nag "Postgres 16 is not on PATH (pg_ctl). The package name is unknown in this repo."
    return 1
  fi
  if foundation_keep_vault_up_pg_running "${postgres}"; then
    return 0
  fi
  mkdir -p -- "${socket_dir}"
  chmod 700 -- "${socket_dir}"
  mkdir -p -- "$(dirname -- "${logfile}")"
  pg_ctl -D "${postgres}" -l "${logfile}" -o "$(foundation_keep_vault_up_postgres_listen_args "${socket_dir}")" start >/dev/null 2>&1
}

foundation_keep_vault_up_app_pid_file() {
  local data_dir="${1%/}"
  printf '%s/app.pid\n' "${data_dir}"
}

# Official app start: pnpm start (wait db, migrate, seed). Background.
# Quiet so a healed run writes nothing. env -i plus the allowlist file
# (mode 600) so secrets never sit on argv.
foundation_keep_vault_up_start_app() {
  local repo_root="$1"
  local data_dir="$2"
  local pid_file log_file allowlist
  pid_file="$(foundation_keep_vault_up_app_pid_file "${data_dir}")"
  log_file="${data_dir%/}/app.log"
  allowlist="${data_dir%/}/.app-env"

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
  if ! foundation_keep_vault_up_bind_ok "${repo_root}"; then
    return 1
  fi
  foundation_keep_vault_up_write_allowlist "${repo_root}" "${allowlist}"
  (
    set -m
    cd "${repo_root}" || exit 1
    env -i bash -c '
      set -a
      # shellcheck disable=SC1090
      . "$1"
      set +a
      exec nohup pnpm start >>"$2" 2>&1
    ' _ "${allowlist}" "${log_file}" &
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
# URL stays in a mode-600 file, not argv.
foundation_keep_vault_up_live_user_record_count() {
  local repo_root="$1"
  local url_file count
  if ! command -v psql >/dev/null 2>&1; then
    return 1
  fi
  url_file="$(mktemp)"
  chmod 600 -- "${url_file}"
  foundation_keep_vault_up_write_url_file "${repo_root}" "${url_file}"
  if [[ ! -s "${url_file}" ]]; then
    rm -f -- "${url_file}"
    return 1
  fi
  count="$(foundation_keep_vault_up_psql_app "${url_file}" -tAc "SELECT COUNT(*) FROM nodes WHERE deleted_at IS NULL" 2>/dev/null || true)"
  rm -f -- "${url_file}"
  if [[ -z "${count}" ]]; then
    return 1
  fi
  printf '%s\n' "${count}"
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

  if ! foundation_keep_vault_up_refuse_restore_lock "${data_dir}"; then
    return 1
  fi
  if ! foundation_keep_vault_up_refuse_restore_failed "${data_dir}"; then
    return 1
  fi

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

  if ! foundation_keep_vault_up_bind_ok "${repo_root}"; then
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

# PID listening on this clone's health URL. Empty when the listener is
# not this repo. Official `pnpm start` has no app.pid; the Node
# listener cwd is apps/server, not the clone root.
foundation_keep_vault_up_health_listener_pid() {
  local repo_root="$1"
  local url host port pid cwd
  url="$(foundation_keep_vault_up_health_url)"
  host="$(python3 -c 'from urllib.parse import urlparse; import sys; print(urlparse(sys.argv[1]).hostname or "127.0.0.1")' "${url}")"
  port="$(python3 -c 'from urllib.parse import urlparse; import sys; u=urlparse(sys.argv[1]); print(u.port or (443 if u.scheme=="https" else 80))' "${url}")"
  foundation_keep_vault_up_is_loopback_bind "${host}" || return 1
  if ! command -v lsof >/dev/null 2>&1; then
    return 1
  fi
  pid="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | sort -u | head -n 1 || true)"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 1
  if [[ -L "/proc/${pid}/cwd" ]]; then
    cwd="$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)"
  else
    cwd="$(lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)"
  fi
  [[ "${cwd}" == "${repo_root}" || "${cwd}" == "${repo_root}/"* ]] || return 1
  printf '%s\n' "${pid}"
}

# Official `pnpm start` never writes app.pid. Stop that listener only
# when it is this clone. Leaves a foreign process.
foundation_keep_vault_up_stop_unrecorded_app() {
  local repo_root="$1"
  local pid i
  pid="$(foundation_keep_vault_up_health_listener_pid "${repo_root}" || true)"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 1
  foundation_keep_vault_up_stop_pid_tree "${pid}" TERM
  i=0
  while ((i < 5)) && kill -0 "${pid}" 2>/dev/null; do
    sleep 1
    i=$((i + 1))
  done
  if kill -0 "${pid}" 2>/dev/null; then
    foundation_keep_vault_up_stop_pid_tree "${pid}" KILL
  fi
  if kill -0 "${pid}" 2>/dev/null; then
    return 1
  fi
  return 0
}

# Stop this vault's app only (this FOUNDATION_DATA app.pid). Leaves Postgres up.
# Kills the pnpm wrapper and the Node listener (process group + tree).
# Does not wait(1) a pid from another process.
foundation_keep_vault_up_stop_app() {
  local data_dir="$1"
  local pid_file pid i
  pid_file="$(foundation_keep_vault_up_app_pid_file "${data_dir}")"

  if [[ ! -f "${pid_file}" ]]; then
    return 0
  fi
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
  if [[ "${pid}" =~ ^[0-9]+$ ]] && kill -0 "${pid}" 2>/dev/null; then
    return 1
  fi
  rm -f -- "${pid_file}"
  return 0
}

foundation_keep_vault_up_stop() {
  local repo_root data_dir postgres
  repo_root="$(foundation_keep_vault_up_repo_root)"
  data_dir="$(foundation_keep_vault_up_data_dir "${repo_root}")"
  postgres="${data_dir%/}/postgres"

  foundation_keep_vault_up_stop_app "${data_dir}" || true
  if command -v pg_ctl >/dev/null 2>&1 && [[ -d "${postgres}" ]]; then
    pg_ctl -D "${postgres}" stop -m fast >/dev/null 2>&1 || true
  fi
  return 0
}

foundation_keep_vault_up_restore_lock_path() {
  printf '%s/.restore-lock\n' "${1%/}"
}

foundation_keep_vault_up_restore_lock_pid_is_live() {
  local pid="$1"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 1
  kill -0 "${pid}" 2>/dev/null
}

foundation_keep_vault_up_refuse_restore_lock() {
  local data_dir="$1"
  local lock pid
  lock="$(foundation_keep_vault_up_restore_lock_path "${data_dir}")"
  if [[ ! -e "${lock}" ]]; then
    return 0
  fi
  pid="$(tr -d '[:space:]' < "${lock}" 2>/dev/null || true)"
  if foundation_keep_vault_up_restore_lock_pid_is_live "${pid}"; then
    foundation_keep_vault_up_nag "restore is running for this vault. Wait until restore finishes."
    return 1
  fi
  rm -f -- "${lock}"
  return 0
}

foundation_keep_vault_up_restore_failed_path() {
  printf '%s/.restore-failed\n' "${1%/}"
}

foundation_keep_vault_up_refuse_restore_failed() {
  local data_dir="$1"
  local marker
  marker="$(foundation_keep_vault_up_restore_failed_path "${data_dir}")"
  if [[ ! -e "${marker}" ]]; then
    return 0
  fi
  foundation_keep_vault_up_nag "in-place restore did not finish. Run restore-vault.sh --in-place --confirm again. Do not start."
  return 1
}

foundation_keep_vault_up_main() {
  local repo_root data_dir backup_root

  repo_root="$(foundation_keep_vault_up_repo_root)"
  data_dir="$(foundation_keep_vault_up_data_dir "${repo_root}")"
  backup_root="$(foundation_keep_vault_up_backup_root "${data_dir}")"

  if ! foundation_keep_vault_up_refuse_restore_lock "${data_dir}"; then
    return 1
  fi
  if ! foundation_keep_vault_up_refuse_restore_failed "${data_dir}"; then
    return 1
  fi
  if ! foundation_keep_vault_up_refuse_missing_folder "${data_dir}"; then
    return 1
  fi
  if ! foundation_keep_vault_up_refuse_miss "${data_dir}"; then
    return 1
  fi
  if ! foundation_keep_vault_up_refuse_empty_next_to_real "${repo_root}" "${data_dir}" "${backup_root}"; then
    return 1
  fi

  if ! foundation_keep_vault_up_ensure_env_secrets "${repo_root}"; then
    return 1
  fi

  if foundation_keep_vault_up_pg_running "${data_dir%/}/postgres"; then
    if ! foundation_keep_vault_up_ensure_app_database "${repo_root}" "${data_dir}"; then
      return 1
    fi
  fi

  if ((FOUNDATION_KEEP_VAULT_UP_ENV_CHANGED)); then
    if [[ -f "$(foundation_keep_vault_up_app_pid_file "${data_dir}")" ]] \
      && kill -0 "$(tr -d '[:space:]' <"$(foundation_keep_vault_up_app_pid_file "${data_dir}")")" 2>/dev/null; then
      foundation_keep_vault_up_stop_app "${data_dir}" || true
      if ! foundation_keep_vault_up_start_app "${repo_root}" "${data_dir}"; then
        foundation_keep_vault_up_nag "start failed. The app did not start (pnpm start)."
        return 1
      fi
    elif foundation_keep_vault_up_stop_unrecorded_app "${repo_root}"; then
      if ! foundation_keep_vault_up_start_app "${repo_root}" "${data_dir}"; then
        foundation_keep_vault_up_nag "start failed. The app did not start (pnpm start)."
        return 1
      fi
    fi
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
