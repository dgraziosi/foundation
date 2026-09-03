#!/usr/bin/env bash
# Unlock + Home empty copy over HTTP. Writes evidence. Does not print keys.
# Unlock and /view/api use the view key file. MCP proofs use the API key file.
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

verify_http_unlock_post() {
  local key="$1"
  curl -sS -D - http://127.0.0.1:8788/view/unlock \
    -H "content-type: application/json" \
    -H "accept: application/json" \
    -d "{\"api_key\":\"${key}\"}"
}

verify_http_split_headers() {
  printf '%s\n' "$1" | awk 'BEGIN{h=1} h && /^(\r)?$/{h=0; next} h'
}

verify_http_split_body() {
  printf '%s\n' "$1" | awk 'BEGIN{h=1} h && /^(\r)?$/{h=0; next} !h'
}

verify_http_drive() {
  local helper evidence key_file view_key_file unlock_dir home_dir key view_key
  local unlock_raw unlock_headers unlock_body session_body recents_body tasks_body today_body
  local reject_raw reject_headers reject_body mcp_unlock_raw mcp_unlock_headers mcp_unlock_body
  local cookie mcp_cookie_code mcp_none_code mcp_key_code throttle_raw throttle_headers throttle_body
  local i refuse_code

  helper="${1:-}"
  [[ -n "${helper}" && -f "${helper}" ]] || verify_http_drive_fail "helper is missing"
  evidence="$("${helper}" evidence-dir)"
  view_key_file="$("${helper}" view-key-file)"
  key_file="$("${helper}" key-file)"
  [[ -f "${view_key_file}" ]] || verify_http_drive_fail "view key file is missing"
  [[ -f "${key_file}" ]] || verify_http_drive_fail "key file is missing"
  view_key="$(cat -- "${view_key_file}")"
  key="$(cat -- "${key_file}")"
  [[ -n "${view_key}" ]] || verify_http_drive_fail "view key file is empty"
  [[ -n "${key}" ]] || verify_http_drive_fail "key file is empty"

  unlock_dir="${evidence}/unlock"
  home_dir="${evidence}/home"
  mkdir -p -- "${unlock_dir}" "${home_dir}"

  reject_raw="$(verify_http_unlock_post "wrong")"
  reject_headers="$(verify_http_split_headers "${reject_raw}")"
  reject_body="$(verify_http_split_body "${reject_raw}")"
  printf '%s\n' "${reject_headers}" >"${unlock_dir}/reject.headers"
  printf '%s\n' "${reject_body}" >"${unlock_dir}/reject.json"
  grep -Eq '^HTTP/[0-9.]+ 401' <<<"${reject_headers}" || verify_http_drive_fail "unlock reject was not HTTP 401"
  [[ "${reject_body}" == *'"That key did not unlock."'* ]] || verify_http_drive_fail "unlock reject copy is wrong"

  mcp_unlock_raw="$(verify_http_unlock_post "${key}")"
  mcp_unlock_headers="$(verify_http_split_headers "${mcp_unlock_raw}")"
  mcp_unlock_body="$(verify_http_split_body "${mcp_unlock_raw}")"
  printf '%s\n' "${mcp_unlock_headers}" >"${unlock_dir}/mcp-key.headers"
  printf '%s\n' "${mcp_unlock_body}" >"${unlock_dir}/mcp-key.json"
  grep -Eq '^HTTP/[0-9.]+ 401' <<<"${mcp_unlock_headers}" || verify_http_drive_fail "MCP key unlock was not HTTP 401 when view key exists"
  [[ "${mcp_unlock_body}" == *'"That key did not unlock."'* ]] || verify_http_drive_fail "MCP key unlock copy is wrong"
  if grep -Fq -- "${key}" "${unlock_dir}/mcp-key.headers" "${unlock_dir}/mcp-key.json"; then
    verify_http_drive_fail "MCP key unlock evidence contains the API key"
  fi

  unlock_raw="$(verify_http_unlock_post "${view_key}")"
  unlock_headers="$(verify_http_split_headers "${unlock_raw}")"
  unlock_body="$(verify_http_split_body "${unlock_raw}")"
  printf '%s\n' "${unlock_headers}" | verify_http_redact_set_cookie >"${unlock_dir}/accept.headers"
  printf '%s\n' "${unlock_body}" >"${unlock_dir}/accept.json"
  grep -Eq '^HTTP/[0-9.]+ 200' <<<"${unlock_headers}" || verify_http_drive_fail "unlock accept was not HTTP 200"
  [[ "${unlock_body}" == *'"ok":true'* ]] || verify_http_drive_fail "unlock accept body was not { ok: true }"
  grep -Fiq 'set-cookie:' "${unlock_dir}/accept.headers" || verify_http_drive_fail "unlock accept missing Set-Cookie"
  grep -Fq 'foundation_key=<redacted>' "${unlock_dir}/accept.headers" || verify_http_drive_fail "unlock evidence did not redact the cookie"
  grep -Fiq 'Path=/view' "${unlock_dir}/accept.headers" || verify_http_drive_fail "unlock cookie Path is not /view"
  grep -Fiq 'HttpOnly' "${unlock_dir}/accept.headers" || verify_http_drive_fail "unlock cookie is not HttpOnly"
  if grep -Fq -- "${view_key}" "${unlock_dir}/accept.headers" "${unlock_dir}/accept.json"; then
    verify_http_drive_fail "unlock evidence contains the vault key"
  fi
  cookie="$(printf '%s\n' "${unlock_headers}" | awk 'BEGIN{IGNORECASE=1} /^Set-Cookie:/{sub(/^Set-Cookie:[[:space:]]*/,""); print; exit}' | cut -d';' -f1)"
  [[ -n "${cookie}" ]] || verify_http_drive_fail "could not read Set-Cookie for MCP cookie-scope"

  session_body="$(curl -sS http://127.0.0.1:8788/view/api/session -H "Authorization: ApiKey ${view_key}")"
  recents_body="$(curl -sS "http://127.0.0.1:8788/view/api/recents?limit=5" -H "Authorization: ApiKey ${view_key}")"
  tasks_body="$(curl -sS "http://127.0.0.1:8788/view/api/tasks?limit=5" -H "Authorization: ApiKey ${view_key}")"
  today_body="$(curl -sS http://127.0.0.1:8788/view/api/journals/today -H "Authorization: ApiKey ${view_key}")"
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

  mcp_session="$(curl -sS -o /tmp/foundation-verify-mcp-session.$$ -w "%{http_code}" \
    http://127.0.0.1:8788/view/api/session -H "Authorization: ApiKey ${key}" || true)"
  rm -f /tmp/foundation-verify-mcp-session.$$
  [[ "${mcp_session}" == "401" ]] || verify_http_drive_fail "MCP key on /view/api/session was ${mcp_session}, want 401"

  mcp_none_code="$(
    curl -sS -o /tmp/foundation-verify-mcp-none.$$ -w "%{http_code}" \
      -X POST http://127.0.0.1:8787/mcp \
      -H "content-type: application/json" \
      -H "accept: application/json, text/event-stream" \
      -d '{}' || true
  )"
  rm -f /tmp/foundation-verify-mcp-none.$$
  [[ "${mcp_none_code}" == "401" ]] || verify_http_drive_fail "POST /mcp without a key was ${mcp_none_code}, want 401"

  mcp_cookie_code="$(
    curl -sS -o /tmp/foundation-verify-mcp-cookie.$$ -w "%{http_code}" \
      -X POST http://127.0.0.1:8787/mcp \
      -H "content-type: application/json" \
      -H "accept: application/json, text/event-stream" \
      -H "Cookie: ${cookie}" \
      -d '{}' || true
  )"
  rm -f /tmp/foundation-verify-mcp-cookie.$$
  printf '%s\n' "${mcp_cookie_code}" >"${unlock_dir}/mcp-cookie.status"
  [[ "${mcp_cookie_code}" == "401" ]] || verify_http_drive_fail "cookie on POST /mcp was ${mcp_cookie_code}, want 401"

  mcp_key_code="$(
    curl -sS -o /tmp/foundation-verify-mcp-key.$$ -w "%{http_code}" \
      -X POST http://127.0.0.1:8787/mcp \
      -H "Authorization: ApiKey ${key}" \
      -H "content-type: application/json" \
      -H "accept: application/json, text/event-stream" \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"bootstrap","arguments":{}}}' || true
  )"
  rm -f /tmp/foundation-verify-mcp-key.$$
  printf '%s\n' "${mcp_key_code}" >"${unlock_dir}/mcp-apikey.status"
  [[ "${mcp_key_code}" == "200" || "${mcp_key_code}" == "405" ]] \
    || verify_http_drive_fail "Authorization ApiKey on POST /mcp was ${mcp_key_code}, want 200 or 405"

  for i in 1 2 3 4 5; do
    refuse_code="$(
      curl -sS -o /tmp/foundation-verify-refuse.$$ -w "%{http_code}" \
        http://127.0.0.1:8788/view/unlock \
        -H "content-type: application/json" \
        -H "accept: application/json" \
        -d '{"api_key":"nope"}' || true
    )"
    [[ "${refuse_code}" == "401" ]] || verify_http_drive_fail "wrong unlock ${i} was ${refuse_code}, want 401"
  done
  throttle_raw="$(verify_http_unlock_post "nope")"
  throttle_headers="$(verify_http_split_headers "${throttle_raw}")"
  throttle_body="$(verify_http_split_body "${throttle_raw}")"
  printf '%s\n' "${throttle_headers}" >"${unlock_dir}/throttle.headers"
  printf '%s\n' "${throttle_body}" >"${unlock_dir}/throttle.json"
  grep -Eq '^HTTP/[0-9.]+ 429' <<<"${throttle_headers}" || verify_http_drive_fail "sixth wrong unlock was not HTTP 429"
  grep -Fiq 'Retry-After:' "${unlock_dir}/throttle.headers" || verify_http_drive_fail "429 missing Retry-After"
  [[ "${throttle_body}" == *'"That key did not unlock."'* ]] || verify_http_drive_fail "429 copy is wrong"
  rm -f /tmp/foundation-verify-refuse.$$

  printf '%s\n' "viewer-credential-36b" >"${unlock_dir}/feature-id"
  printf '%s\n' "HTTP reject 401. MCP key does not unlock. View key accept 200. Cookie does not open MCP. API key still opens MCP. Sixth wrong unlock 429." \
    >"${unlock_dir}/result.txt"
  echo "verify-http-drive: unlock accept and Home empty copy wrote ${evidence}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  verify_http_drive "${script_dir}/verify-foundation.sh"
fi
