#!/usr/bin/env bash
# Named proof receipt-model-calendar on a throwaway vault. Writes evidence.
# Does not print keys. MCP only. No new tool. Fixture ids only.
set -euo pipefail

verify_receipt_model_calendar_fail() {
  echo "verify-receipt-model-calendar: $*" >&2
  return 1
}

verify_receipt_model_calendar() {
  local helper evidence key_file
  helper="${1:-}"
  [[ -n "${helper}" && -f "${helper}" ]] || verify_receipt_model_calendar_fail "helper is missing"
  evidence="$("${helper}" evidence-dir)/receipt-model-calendar"
  mkdir -p -- "${evidence}"
  key_file="$("${helper}" key-file)"
  [[ -f "${key_file}" ]] || verify_receipt_model_calendar_fail "key file is missing"

  python3 - "${evidence}" "${key_file}" <<'PY'
import json
import pathlib
import sys
import urllib.request

evidence = pathlib.Path(sys.argv[1])
api_key = pathlib.Path(sys.argv[2]).read_text().strip()
mcp_url = "http://127.0.0.1:8787/mcp"
req_id = 0


def write(name, payload):
    path = evidence / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(payload, (dict, list)):
        text = json.dumps(payload, indent=2) + "\n"
    else:
        text = str(payload) + "\n"
    if api_key:
        text = text.replace(api_key, "<redacted>")
    path.write_text(text)


def mcp(method, params):
    global req_id
    req_id += 1
    payload = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}).encode()
    req = urllib.request.Request(
        mcp_url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"ApiKey {api_key}",
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
        },
    )
    with urllib.request.urlopen(req) as res:
        raw = res.read().decode()
    obj = None
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        for line in raw.splitlines():
            if line.startswith("data:"):
                obj = json.loads(line[5:].strip())
                break
    if not obj or obj.get("error"):
        raise SystemExit(f"mcp {method} failed")
    return obj["result"]


def as_object(result):
    if not isinstance(result, dict):
        return {}
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        return structured
    content = result.get("content")
    if isinstance(content, list) and content and isinstance(content[0], dict):
        text = content[0].get("text")
        if isinstance(text, str) and text:
            return json.loads(text)
    return result


def tool(name, arguments, allow_error=False):
    result = mcp("tools/call", {"name": name, "arguments": arguments})
    body = as_object(result)
    if result.get("isError") or body.get("error"):
        if allow_error:
            return body
        raise SystemExit(f"mcp {name} tool error: {body}")
    return body


listed = mcp("tools/list", {})
names = [row.get("name") for row in listed.get("tools", []) if isinstance(row, dict)]
write("tools-list.json", {"tool_count": len(names), "names": names})
if "upsert" not in names or "search" not in names or "delete" not in names:
    raise SystemExit(f"tools/list missing upsert/search/delete: {names}")

hold = tool(
    "upsert",
    {
        "type": "task",
        "title": "Receipt proof hold",
        "url": {"system": "calendar", "id": "evt-fixture-1"},
        "data": {"receipt": {"system": "calendar", "id": "evt-fixture-1", "kind": "booked"}},
    },
)
hold_id = hold["node"]["id"]
if hold["node"]["data"]["receipt"] != {
    "system": "calendar",
    "id": "evt-fixture-1",
    "kind": "booked",
}:
    raise SystemExit("hold booked receipt missing")

moved = tool(
    "upsert",
    {
        "id": hold_id,
        "type": "task",
        "title": "Receipt proof hold",
        "data": {"receipt": {"system": "calendar", "id": "evt-fixture-1", "kind": "moved"}},
        "base_updated_at": hold["node"]["updated_at"],
    },
)
if moved["node"]["data"]["receipt"]["kind"] != "moved":
    raise SystemExit("hold move did not patch kind")

hit = tool("search", {"receipt": {"system": "calendar", "id": "evt-fixture-1"}})
if not hit.get("nodes") or hit["nodes"][0]["id"] != hold_id:
    raise SystemExit("search receipt missed the hold")

got = tool("get", {"id": hold_id})
if got["node"]["data"]["receipt"]["kind"] != "moved":
    raise SystemExit("get did not show moved")

deleted = tool(
    "delete",
    {"id": hold_id, "base_updated_at": moved["node"]["updated_at"]},
)
if deleted.get("ok") is not True:
    raise SystemExit("delete hold failed")

host = tool(
    "upsert",
    {
        "type": "task",
        "title": "Receipt proof host",
        "url": {"system": "calendar", "id": "evt-fixture-1"},
        "data": {"receipt": {"system": "calendar", "id": "evt-fixture-1", "kind": "cleared"}},
    },
)
host_id = host["node"]["id"]
if host["node"]["data"]["receipt"]["kind"] != "cleared":
    raise SystemExit("host cleared receipt missing")

