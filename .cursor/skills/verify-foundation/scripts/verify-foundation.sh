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
#
# Env: VERIFY_RUN_ID, VERIFY_DATA_DIR, VERIFY_STATE_FILE, VERIFY_EVIDENCE_DIR,
#      VERIFY_BACKUP_ROOT, VERIFY_LAST_RUN_FILE, FOUNDATION_HEALTH_URL,
#      FOUNDATION_VIEW_URL, FOUNDATION_API_KEY.
# Does not guess a Postgres installer. Does not write the graph.
# Does not print the API key.
set -euo pipefail

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

verify_load_api_key() {
  local repo_root="$1"
  local id="$2"
  local key_file line raw
  if [[ -n "${FOUNDATION_API_KEY:-}" ]]; then
    printf '%s\n' "env"
    return 0
  fi
  key_file="$(verify_api_key_file "${id}")"
  if [[ -f "${key_file}" && -s "${key_file}" ]]; then
    FOUNDATION_API_KEY="$(tr -d '\r\n' <"${key_file}")"
    export FOUNDATION_API_KEY
    printf '%s\n' "run-file"
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
      printf '%s\n' "clone-env"
      return 0
    fi
  fi
  printf '%s\n' "missing"
  return 1
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

verify_write_state() {
  local file="$1"
  local id="$2"
  local data_dir="$3"
  mkdir -p -- "$(dirname -- "${file}")"
  umask 077
  cat >"${file}" <<EOF
RUN_ID=${id}
DATA_DIR=${data_dir}
STARTED=1
EOF
  verify_remember_run_id "${id}"
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
  local repo_root id state health_url view_url body view_code view_body dist key_source
  repo_root="$(verify_repo_root)"
  id="$(verify_resolve_run_id)"
  state="$(verify_state_file "${id}")"
  health_url="$(verify_health_url)"
  view_url="$(verify_view_url)"
  dist="${repo_root}/apps/viewer/dist/index.html"
  key_source="$(verify_load_api_key "${repo_root}" "${id}" || true)"

  echo "doctor: repo ${repo_root}"
  echo "doctor: run ${id}"
  echo "doctor: health ${health_url}"
  echo "doctor: view ${view_url}"
  echo "doctor: evidence $(verify_evidence_dir "${id}")"

  if [[ -f "${state}" ]]; then
    echo "doctor: state ${state} (this run launched)"
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

  case "${key_source}" in
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

  view_code="$(curl -sS -o /tmp/foundation-verify-view-body.$$ -w "%{http_code}" --max-time 5 "${view_url}" || true)"
  view_body="$(cat /tmp/foundation-verify-view-body.$$ 2>/dev/null || true)"
  rm -f /tmp/foundation-verify-view-body.$$
  if [[ "${view_code}" != "200" ]]; then
    echo "doctor: view GET ${view_url} -> ${view_code} (want 200)"
    return 1
  fi
  if [[ "${view_body}" == *"Unlock the vault window"* || "${view_body}" == *"Foundation"* ]]; then
    echo "doctor: view GET 200 (unlock door or Foundation chrome)"
  else
    echo "doctor: view GET 200 but body did not look like Viewer"
    return 1
  fi

  echo "doctor: worth driving"
  return 0
}

verify_cmd_launch() {
  local repo_root id data_dir state keep backup_root key_file key_source
  repo_root="$(verify_repo_root)"
  id="$(verify_launch_run_id)"
  data_dir="$(verify_data_dir "${id}")"
  state="$(verify_state_file "${id}")"
  keep="${repo_root}/scripts/keep-vault-up.sh"
  backup_root="$(verify_backup_root "${id}")"
  key_file="$(verify_api_key_file "${id}")"

  if [[ ! -x "${keep}" ]]; then
    echo "launch: missing ${keep}" >&2
    return 1
  fi

  if verify_health_ok; then
    if [[ -f "${state}" ]] && [[ "$(verify_state_get "${state}" STARTED || true)" == "1" ]]; then
      echo "launch: already up from this run"
      return 0
    fi
    echo "launch: GET /health is already green. Refusing to take over a shared instance." >&2
    echo "launch: stop that vault, or drive it only if the user asked." >&2
    return 1
  fi

  if ! verify_toolchain; then
    echo "launch: blocked. Official start is still ./scripts/keep-vault-up.sh then pnpm start." >&2
    echo "launch: prove Viewer with: pnpm --filter @foundation/viewer test && pnpm --filter @foundation/viewer build && pnpm test" >&2
    return 1
  fi

  key_source="$(verify_load_api_key "${repo_root}" "${id}" || true)"
  if [[ "${key_source}" == "missing" ]]; then
    FOUNDATION_API_KEY="verify-scaffold-${id}-$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
    export FOUNDATION_API_KEY
    echo "launch: minted a verification FOUNDATION_API_KEY (not printed; not a personal key)"
  fi

  mkdir -p -- "${data_dir}"
  mkdir -p -- "${backup_root}"
  mkdir -p -- "$(verify_evidence_dir "${id}")"
  verify_write_state "${state}" "${id}" "${data_dir}"
  umask 077
  printf '%s\n' "${FOUNDATION_API_KEY}" >"${key_file}"

  echo "launch: run ${id}"
  echo "launch: disposable data dir ${data_dir}"
  echo "launch: backup root ${backup_root}"
  echo "launch: state ${state}"
  echo "launch: key file ${key_file}"
  echo "launch: evidence $(verify_evidence_dir "${id}")"

  if ! FOUNDATION_DATA="${data_dir}" \
    FOUNDATION_API_KEY="${FOUNDATION_API_KEY}" \
    DATABASE_URL="${DATABASE_URL:-postgres://foundation:foundation@127.0.0.1:5432/foundation}" \
    BACKUP_ROOT="${backup_root}" \
    FOUNDATION_HEALTH_URL="$(verify_health_url)" \
    "${keep}"; then
    echo "launch: keep-vault-up failed" >&2
    return 1
  fi

  if ! verify_health_ok; then
    echo "launch: start ran and /health still failed" >&2
    return 1
  fi

  echo "launch: ready. Viewer $(verify_view_url)"
  return 0
}

verify_cmd_cleanup() {
  local repo_root id data_dir state keep evidence disposable
  repo_root="$(verify_repo_root)"
  id="$(verify_resolve_run_id)"
  state="$(verify_state_file "${id}")"
  evidence="$(verify_evidence_dir "${id}")"
  keep="${repo_root}/scripts/keep-vault-up.sh"

  if [[ -z "${VERIFY_RUN_ID:-}" && -f "$(verify_last_run_file)" ]]; then
    echo "cleanup: using last run ${id}"
  fi

  if [[ ! -f "${state}" ]]; then
    echo "cleanup: no state file ${state} — nothing this run started"
    echo "cleanup: evidence stays at ${evidence}"
    return 0
  fi

  data_dir="$(verify_state_get "${state}" DATA_DIR || true)"
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

usage() {
  echo "usage: verify-foundation.sh doctor|launch|cleanup|evidence-dir|run-id|key-file|backup-root" >&2
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
    *) usage ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
