#!/usr/bin/env bash
# Named proof export-import-45 on a throwaway vault. Writes evidence.
# Does not print keys. Host scripts only. No new MCP tool.
set -euo pipefail

verify_export_import_45_fail() {
  echo "verify-export-import-45: $*" >&2
  return 1
}

verify_export_import_45() {
  local helper evidence key_file view_key_file repo_root fixtures export_dir
  helper="${1:-}"
  [[ -n "${helper}" && -f "${helper}" ]] || verify_export_import_45_fail "helper is missing"
  evidence="$("${helper}" evidence-dir)/export-import-45"
  mkdir -p -- "${evidence}"
  key_file="$("${helper}" key-file)"
  view_key_file="$("${helper}" view-key-file)"
  [[ -f "${key_file}" ]] || verify_export_import_45_fail "key file is missing"
  repo_root="$(cd "$(dirname -- "${helper}")/../../../.." && pwd)"
  fixtures="${evidence}/fixtures"
  export_dir="${evidence}/export"
  mkdir -p -- "${fixtures}/obsidian" "${fixtures}/notion" "${fixtures}/apple-notes"

  python3 - "${evidence}" "${key_file}" "${view_key_file}" "${repo_root}" "${fixtures}" "${export_dir}" <<'PY'
import json
import pathlib
import subprocess
import sys
import urllib.request

evidence = pathlib.Path(sys.argv[1])
api_key = pathlib.Path(sys.argv[2]).read_text().strip()
view_key = pathlib.Path(sys.argv[3]).read_text().strip()
repo = pathlib.Path(sys.argv[4])
fixtures = pathlib.Path(sys.argv[5])
export_dir = pathlib.Path(sys.argv[6])
mcp_url = "http://127.0.0.1:8787/mcp"


def write(name, payload):
    path = evidence / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(payload, (dict, list)):
        text = json.dumps(payload, indent=2) + "\n"
    else:
        text = str(payload) + "\n"
    if api_key:
        text = text.replace(api_key, "<redacted>")
    if view_key:
        text = text.replace(view_key, "<redacted>")
    path.write_text(text)


def mcp(method, params, req_id=1):
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
    result = obj["result"]
    if result.get("isError"):
        raise SystemExit(f"mcp {method} tool error")
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        return structured
    content = result.get("content")
    if isinstance(content, list) and content and isinstance(content[0], dict):
        text = content[0].get("text")
        if isinstance(text, str) and text:
            return json.loads(text)
    return result


def tool(name, arguments, req_id=1):
    return mcp("tools/call", {"name": name, "arguments": arguments}, req_id)


def search_titles(query):
    page = tool("search", {"query": query, "limit": 20})
    nodes = page.get("nodes") or []
    return [row.get("title") for row in nodes if isinstance(row, dict)]


listed = mcp("tools/list", {})
names = [row.get("name") for row in listed.get("tools", []) if isinstance(row, dict)]
write("tools-list.json", {"tool_count": len(names), "names": names})
if len(names) != 16 or "merge" not in names:
    raise SystemExit(f"tools/list expected 16 including merge, got {names}")
if "export" in names or "import" in names:
    raise SystemExit("inventoriable export/import tools appeared")

seed_note = tool(
    "upsert",
    {
        "type": "note",
        "title": "Export proof note",
        "payload": {
            "media_type": "text/markdown",
            "storage": "inline",
            "body": "Seed body for export.",
        },
        "idempotency_key": "export-import-45-seed-note",
    },
    10,
)
seed_task = tool(
    "upsert",
    {
        "type": "task",
        "title": "Export proof task",
        "data": {"due": "2026-09-16"},
        "idempotency_key": "export-import-45-seed-task",
    },
    11,
)
write(
    "seed.json",
    {
        "note": (seed_note.get("node") or {}).get("title"),
        "task": (seed_task.get("node") or {}).get("title"),
    },
)

export_sh = repo / "scripts/foundation-export.sh"
import_sh = repo / "scripts/foundation-import.sh"
env = {"FOUNDATION_API_KEY": api_key, "PATH": __import__("os").environ.get("PATH", "")}
completed = subprocess.run(
    [str(export_sh), "--out", str(export_dir)],
    check=True,
    capture_output=True,
    text=True,
    env=env,
)
write("export-summary.json", json.loads(completed.stdout or "{}"))
if not (export_dir / "foundation.json").is_file():
    raise SystemExit("export missing foundation.json")
md_files = list((export_dir / "markdown").rglob("*.md"))
csv_files = list((export_dir / "csv").glob("*.csv"))
if not md_files:
    raise SystemExit("export missing markdown")
if not csv_files:
    raise SystemExit("export missing csv")
write(
    "export-layout.json",
    {
        "json": True,
        "markdown_files": [str(path.relative_to(export_dir)) for path in md_files],
        "csv_files": [path.name for path in csv_files],
    },
)

obsidian = fixtures / "obsidian"
obsidian.mkdir(parents=True, exist_ok=True)
(obsidian / "Obsidian fixture one.md").write_text(
    "---\nmood: fixture\n---\n# Obsidian fixture one\n\nObsidian one body.\n",
    encoding="utf-8",
)
(obsidian / "Obsidian fixture two.md").write_text(
    "# Obsidian fixture two\n\nObsidian two body.\n",
    encoding="utf-8",
)
(fixtures / "notion" / "Notion fixture page.md").write_text(
    "# Notion fixture page\n\nNotion body.\n",
    encoding="utf-8",
)
(fixtures / "apple-notes" / "Apple Notes fixture.md").write_text(
    "# Apple Notes fixture\n\nApple body.\n",
    encoding="utf-8",
)
(fixtures / "google-tasks.json").write_text(
    json.dumps(
        {
            "items": [
                {
                    "id": "gt-45-1",
                    "title": "Google Tasks fixture",
                    "status": "needsAction",
                    "due": "2026-09-20T00:00:00.000Z",
                }
            ]
        }
    )
    + "\n",
    encoding="utf-8",
)

before_obsidian = search_titles("Obsidian fixture one")
dry = subprocess.run(
    [str(import_sh), "--from", "obsidian", "--source", str(obsidian), "--dry-run"],
    check=True,
    capture_output=True,
    text=True,
    env=env,
)
write("obsidian-dry-run.json", json.loads(dry.stdout or "{}"))
after_dry = search_titles("Obsidian fixture one")
if after_dry != before_obsidian:
    raise SystemExit("dry_run wrote nodes")

first = subprocess.run(
    [str(import_sh), "--from", "obsidian", "--source", str(obsidian)],
    check=True,
    capture_output=True,
    text=True,
    env=env,
)
write("obsidian-import.json", json.loads(first.stdout or "{}"))
obsidian_hits = search_titles("Obsidian fixture")
if "Obsidian fixture one" not in obsidian_hits or "Obsidian fixture two" not in obsidian_hits:
    raise SystemExit(f"obsidian search missed titles: {obsidian_hits}")
count_one = sum(1 for title in search_titles("Obsidian fixture one") if title == "Obsidian fixture one")

second = subprocess.run(
    [str(import_sh), "--from", "obsidian", "--source", str(obsidian)],
    check=True,
    capture_output=True,
    text=True,
    env=env,
)
write("obsidian-reimport.json", json.loads(second.stdout or "{}"))
count_one_again = sum(
    1 for title in search_titles("Obsidian fixture one") if title == "Obsidian fixture one"
)
if count_one_again != count_one or count_one_again != 1:
    raise SystemExit(f"obsidian reimport twinned: {count_one} -> {count_one_again}")

for adapter, source, title, expected_type in (
    ("notion", fixtures / "notion", "Notion fixture page", "note"),
    ("apple-notes", fixtures / "apple-notes", "Apple Notes fixture", "note"),
    ("google-tasks", fixtures / "google-tasks.json", "Google Tasks fixture", "task"),
):
    ran = subprocess.run(
        [str(import_sh), "--from", adapter, "--source", str(source)],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    write(f"{adapter}-import.json", json.loads(ran.stdout or "{}"))
    page = tool("search", {"query": title, "type": expected_type, "limit": 10})
    hits = [row for row in page.get("nodes") or [] if row.get("title") == title]
    if not hits:
        raise SystemExit(f"{adapter} search missed {title}")
    got = tool("get", {"id": hits[0]["id"]})
    node = got.get("node") or {}
    if node.get("type") != expected_type:
        raise SystemExit(f"{adapter} type {node.get('type')}")
    if expected_type == "task" and (node.get("data") or {}).get("due") != "2026-09-20":
        raise SystemExit("google-tasks due missing")
    write(f"{adapter}-get.json", {"id": node.get("id"), "type": node.get("type"), "title": node.get("title")})

session_req = urllib.request.Request(
    "http://127.0.0.1:8788/view/api/session",
    headers={"Authorization": f"ApiKey {view_key}"},
)
digest_req = urllib.request.Request(
    "http://127.0.0.1:8788/view/api/digest",
    headers={"Authorization": f"ApiKey {view_key}"},
)
today_req = urllib.request.Request(
    "http://127.0.0.1:8788/view/api/journals/today",
    headers={"Authorization": f"ApiKey {view_key}"},
)
surfaces = {}
for label, request in (
    ("session", session_req),
    ("digest", digest_req),
    ("today", today_req),
):
    with urllib.request.urlopen(request) as res:
        surfaces[label] = {"status": res.status, "ok": res.status == 200}
if surfaces["session"]["status"] != 200:
    raise SystemExit("Home session failed")
if surfaces["digest"]["status"] != 200:
    raise SystemExit("Home digest failed")
if surfaces["today"]["status"] != 200:
    raise SystemExit("Today peek failed")
write("viewer-surfaces.json", surfaces)
write("feature-id", "export-import-45")
write(
    "result.txt",
    "Host export wrote JSON + Markdown + CSV. Obsidian dry_run wrote nothing. "
    "Obsidian import created two notes and a re-run did not twin. "
    "Notion, Apple Notes, and Google Tasks adapters created live records. "
    "tools/list stayed 16 including merge. Home digest / Today still loaded.",
)
print("verify-export-import-45: wrote", evidence)
PY
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  verify_export_import_45 "${script_dir}/verify-foundation.sh"
fi
