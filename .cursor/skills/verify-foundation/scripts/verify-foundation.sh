#!/usr/bin/env bash
# Drive a verification vault for Viewer. Not a bot. Not a personal vault.
#
#   doctor       — read-only: is this instance worth driving?
#   launch       — disposable first-day folder + scripts/keep-vault-up.sh
#   cleanup      — stop what launch started; keep evidence
#   evidence-dir — print the evidence path for this run
#   run-id       — print the follow-up run id (VERIFY_RUN_ID or last launch)
#   key-file     — print the path of this run's key file (not the key)
#   backup-root  — print the disposable BACKUP_ROOT launch will pass
#   database-url — print the DATABASE_URL launch will pass (never ambient)
#
# Env: VERIFY_RUN_ID, VERIFY_DATA_DIR, VERIFY_STATE_FILE, VERIFY_EVIDENCE_DIR,
#      VERIFY_BACKUP_ROOT, VERIFY_LAST_RUN_FILE, VERIFY_KEEP_VAULT_UP,
#      FOUNDATION_HEALTH_URL, FOUNDATION_VIEW_URL, FOUNDATION_API_KEY.
# Does not guess a Postgres installer. Does not write the graph.
# Does not print the API key.
set -euo pipefail
VERIFY_KEY_SOURCE="missing"

verify_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  (cd "${script_dir}/../../../../" && pwd)
}

