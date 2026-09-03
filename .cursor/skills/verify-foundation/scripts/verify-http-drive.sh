#!/usr/bin/env bash
# Unlock + Home empty copy over HTTP. Writes evidence. Does not print the key.
set -euo pipefail

verify_http_redact_set_cookie() {
  sed -E 's/(Set-Cookie:[[:space:]]*[^=]+=)[^;]*/\1<redacted>/I'
}

verify_http_drive_fail() {
  echo "verify-http-drive: $*" >&2
  return 1
}

verify_http_drive_json_ok() {
  python3 -c 'import json,sys; json.loads(sys.stdin.read())' <<<"$1" || return 1
}

verify_http_drive_home_empty() {
  python3 -c '
import json, sys
recents = json.loads(sys.argv[1])
tasks = json.loads(sys.argv[2])
today = json.loads(sys.argv[3])
if recents.get("rows") != []:
    raise SystemExit("recents.rows is not empty")
if tasks.get("tasks") != []:
    raise SystemExit("tasks.tasks is not empty")
if today.get("node") is not None:
    raise SystemExit("journals/today peek is not empty")
' "$1" "$2" "$3"
}

verify_http_drive() {
  local helper evidence key_file unlock_dir home_dir key
  local unlock_raw unlock_headers unlock_body session_body recents_body tasks_body today_body

  helper="${1:-}"
  [[ -n "${helper}" && -f "${helper}" ]] || verify_http_drive_fail "helper is missing"
  evidence="$("${helper}" evidence-dir)"
  key_file="$("${helper}" key-file)"
  [[ -f "${key_file}" ]] || verify_http_drive_fail "key file is missing"
  key="$(cat -- "${key_file}")"
  [[ -n "${key}" ]] || verify_http_drive_fail "key file is empty"

  unlock_dir="${evidence}/unlock"
  home_dir="${evidence}/home"
  mkdir -p -- "${unlock_dir}" "${home_dir}"

  unlock_raw="$(
    curl -sS -D - http://127.0.0.1:8788/view/unlock \
      -H "content-type: application/json" \
      -H "accept: application/json" \
      -d "{\"api_key\":\"${key}\"}"
  )"
  unlock_headers="$(printf '%s\n' "${unlock_raw}" | awk 'BEGIN{h=1} h && /^(\r)?$/{h=0; next} h')"
  unlock_body="$(printf '%s\n' "${unlock_raw}" | awk 'BEGIN{h=1} h && /^(\r)?$/{h=0; next} !h')"
  printf '%s\n' "${unlock_headers}" | verify_http_redact_set_cookie >"${unlock_dir}/accept.headers"
  printf '%s\n' "${unlock_body}" >"${unlock_dir}/accept.json"
  grep -Eq '^HTTP/[0-9.]+ 200' <<<"${unlock_headers}" || verify_http_drive_fail "unlock accept was not HTTP 200"
  [[ "${unlock_body}" == *'"ok":true'* ]] || verify_http_drive_fail "unlock accept body was not { ok: true }"
  grep -Fiq 'set-cookie:' "${unlock_dir}/accept.headers" || verify_http_drive_fail "unlock accept missing Set-Cookie"
  grep -Fq 'foundation_key=<redacted>' "${unlock_dir}/accept.headers" || verify_http_drive_fail "unlock evidence did not redact the cookie"
  grep -Fiq 'Path=/view' "${unlock_dir}/accept.headers" || verify_http_drive_fail "unlock cookie Path is not /view"
  grep -Fiq 'HttpOnly' "${unlock_dir}/accept.headers" || verify_http_drive_fail "unlock cookie is not HttpOnly"
  if grep -Fq -- "${key}" "${unlock_dir}/accept.headers" "${unlock_dir}/accept.json"; then
    verify_http_drive_fail "unlock evidence contains the vault key"
  fi

  session_body="$(curl -sS http://127.0.0.1:8788/view/api/session -H "Authorization: ApiKey ${key}")"
  recents_body="$(curl -sS "http://127.0.0.1:8788/view/api/recents?limit=5" -H "Authorization: ApiKey ${key}")"
  tasks_body="$(curl -sS "http://127.0.0.1:8788/view/api/tasks?limit=5" -H "Authorization: ApiKey ${key}")"
  today_body="$(curl -sS http://127.0.0.1:8788/view/api/journals/today -H "Authorization: ApiKey ${key}")"
  printf '%s\n' "${session_body}" >"${home_dir}/session.json"
  printf '%s\n' "${recents_body}" >"${home_dir}/recents.json"
  printf '%s\n' "${tasks_body}" >"${home_dir}/tasks.json"
  printf '%s\n' "${today_body}" >"${home_dir}/today.json"
  verify_http_drive_json_ok "${session_body}" || verify_http_drive_fail "session body is not JSON"
  [[ "${session_body}" == *'"ok":true'* ]] || verify_http_drive_fail "session was not ok"
  verify_http_drive_home_empty "${recents_body}" "${tasks_body}" "${today_body}" \
    || verify_http_drive_fail "Home empty copy failed (first-day recents/tasks/today)"
  printf '%s\n' "home-empty" >"${home_dir}/feature-id"
  printf '%s\n' "HTTP Unlock accept + Home widgets on a first-day vault. Recents Nothing yet. Open tasks No open tasks. Today peek node null (Write today)." \
    >"${home_dir}/result.txt"
  echo "verify-http-drive: unlock accept and Home empty copy wrote ${evidence}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  verify_http_drive "${script_dir}/verify-foundation.sh"
fi
