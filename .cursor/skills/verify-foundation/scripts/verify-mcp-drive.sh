#!/usr/bin/env bash
# MCP client round-trip against a live vault. Writes evidence. Does not print the key.
set -euo pipefail

verify_mcp_drive_fail() {
  echo "verify-mcp-drive: $*" >&2
  return 1
}

verify_mcp_jsonrpc_result() {
  python3 -c '
import json, sys
raw = sys.stdin.read()
obj = None
try:
    obj = json.loads(raw)
except json.JSONDecodeError:
    for line in raw.splitlines():
        if line.startswith("data:"):
            payload = line[5:].strip()
            if not payload:
                continue
            obj = json.loads(payload)
            break
if not isinstance(obj, dict):
    raise SystemExit("mcp body is not JSON-RPC")
if obj.get("error"):
    raise SystemExit("mcp JSON-RPC error")
result = obj.get("result")
if not isinstance(result, dict):
    raise SystemExit("mcp result missing")
print(json.dumps(result))
'
}

verify_mcp_tools_list_ok() {
  python3 -c '
import json, sys
result = json.loads(sys.argv[1])
tools = result.get("tools")
if not isinstance(tools, list) or not tools:
    raise SystemExit("tools/list returned no tools")
names = [row.get("name") for row in tools if isinstance(row, dict)]
need = {"bootstrap", "search", "get"}
missing = sorted(need - set(names))
if missing:
    raise SystemExit("tools/list missing: " + ", ".join(missing))
print(json.dumps({"tool_count": len(names), "names": names}))
' "$1"
}

verify_mcp_drive() {
  local helper evidence key_file key mcp_dir headers body raw result listed

  helper="${1:-}"
  [[ -n "${helper}" && -f "${helper}" ]] || verify_mcp_drive_fail "helper is missing"
  evidence="$("${helper}" evidence-dir)"
  key_file="$("${helper}" key-file)"
  [[ -f "${key_file}" ]] || verify_mcp_drive_fail "key file is missing"
  key="$(cat -- "${key_file}")"
  [[ -n "${key}" ]] || verify_mcp_drive_fail "key file is empty"

  mcp_dir="${evidence}/mcp"
  mkdir -p -- "${mcp_dir}"
  printf '%s\n' "POST /mcp tools/list" >"${mcp_dir}/request.txt"

  raw="$(
    curl -sS -D - http://127.0.0.1:8787/mcp \
      -H "Authorization: ApiKey ${key}" \
      -H "content-type: application/json" \
      -H "accept: application/json, text/event-stream" \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
  )"
  headers="$(printf '%s\n' "${raw}" | awk 'BEGIN{h=1} h && /^(\r)?$/{h=0; next} h')"
  body="$(printf '%s\n' "${raw}" | awk 'BEGIN{h=1} h && /^(\r)?$/{h=0; next} !h')"
  printf '%s\n' "${headers}" >"${mcp_dir}/list.headers"
  printf '%s\n' "${body}" >"${mcp_dir}/list.body"
  grep -Eq '^HTTP/[0-9.]+ 200' <<<"${headers}" || verify_mcp_drive_fail "tools/list was not HTTP 200"
  result="$(printf '%s\n' "${body}" | verify_mcp_jsonrpc_result)" \
    || verify_mcp_drive_fail "tools/list body is not a JSON-RPC result"
  listed="$(verify_mcp_tools_list_ok "${result}")" \
    || verify_mcp_drive_fail "tools/list did not return bootstrap, search, and get"
  printf '%s\n' "${listed}" >"${mcp_dir}/tools.json"
  if grep -Fq -- "${key}" "${mcp_dir}/list.headers" "${mcp_dir}/list.body" "${mcp_dir}/tools.json" "${mcp_dir}/request.txt"; then
    verify_mcp_drive_fail "mcp evidence contains the vault key"
  fi
  printf '%s\n' "mcp-client-round-trip" >"${mcp_dir}/feature-id"
  printf '%s\n' "HTTP MCP client POST /mcp tools/list on a throwaway vault. Listed bootstrap, search, and get." \
    >"${mcp_dir}/result.txt"
  echo "verify-mcp-drive: tools/list wrote ${evidence}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  verify_mcp_drive "${script_dir}/verify-foundation.sh"
fi
