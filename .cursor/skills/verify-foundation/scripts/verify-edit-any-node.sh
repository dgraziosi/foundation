#!/usr/bin/env bash
# Named proof edit-any-node-31 over HTTP. Writes evidence. Does not print keys.
set -euo pipefail

verify_edit_any_node() {
  local helper evidence
  helper="${1:-}"
  [[ -n "${helper}" && -f "${helper}" ]] || {
    echo "verify-edit-any-node: helper is missing" >&2
    return 1
  }
  evidence="$("${helper}" evidence-dir)"
  python3 - "${evidence}" "$("${helper}" view-key-file)" "$("${helper}" key-file)" <<'PY'
import json, pathlib, sys, urllib.error, urllib.request

evidence = pathlib.Path(sys.argv[1]) / "edit-any-node-31"
view_key = pathlib.Path(sys.argv[2]).read_text().strip()
api_key = pathlib.Path(sys.argv[3]).read_text().strip()
evidence.mkdir(parents=True, exist_ok=True)

def write(name, payload):
    path = evidence / name
    if isinstance(payload, (dict, list)):
        path.write_text(json.dumps(payload, indent=2) + "\n")
    else:
        path.write_text(str(payload) + "\n")

def http(url, *, method="GET", headers=None, body=None):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read()
            return res.status, json.loads(raw.decode() or "{}")
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            parsed = json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            parsed = {"error": raw.decode()}
        return err.code, parsed

def mcp(method, params, req_id=1):
    payload = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:8787/mcp",
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
        raise SystemExit(f"mcp {method} failed: {raw[:400]}")
    return obj["result"]

def tool_node(result):
    structured = result.get("structuredContent") or {}
    node = structured.get("node")
    if node:
        return node
    for item in result.get("content", []):
        if item.get("type") == "text":
            parsed = json.loads(item["text"])
            if parsed.get("node"):
                return parsed["node"]
    return None

tools = mcp("tools/list", {})
names = [row.get("name") for row in tools.get("tools", []) if isinstance(row, dict)]
write("tools-list.json", {"tool_count": len(names), "names": names})
if len(names) != 16 or "merge" not in names:
    raise SystemExit(f"tools/list count {len(names)} names={names}")

upserted = mcp(
    "tools/call",
    {"name": "upsert", "arguments": {"type": "person", "title": "Proof Ada", "status": "active", "data": {"org": "Labs"}}},
    2,
)
node = tool_node(upserted)
if not node or not node.get("id"):
    raise SystemExit(f"upsert missing node: {upserted}")
node_id = node["id"]
base = node["updated_at"]
write("created.json", {"id": node_id, "title": node.get("title"), "status": node.get("status")})

auth = {"Authorization": f"ApiKey {view_key}", "content-type": "application/json"}
status, saved = http(
    f"http://127.0.0.1:8788/view/api/nodes/{node_id}",
    method="PATCH",
    headers=auth,
    body=json.dumps(
        {
            "title": "Ada Lovelace",
            "status": "completed",
            "data": {"org": "College"},
            "base_updated_at": base,
        }
    ).encode(),
)
write("save.json", saved)
if status != 200:
    raise SystemExit(f"save was {status}: {saved}")
if (
    saved["node"]["title"] != "Ada Lovelace"
    or saved["node"]["status"] != "completed"
    or saved["node"]["data"].get("org") != "College"
):
    raise SystemExit("save did not persist title/status/org")

status, clash = http(
    f"http://127.0.0.1:8788/view/api/nodes/{node_id}",
    method="PATCH",
    headers=auth,
    body=json.dumps(
        {
            "title": "Should not land",
            "status": "archived",
            "data": {"org": "Clobber"},
            "base_updated_at": base,
        }
    ).encode(),
)
write("clash.json", clash)
if status != 409:
    raise SystemExit(f"clash was {status}, want 409")
status, still = http(
    f"http://127.0.0.1:8788/view/api/nodes/{node_id}",
    headers={"Authorization": f"ApiKey {view_key}"},
)
if still["node"]["title"] != "Ada Lovelace":
    raise SystemExit("clash clobbered the title")

status, activity = http(
    f"http://127.0.0.1:8788/view/api/nodes/{node_id}/activity",
    headers={"Authorization": f"ApiKey {view_key}"},
)
write("activity.json", activity)
row = next((item for item in activity.get("rows", []) if item.get("action") == "update" and item.get("can_undo")), None)
if not row:
    raise SystemExit("no undoable update row")

status, undone = http(
    f"http://127.0.0.1:8788/view/api/activity/{row['id']}/undo",
    method="POST",
    headers=auth,
    body=json.dumps({"base_updated_at": row["base_updated_at"]}).encode(),
)
write("undo.json", undone)
if status != 200:
    raise SystemExit(f"undo was {status}: {undone}")
if undone["node"]["title"] != "Proof Ada" or undone["node"]["data"].get("org") != "Labs":
    raise SystemExit("undo did not restore title/org")

status, removed = http(
    f"http://127.0.0.1:8788/view/api/nodes/{node_id}",
    method="DELETE",
    headers=auth,
    body=json.dumps({"base_updated_at": undone["node"]["updated_at"]}).encode(),
)
write("delete.json", removed)
if status != 200:
    raise SystemExit(f"delete was {status}: {removed}")

status, recents = http(
    "http://127.0.0.1:8788/view/api/recents",
    headers={"Authorization": f"ApiKey {view_key}"},
)
write("recents-after-delete.json", recents)
if any(item.get("id") == node_id for item in recents.get("rows", [])):
    raise SystemExit("deleted node still in recents")

status, trash = http("http://127.0.0.1:8788/view/api/trash", headers={"Authorization": f"ApiKey {view_key}"})
write("trash.json", trash)
dumped = next((item for item in trash.get("rows", []) if item.get("id") == node_id), None)
if not dumped:
    raise SystemExit("deleted node missing from trash")

status, restored = http(
    f"http://127.0.0.1:8788/view/api/nodes/{node_id}/restore",
    method="POST",
    headers=auth,
    body=json.dumps({"base_updated_at": dumped["updated_at"]}).encode(),
)
write("restore.json", restored)
if status != 200 or restored["node"]["title"] != "Proof Ada":
    raise SystemExit(f"restore was {status}: {restored}")

status, today = http("http://127.0.0.1:8788/view/api/journals/today", method="POST", headers=auth)
write("journal-today.json", today)
if status != 200 or today["node"]["type"] != "journal":
    raise SystemExit(f"journal today was {status}")
status, journal = http(
    f"http://127.0.0.1:8788/view/api/nodes/{today['node']['id']}",
    method="PATCH",
    headers=auth,
    body=json.dumps(
        {
            "title": "Proof morning",
            "body": "Wrote today.\n",
            "base_updated_at": today["node"]["updated_at"],
        }
    ).encode(),
)
write("journal-save.json", journal)
if status != 200 or journal["node"]["title"] != "Proof morning":
    raise SystemExit(f"journal save was {status}")

write("feature-id", "edit-any-node-31")
write(
    "result.txt",
    "HTTP any-node edit, clash, activity undo, trash restore, journal Today, tools/list 16 including merge.",
)
print("verify-edit-any-node: ok")
PY
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  verify_edit_any_node "${script_dir}/verify-foundation.sh"
fi