verify_run_id_ok() {
  local id="${1:-}"
  [[ "${id}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || return 1
  [[ "${id}" != *..* ]]
}

verify_last_run_file() {
  printf '%s\n' "${VERIFY_LAST_RUN_FILE:-/tmp/foundation-verify-last-run}"
}

verify_mint_run_id() {
  date -u +%Y%m%dT%H%M%SZ
}

# Follow-up commands: VERIFY_RUN_ID, else the id launch wrote, else a
# fresh stamp (not stored). Launch does not use this — it mints.
verify_resolve_run_id() {
  local last id
  if [[ -n "${VERIFY_RUN_ID:-}" ]]; then
    if ! verify_run_id_ok "${VERIFY_RUN_ID}"; then
      echo "verify: invalid VERIFY_RUN_ID" >&2
      return 1
    fi
    printf '%s\n' "${VERIFY_RUN_ID}"
    return
  fi
  last="$(verify_last_run_file)"
  if [[ -f "${last}" ]]; then
    id="$(tr -d '[:space:]' <"${last}")"
    if [[ -n "${id}" ]]; then
      if ! verify_run_id_ok "${id}"; then
        echo "verify: last-run id is invalid" >&2
        return 1
      fi
      printf '%s\n' "${id}"
      return
    fi
  fi
  verify_mint_run_id
}

# Launch starts a new disposable run unless VERIFY_RUN_ID is set.
# Reusing last-run would write a second launch into the previous
# evidence folder and treat a still-up vault as "already this run".
verify_launch_run_id() {
  if [[ -n "${VERIFY_RUN_ID:-}" ]]; then
    if ! verify_run_id_ok "${VERIFY_RUN_ID}"; then
      echo "launch: invalid VERIFY_RUN_ID" >&2
      return 1
    fi
    printf '%s\n' "${VERIFY_RUN_ID}"
    return
  fi
  verify_mint_run_id
}

verify_remember_run_id() {
  local id="$1"
  verify_run_id_ok "${id}" || return 1
  printf '%s\n' "${id}" >"$(verify_last_run_file)"
}

verify_run_root() {
  local id="$1"
  printf '%s\n' "/tmp/foundation-verify-${id}"
}

verify_data_dir() {
  local id="$1"
  local raw="${VERIFY_DATA_DIR:-$(verify_run_root "${id}")/data}"
  raw="${raw%/}"
  if [[ "${raw}" != /* ]]; then
    printf '%s\n' "$(verify_repo_root)/${raw#./}"
  else
    printf '%s\n' "${raw}"
  fi
}

verify_state_file() {
  local id="$1"
  printf '%s\n' "${VERIFY_STATE_FILE:-$(verify_run_root "${id}")/state}"
}

verify_api_key_file() {
  local id="$1"
  printf '%s\n' "$(dirname -- "$(verify_state_file "${id}")")/api_key"
}

verify_backup_root() {
  local id="$1"
  printf '%s\n' "${VERIFY_BACKUP_ROOT:-$(verify_run_root "${id}")/backups}"
}

verify_evidence_dir() {
  local id="$1"
  local repo_root raw
  repo_root="$(verify_repo_root)"
  raw="${VERIFY_EVIDENCE_DIR:-${repo_root}/.cursor/skills/verify-foundation/evidence/${id}}"
  raw="${raw%/}"
  if [[ "${raw}" != /* ]]; then
    printf '%s\n' "${repo_root}/${raw#./}"
  else
    printf '%s\n' "${raw}"
  fi
}

# Only /tmp/foundation-verify-<id> when data is that folder or its /data child.
# Never /tmp. Never a path that contains ..
verify_disposable_run_root() {
  local id="$1"
  local data_dir="${2%/}"
  local root
  verify_run_id_ok "${id}" || return 1
  root="$(verify_run_root "${id}")"
  if [[ "${root}" == "/tmp" || "${root}" == "/" || "${root}" == "${HOME:-}" ]]; then
    return 1
  fi
  if [[ "${data_dir}" == *..* ]]; then
    return 1
  fi
  if [[ "${data_dir}" == "${root}" || "${data_dir}" == "${root}/data" ]]; then
    printf '%s\n' "${root}"
    return 0
  fi
  return 1
}

# Sets FOUNDATION_API_KEY in this shell (not a subshell). Do not wrap
# in $(...). That would drop the export and, with set -u, crash launch.
# VERIFY_KEY_SOURCE is env | run-file | clone-env | missing. Never the key.
verify_load_api_key() {
  local repo_root="$1"
  local id="$2"
  local key_file line raw
  VERIFY_KEY_SOURCE="missing"
  if [[ -n "${FOUNDATION_API_KEY:-}" ]]; then
    VERIFY_KEY_SOURCE="env"
    return 0
  fi
  key_file="$(verify_api_key_file "${id}")"
  if [[ -f "${key_file}" && -s "${key_file}" ]]; then
    FOUNDATION_API_KEY="$(tr -d '\r\n' <"${key_file}")"
    export FOUNDATION_API_KEY
    VERIFY_KEY_SOURCE="run-file"
    return 0
  fi
  if [[ -f "${repo_root}/.env" ]]; then
    line="$(grep -E '^[[:space:]]*FOUNDATION_API_KEY=' "${repo_root}/.env" | tail -n 1 || true)"
    raw="${line#*FOUNDATION_API_KEY=}"
    raw="${raw%$'\r'}"
    if [[ "${raw}" == \"*\" && "${raw}" == *\" ]]; then
      raw="${raw#\"}"
      raw="${raw%\"}"
    fi
    if [[ -n "${raw}" ]]; then
      FOUNDATION_API_KEY="${raw}"
      export FOUNDATION_API_KEY
      VERIFY_KEY_SOURCE="clone-env"
      return 0
    fi
  fi
  return 1
}

# Disposable cluster only. Never an ambient DATABASE_URL (that would
# attach the app to a live cluster while FOUNDATION_DATA looks throwaway).
verify_launch_database_url() {
  printf '%s\n' "postgres://foundation:foundation@127.0.0.1:5432/foundation"
}

verify_app_pid_file() {
  printf '%s/app.pid\n' "${1%/}"
}

verify_read_app_pid() {
  local file
  file="$(verify_app_pid_file "$1")"
  [[ -f "${file}" ]] || return 1
  tr -d '[:space:]' <"${file}"
}

# Stop this pid and its children. Never pkill by process name.
verify_stop_app_pid() {
  local pid="$1"
  local child i
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 0
  [[ "${pid}" != "1" ]] || return 0
  kill -0 "${pid}" 2>/dev/null || return 0
  while IFS= read -r child; do
    [[ -n "${child}" ]] || continue
    verify_stop_app_pid "${child}"
  done < <(pgrep -P "${pid}" 2>/dev/null || true)
  kill -TERM "${pid}" 2>/dev/null || true
  i=0
  while ((i < 10)) && kill -0 "${pid}" 2>/dev/null; do
    sleep 0.1
    i=$((i + 1))
  done
  if kill -0 "${pid}" 2>/dev/null; then
    kill -KILL "${pid}" 2>/dev/null || true
  fi
  return 0
}

# This run is up only when we recorded STARTED=1 and that pid still lives.
# Leftover STARTED=1 without a live pid is not "already this run".
verify_this_run_up() {
  local state="$1"
  local pid
  [[ -f "${state}" ]] || return 1
  [[ "$(verify_state_get "${state}" STARTED || true)" == "1" ]] || return 1
  pid="$(verify_state_get "${state}" APP_PID || true)"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 1
  kill -0 "${pid}" 2>/dev/null
}

verify_health_url() {
  printf '%s\n' "${FOUNDATION_HEALTH_URL:-http://127.0.0.1:8787/health}"
}

verify_view_url() {
  printf '%s\n' "${FOUNDATION_VIEW_URL:-http://127.0.0.1:8788/view}"
}

verify_json_field() {
  local compact="$1"
  local needle="$2"
  [[ "${compact}" == *"${needle},"* || "${compact}" == *"${needle}}"* ]]
}

verify_body_is_green() {
  local body="$1"
  local compact="${body//[$' \t\n\r']/}"
  [[ -n "${compact}" ]] || return 1
  verify_json_field "${compact}" '"ok":true' || return 1
  verify_json_field "${compact}" '"service":"foundation"' || return 1
  verify_json_field "${compact}" '"db":"up"' || return 1
  return 0
}

verify_health_ok() {
  local body
  body="$(curl -fsS --max-time 5 "$(verify_health_url)" 2>/dev/null || true)"
  verify_body_is_green "${body}"
}

verify_state_get() {
  local file="$1"
  local key="$2"
  [[ -f "${file}" ]] || return 1
  local line
  line="$(grep -E "^${key}=" "${file}" | tail -n 1 || true)"
  [[ -n "${line}" ]] || return 1
  printf '%s\n' "${line#*"${key}"=}"
}

# Fifth arg is STARTED (1 only after keep + health + numeric pid).
verify_write_state() {
  local file="$1"
  local id="$2"
  local data_dir="$3"
  local app_pid="${4:-}"
  local started="${5:-0}"
  mkdir -p -- "$(dirname -- "${file}")"
  umask 077
  cat >"${file}" <<EOF
RUN_ID=${id}
DATA_DIR=${data_dir}
STARTED=${started}
APP_PID=${app_pid}
EOF
  verify_remember_run_id "${id}"
}

# Stop pid from state or data_dir/app.pid, then keep-vault-up stop.
verify_stop_this_start() {
  local data_dir="$1"
  local keep="$2"
  local state="${3:-}"
  local app_pid=""
  if [[ -n "${state}" && -f "${state}" ]]; then
    app_pid="$(verify_state_get "${state}" APP_PID || true)"
  fi
  if ! [[ "${app_pid}" =~ ^[0-9]+$ ]] && [[ -n "${data_dir}" ]]; then
    app_pid="$(verify_read_app_pid "${data_dir}" || true)"
  fi
  if [[ "${app_pid}" =~ ^[0-9]+$ ]]; then
    echo "launch: stopping app pid ${app_pid} after a failed start"
    verify_stop_app_pid "${app_pid}"
  fi
  if [[ -n "${data_dir}" && -x "${keep}" ]]; then
    echo "launch: stopping host programs after a failed start"
    FOUNDATION_DATA="${data_dir}" "${keep}" stop || true
  fi
}

# Failed start: STARTED!=1. Not a successful vault. Stop it so a later
# launch does not refuse leftover green /health as a shared instance.
verify_reclaim_failed_start() {
  local state="$1"
  local keep="$2"
  local data_dir
  [[ -f "${state}" ]] || return 1
  [[ "$(verify_state_get "${state}" STARTED || true)" != "1" ]] || return 1
  data_dir="$(verify_state_get "${state}" DATA_DIR || true)"
  echo "launch: reclaiming a failed start at ${state}"
  verify_stop_this_start "${data_dir}" "${keep}" "${state}"
  return 0
}

verify_toolchain() {
  local missing=0
  if ! command -v node >/dev/null 2>&1; then
    echo "doctor: node is not on PATH (need Node 22)" >&2
    missing=1
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "doctor: pnpm is not on PATH" >&2
    missing=1
  fi
  if ! command -v initdb >/dev/null 2>&1; then
    echo "doctor: Postgres 16 is not on PATH (initdb). The package name is unknown in this repo." >&2
    missing=1
  fi
  if ! command -v pg_ctl >/dev/null 2>&1; then
    echo "doctor: Postgres 16 is not on PATH (pg_ctl). The package name is unknown in this repo." >&2
    missing=1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "doctor: psql is not on PATH. The package name is unknown in this repo." >&2
    missing=1
  fi
  return "${missing}"
}

verify_cmd_doctor() {
  local repo_root id state health_url view_url body view_code view_body dist app_pid
  repo_root="$(verify_repo_root)"
  id="$(verify_resolve_run_id)"
  state="$(verify_state_file "${id}")"
  health_url="$(verify_health_url)"
  view_url="$(verify_view_url)"
  dist="${repo_root}/apps/viewer/dist/index.html"
  verify_load_api_key "${repo_root}" "${id}" || true

  echo "doctor: repo ${repo_root}"
  echo "doctor: run ${id}"
  echo "doctor: health ${health_url}"
  echo "doctor: view ${view_url}"
  echo "doctor: evidence $(verify_evidence_dir "${id}")"

  if [[ -f "${state}" ]]; then
    echo "doctor: state ${state} (this run launched)"
    app_pid="$(verify_state_get "${state}" APP_PID || true)"
    if [[ "${app_pid}" =~ ^[0-9]+$ ]]; then
      echo "doctor: app pid ${app_pid}"
    fi
  else
    echo "doctor: no state file for run ${id} (this run did not launch)"
  fi

  if verify_toolchain; then
    echo "doctor: toolchain ok (node, pnpm, initdb, pg_ctl, psql)"
  else
    echo "doctor: toolchain incomplete — launch will refuse. Do not guess an installer."
  fi

  if [[ -f "${dist}" ]]; then
    echo "doctor: Viewer dist present"
  else
    echo "doctor: Viewer dist missing (${dist}). Full window chrome needs: pnpm --filter @foundation/viewer build"
  fi

  case "${VERIFY_KEY_SOURCE:-missing}" in
    env) echo "doctor: FOUNDATION_API_KEY is set (not printed)" ;;
    run-file) echo "doctor: FOUNDATION_API_KEY is in this run's key file $(verify_api_key_file "${id}") (not printed)" ;;
    clone-env) echo "doctor: FOUNDATION_API_KEY is in the clone .env (not printed)" ;;
    *) echo "doctor: FOUNDATION_API_KEY is not set" ;;
  esac

  body="$(curl -fsS --max-time 5 "${health_url}" 2>/dev/null || true)"
  if verify_body_is_green "${body}"; then
    echo "doctor: health green ${body}"
  else
    echo "doctor: health down. Instance is not worth driving."
    echo "doctor: official start is ./scripts/keep-vault-up.sh then wait for GET /health"
    return 1
  fi

  view_code="$(curl -sS -L --max-redirs 3 -o /tmp/foundation-verify-view-body.$$ -w "%{http_code}" --max-time 5 "${view_url}" || true)"
  view_body="$(cat /tmp/foundation-verify-view-body.$$ 2>/dev/null || true)"
  rm -f /tmp/foundation-verify-view-body.$$
  if [[ "${view_code}" != "200" ]]; then
    echo "doctor: view GET ${view_url} -> ${view_code} (want 200)"
    return 1
  fi
  if [[ "${view_body}" == *"Foundation"* || "${view_body}" == *"Unlock."* || "${view_body}" == *"Vault key"* ]]; then
    echo "doctor: view GET 200 (unlock door or Foundation chrome)"
  else
    echo "doctor: view GET 200 but body did not look like Viewer"
    return 1
  fi

  echo "doctor: worth driving"
  return 0
}

verify_cmd_launch() {
  local repo_root id data_dir state keep backup_root key_file app_pid db_url last_id
  repo_root="$(verify_repo_root)"
  id="$(verify_launch_run_id)"
  data_dir="$(verify_data_dir "${id}")"
  state="$(verify_state_file "${id}")"
  keep="${VERIFY_KEEP_VAULT_UP:-${repo_root}/scripts/keep-vault-up.sh}"
  backup_root="$(verify_backup_root "${id}")"
  key_file="$(verify_api_key_file "${id}")"
  db_url="$(verify_launch_database_url)"

  if [[ ! -x "${keep}" ]]; then
    echo "launch: missing ${keep}" >&2
    return 1
  fi

  if verify_health_ok; then
    if verify_this_run_up "${state}"; then
      echo "launch: already up from this run"
      return 0
    fi
    if verify_reclaim_failed_start "${state}" "${keep}"; then
      :
    elif [[ -z "${VERIFY_RUN_ID:-}" ]]; then
      last_id="$(tr -d '[:space:]' <"$(verify_last_run_file)" 2>/dev/null || true)"
      if [[ -n "${last_id}" && "${last_id}" != "${id}" ]] && verify_run_id_ok "${last_id}"; then
        verify_reclaim_failed_start "$(verify_state_file "${last_id}")" "${keep}" || true
      fi
    fi
    if ! verify_health_ok; then
      echo "launch: stopped a leftover failed start; continuing"
    else
      echo "launch: GET /health is already green. Refusing to take over a shared instance." >&2
      echo "launch: stop that vault, or drive it only if the user asked." >&2
      return 1
    fi
  fi

  if ! verify_toolchain; then
    echo "launch: blocked. Official start is still ./scripts/keep-vault-up.sh then pnpm start." >&2
    echo "launch: prove Viewer with: pnpm --filter @foundation/viewer test && pnpm --filter @foundation/viewer build && pnpm test" >&2
    return 1
  fi

  verify_load_api_key "${repo_root}" "${id}" || true
  if [[ "${VERIFY_KEY_SOURCE:-missing}" == "missing" ]]; then
    FOUNDATION_API_KEY="verify-scaffold-${id}-$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
    export FOUNDATION_API_KEY
    echo "launch: minted a verification FOUNDATION_API_KEY (not printed; not a personal key)"
  fi

  mkdir -p -- "${data_dir}"
  mkdir -p -- "${backup_root}"
  mkdir -p -- "$(verify_evidence_dir "${id}")"
  umask 077
  printf '%s\n' "${FOUNDATION_API_KEY}" >"${key_file}"

  echo "launch: run ${id}"
  echo "launch: disposable data dir ${data_dir}"
  echo "launch: backup root ${backup_root}"
  echo "launch: key file ${key_file}"
  echo "launch: evidence $(verify_evidence_dir "${id}")"

  if ! FOUNDATION_DATA="${data_dir}" \
    FOUNDATION_API_KEY="${FOUNDATION_API_KEY}" \
    DATABASE_URL="${db_url}" \
    BACKUP_ROOT="${backup_root}" \
    FOUNDATION_HEALTH_URL="$(verify_health_url)" \
    "${keep}"; then
    echo "launch: keep-vault-up failed" >&2
    verify_fail_after_keep "${id}" "${data_dir}" "${state}" "${keep}"
    return 1
  fi

  if ! verify_health_ok; then
    echo "launch: start ran and /health still failed" >&2
    verify_fail_after_keep "${id}" "${data_dir}" "${state}" "${keep}"
    return 1
  fi

  app_pid="$(verify_read_app_pid "${data_dir}" || true)"
  if ! [[ "${app_pid}" =~ ^[0-9]+$ ]]; then
    echo "launch: keep-vault-up succeeded but app pid is missing" >&2
    verify_fail_after_keep "${id}" "${data_dir}" "${state}" "${keep}"
    return 1
  fi
  verify_write_state "${state}" "${id}" "${data_dir}" "${app_pid}" 1
  echo "launch: state ${state}"
  echo "launch: app pid ${app_pid}"
  echo "launch: ready. Viewer $(verify_view_url)"
  return 0
}

# keep-vault-up may have started host programs and still failed.
# Record STARTED=0 + pid + last-run so cleanup can stop them, then stop now.
# Successful launch still writes STARTED=1 only after keep + health + pid.
verify_fail_after_keep() {
  local id="$1"
  local data_dir="$2"
  local state="$3"
  local keep="$4"
  local app_pid=""
  app_pid="$(verify_read_app_pid "${data_dir}" || true)"
  if [[ "${app_pid}" =~ ^[0-9]+$ ]] || verify_health_ok; then
    verify_write_state "${state}" "${id}" "${data_dir}" "${app_pid}" 0
    echo "launch: recorded failed start (STARTED=0) so cleanup can stop it"
  fi
  verify_stop_this_start "${data_dir}" "${keep}" "${state}"
}

verify_cmd_cleanup() {
  local repo_root id data_dir state keep evidence disposable app_pid
  repo_root="$(verify_repo_root)"
  id="$(verify_resolve_run_id)"
  state="$(verify_state_file "${id}")"
  evidence="$(verify_evidence_dir "${id}")"
  keep="${VERIFY_KEEP_VAULT_UP:-${repo_root}/scripts/keep-vault-up.sh}"

  if [[ -z "${VERIFY_RUN_ID:-}" && -f "$(verify_last_run_file)" ]]; then
    echo "cleanup: using last run ${id}"
  fi

  if [[ ! -f "${state}" ]]; then
    echo "cleanup: no state file ${state} — nothing this run started"
    echo "cleanup: evidence stays at ${evidence}"
    return 0
  fi

  data_dir="$(verify_state_get "${state}" DATA_DIR || true)"
  app_pid="$(verify_state_get "${state}" APP_PID || true)"
  if [[ "${app_pid}" =~ ^[0-9]+$ ]]; then
    echo "cleanup: stopping app pid ${app_pid}"
    verify_stop_app_pid "${app_pid}"
  fi
  if [[ -n "${data_dir}" && -x "${keep}" ]]; then
    echo "cleanup: stopping host programs for ${data_dir}"
    FOUNDATION_DATA="${data_dir}" "${keep}" stop || true
  fi

  disposable="$(verify_disposable_run_root "${id}" "${data_dir}" || true)"
  if [[ -n "${disposable}" ]]; then
    echo "cleanup: removing disposable run root ${disposable}"
    rm -rf -- "${disposable}"
  else
    echo "cleanup: left data dir in place (not this run's disposable root)"
    rm -f -- "${state}"
  fi

  if [[ -d "${evidence}" ]]; then
    echo "cleanup: evidence still at ${evidence}"
  else
    echo "cleanup: warning — evidence dir missing ${evidence}" >&2
    return 1
  fi
  return 0
}

verify_cmd_evidence_dir() {
  local id
  id="$(verify_resolve_run_id)"
  mkdir -p -- "$(verify_evidence_dir "${id}")"
  verify_evidence_dir "${id}"
}

verify_cmd_run_id() {
  verify_resolve_run_id
}

verify_cmd_key_file() {
  verify_api_key_file "$(verify_resolve_run_id)"
}

verify_cmd_backup_root() {
  verify_backup_root "$(verify_resolve_run_id)"
}

verify_cmd_database_url() {
  verify_launch_database_url
}

usage() {
  echo "usage: verify-foundation.sh doctor|launch|cleanup|evidence-dir|run-id|key-file|backup-root|database-url" >&2
  return 2
}

main() {
  case "${1:-}" in
    doctor) verify_cmd_doctor ;;
    launch) verify_cmd_launch ;;
    cleanup) verify_cmd_cleanup ;;
    evidence-dir) verify_cmd_evidence_dir ;;
    run-id) verify_cmd_run_id ;;
    key-file) verify_cmd_key_file ;;
    backup-root) verify_cmd_backup_root ;;
    database-url) verify_cmd_database_url ;;
    *) usage ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
