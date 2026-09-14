#!/usr/bin/env bash
# Named proof home-digest-33 over HTTP. Writes evidence. Does not print keys.
set -euo pipefail

verify_home_digest() {
  local helper evidence
  helper="${1:-}"
  [[ -n "${helper}" && -f "${helper}" ]] || {
    echo "verify-home-digest: helper is missing" >&2
    return 1
  }
  evidence="$("${helper}" evidence-dir)"
  python3 - "${evidence}" "$("${helper}" view-key-file)" "$("${helper}" key-file)" <<'PY'
import http.cookiejar
import json
import pathlib
import sys
import urllib.error
import urllib.request

evidence = pathlib.Path(sys.argv[1]) / "home-digest-33"
view_key = pathlib.Path(sys.argv[2]).read_text().strip()
api_key = pathlib.Path(sys.argv[3]).read_text().strip()
evidence.mkdir(parents=True, exist_ok=True)
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def write(name, payload):
    path = evidence / name
    if isinstance(payload, (dict, list)):
        path.write_text(json.dumps(payload, indent=2) + "\n")
    else:
        path.write_text(str(payload) + "\n")

def http(url, *, method="GET", headers=None, body=None):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with opener.open(req) as res:
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

def digest_titles(body):
    return [row.get("title") for row in body.get("rows", [])]

tools = mcp("tools/list", {})
names = [row.get("name") for row in tools.get("tools", []) if isinstance(row, dict)]
write("tools-list.json", {"tool_count": len(names), "names": names})
if len(names) != 16 or "merge" not in names:
    raise SystemExit(f"tools/list count {len(names)} names={names}")

unlock_status, unlock = http(
    "http://127.0.0.1:8788/view/unlock",
    method="POST",
    headers={"content-type": "application/json", "accept": "application/json"},
    body=json.dumps({"api_key": view_key}).encode(),
)
if unlock_status != 200 or unlock.get("ok") is not True:
    raise SystemExit(f"unlock was {unlock_status}: {unlock}")

view_auth = {"Authorization": f"ApiKey {view_key}", "accept": "application/json"}
status, first = http("http://127.0.0.1:8788/view/api/digest", headers=view_auth)
write("digest-first.json", first)
if status != 200:
    raise SystemExit(f"first digest was {status}: {first}")
if first.get("rows") != []:
    raise SystemExit("first Home look should be empty on a first-day vault")

upserted = mcp(
    "tools/call",
    {"name": "upsert", "arguments": {"type": "note", "title": "Digest proof note"}},
    2,
)
node = tool_node(upserted)
if not node or not node.get("id"):
    raise SystemExit(f"upsert missing node: {upserted}")
node_id = node["id"]
write("bot-create.json", {"id": node_id, "title": node.get("title")})

status, after_bot = http("http://127.0.0.1:8788/view/api/digest", headers=view_auth)
write("digest-after-bot.json", after_bot)
if status != 200:
    raise SystemExit(f"digest after bot was {status}: {after_bot}")
if digest_titles(after_bot) != ["Digest proof note"]:
    raise SystemExit(f"digest missing bot title: {after_bot}")
if after_bot["rows"][0].get("actor") == "user":
    raise SystemExit("bot row stamped actor=user")
if after_bot["rows"][0].get("target_id") != node_id:
    raise SystemExit("bot row target mismatch")

status, empty = http("http://127.0.0.1:8788/view/api/digest", headers=view_auth)
write("digest-empty.json", empty)
if status != 200 or empty.get("rows") != []:
    raise SystemExit(f"second look was not empty: {empty}")

status, saved = http(
    f"http://127.0.0.1:8788/view/api/nodes/{node_id}",
    method="PATCH",
    headers={**view_auth, "content-type": "application/json"},
    body=json.dumps({"title": "Digest user edit", "base_updated_at": node["updated_at"]}).encode(),
)
write("user-edit.json", saved)
if status != 200 or saved["node"]["title"] != "Digest user edit":
    raise SystemExit(f"user edit was {status}: {saved}")

status, after_user = http("http://127.0.0.1:8788/view/api/digest", headers=view_auth)
write("digest-after-user.json", after_user)
if status != 200 or after_user.get("rows") != []:
    raise SystemExit(f"user write appeared in digest: {after_user}")

updated = mcp(
    "tools/call",
    {
        "name": "upsert",
        "arguments": {
            "id": node_id,
            "type": "note",
            "title": "Digest bot again",
            "base_updated_at": saved["node"]["updated_at"],
        },
    },
    3,
)
again = tool_node(updated)
if not again:
    raise SystemExit(f"bot update missing node: {updated}")
write("bot-update.json", {"id": again.get("id"), "title": again.get("title")})

status, after_again = http("http://127.0.0.1:8788/view/api/digest", headers=view_auth)
write("digest-after-bot-update.json", after_again)
if status != 200 or digest_titles(after_again) != ["Digest bot again"]:
    raise SystemExit(f"digest missing bot update: {after_again}")

status, detail = http(f"http://127.0.0.1:8788/view/api/nodes/{node_id}", headers=view_auth)
write("detail.json", {"status": status, "title": detail.get("node", {}).get("title"), "id": detail.get("node", {}).get("id")})
if status != 200 or detail["node"]["id"] != node_id or detail["node"]["title"] != "Digest bot again":
    raise SystemExit(f"detail open failed: {status} {detail}")

status, recents = http("http://127.0.0.1:8788/view/api/recents?limit=5", headers=view_auth)
status_tasks, tasks = http("http://127.0.0.1:8788/view/api/tasks?limit=5", headers=view_auth)
status_today, today = http("http://127.0.0.1:8788/view/api/journals/today", headers=view_auth)
write(
    "other-widgets.json",
    {"recents_status": status, "tasks_status": status_tasks, "today_status": status_today},
)
if status != 200 or status_tasks != 200 or status_today != 200:
    raise SystemExit("Home Recents, Open tasks, or Today peek failed")

write("feature-id", "home-digest-33")
write(
    "result.txt",
    "Home digest first look empty, bot upsert listed, second look Nothing new, Viewer user write omitted, click target opens detail, tools/list 16 including merge.",
)
print("verify-home-digest: ok")
PY
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  verify_home_digest "${script_dir}/verify-foundation.sh"
fi