host_hit = tool("search", {"receipt": {"system": "calendar", "id": "evt-fixture-1"}})
if not host_hit.get("nodes") or host_hit["nodes"][0]["id"] != host_id:
    raise SystemExit("search receipt did not hit the host only")

twin = tool(
    "upsert",
    {
        "type": "task",
        "title": "Receipt proof twin",
        "data": {"receipt": {"system": "calendar", "id": "evt-fixture-1", "kind": "cleared"}},
    },
    allow_error=True,
)
if "already belongs to live node" not in str(twin.get("error", "")):
    raise SystemExit(f"twin did not refuse: {twin}")

split_hold = tool(
    "upsert",
    {
        "type": "task",
        "title": "Receipt proof split hold",
        "data": {"receipt": {"system": "calendar", "id": "evt-fixture-2", "kind": "booked"}},
    },
)
split_url = tool(
    "upsert",
    {
        "type": "task",
        "title": "Receipt proof split host",
        "url": {"system": "calendar", "id": "evt-fixture-2"},
    },
    allow_error=True,
)
if "belongs with live receipt owner" not in str(split_url.get("error", "")):
    raise SystemExit(f"split url did not refuse: {split_url}")

released = tool(
    "upsert",
    {
        "id": split_hold["node"]["id"],
        "type": "task",
        "title": "Receipt proof split hold",
        "data": {"receipt": None},
        "base_updated_at": split_hold["node"]["updated_at"],
    },
)
if released["node"]["data"].get("receipt") is not None:
    raise SystemExit("receipt null did not release the hold")

split_host = tool(
    "upsert",
    {
        "type": "task",
        "title": "Receipt proof split host",
        "url": {"system": "calendar", "id": "evt-fixture-2"},
        "data": {"receipt": {"system": "calendar", "id": "evt-fixture-2", "kind": "cleared"}},
    },
)
if split_host["node"]["data"]["receipt"]["kind"] != "cleared":
    raise SystemExit("released hold did not let host take cleared")

draft = tool(
    "upsert",
    {
        "type": "task",
        "title": "Receipt proof draft",
        "data": {"receipt": {"system": "gmail", "id": "msg-fixture-draft-1", "kind": "drafted"}},
    },
)
sent = tool(
    "upsert",
    {
        "id": draft["node"]["id"],
        "type": "task",
        "title": "Receipt proof draft",
        "data": {"receipt": {"system": "gmail", "id": "msg-fixture-sent-1", "kind": "sent"}},
        "base_updated_at": draft["node"]["updated_at"],
    },
)
if sent["node"]["data"]["receipt"] != {
    "system": "gmail",
    "id": "msg-fixture-sent-1",
    "kind": "sent",
}:
    raise SystemExit("drafted did not patch to sent")

existing_cleared = tool(
    "upsert",
    {
        "type": "task",
        "title": "Receipt proof existing cleared",
        "data": {"receipt": {"system": "calendar", "id": "evt-fixture-cleared-1", "kind": "cleared"}},
    },
)
if existing_cleared["node"]["data"]["receipt"]["kind"] != "cleared":
    raise SystemExit("existing calendar/cleared fixture failed")

unpaired = tool(
    "upsert",
    {
        "type": "task",
        "title": "Receipt proof unpaired",
        "data": {"receipt": {"system": "calendar", "id": "evt-fixture-1", "kind": "sent"}},
    },
    allow_error=True,
)
if "does not pair" not in str(unpaired.get("error", "")):
    raise SystemExit(f"unpaired calendar/sent did not refuse: {unpaired}")

unknown = tool(
    "upsert",
    {
        "type": "task",
        "title": "Receipt proof unknown draft",
        "data": {"receipt": {"system": "gmail", "id": "msg-1", "kind": "draft"}},
    },
    allow_error=True,
)
if "Unknown receipt.kind" not in str(unknown.get("error", "")):
    raise SystemExit(f"unknown draft token did not refuse: {unknown}")

write(
    "result.json",
    {
        "hold_id": hold_id,
        "host_id": host_id,
        "sent_id": sent["node"]["id"],
        "kinds": ["drafted", "sent", "booked", "moved", "cleared"],
        "same_node_refuse": True,
        "deleted_hold_then_host_cleared": True,
    },
)
write(
    "result.txt",
    "receipt-model-calendar: booked/moved on hold, delete hold, host cleared, twin refuse, "
    "split refuse then release, drafted to sent, unpaired and unknown draft refuse.",
)
print("verify-receipt-model-calendar: ok")
PY
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  verify_receipt_model_calendar "${script_dir}/verify-foundation.sh"
fi
