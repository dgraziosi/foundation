#!/usr/bin/env bash
# Offline export/import fixtures. No live vault. Does not print keys.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
export_sh="${script_dir}/foundation-export.sh"
import_sh="${script_dir}/foundation-import.sh"
lib_py="${script_dir}/lib/foundation_portability.py"
load_sh="${script_dir}/lib/load-foundation-api-key.sh"

fail() {
  echo "foundation-portability.test: $*" >&2
  exit 1
}

bash -n "${export_sh}"
bash -n "${import_sh}"
bash -n "${load_sh}"
python3 -m py_compile "${lib_py}"

if grep -Eiq -- 'docker|compose exec' "${export_sh}" "${import_sh}" "${lib_py}"; then
  fail "portability must talk to localhost MCP, not compose exec"
fi

if grep -En -- 'tools/list|"name": "(export|import)"' "${lib_py}" | grep -E -- '"name": "(export|import)"' >/dev/null; then
  fail "must not advertise inventoriable MCP tools named export or import"
fi

if ! grep -Fq -- 'WRITE_TOOLS = frozenset({"upsert"})' "${lib_py}"; then
  fail "import must write only through MCP upsert"
fi
if ! grep -Fq -- 'idempotency_key' "${lib_py}"; then
  fail "import must use upsert idempotency_key"
fi
if ! grep -Fq -- '"allow_duplicate": True' "${lib_py}"; then
  fail "import create must pass allow_duplicate so shared titles do not abort"
fi
if ! grep -Fq -- 'import_ref' "${lib_py}"; then
  fail "import must store a stable import_ref on data"
fi
if grep -E -- 'data\.(url|repo|receipt)' "${lib_py}" | grep -v 'url", "repo", "receipt"' >/dev/null; then
  :
fi
if grep -Eq -- '["'\''](living|origin)["'\'']' "${lib_py}"; then
  fail "must not invent a leftover identity bag"
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/foundation-portability-test.XXXXXX")"
trap 'rm -rf -- "${work}"' EXIT

obsidian="${work}/obsidian"
mkdir -p "${obsidian}/Notes"
cat >"${obsidian}/Notes/Export proof note.md" <<'MD'
---
mood: calm
---

# Export proof note

Body of the Obsidian fixture note.
MD
cat >"${obsidian}/Notes/Aliases fixture.md" <<'MD'
---
aliases: Other name
---

# Aliases fixture

Note with a scalar aliases field.
MD
cat >"${obsidian}/Notes/Quoted aliases fixture.md" <<'MD'
---
aliases: ["Quoted alias"]
---

# Quoted aliases fixture

Note with a JSON-array aliases field.
MD
cat >"${obsidian}/2026-09-14.md" <<'MD'
# 2026-09-14

Daily note body.
MD

notion="${work}/notion"
mkdir -p "${notion}"
cat >"${notion}/Notion fixture page.html" <<'HTML'
<html><head><title>Notion fixture page</title></head>
<body><h1>Notion fixture page</h1><p>Notion body text.</p></body></html>
HTML

apple="${work}/apple"
mkdir -p "${apple}"
cat >"${apple}/Apple Notes fixture.md" <<'MD'
# Apple Notes fixture

Apple note body.
MD

tasks_json="${work}/tasks.json"
cat >"${tasks_json}" <<'JSON'
{
  "kind": "tasks#tasks",
  "items": [
    {
      "id": "gtask-1",
      "title": "Google Tasks fixture",
      "status": "needsAction",
      "due": "2026-09-20T00:00:00.000Z"
    },
    {
      "id": "gtask-2",
      "title": "Google Tasks done",
      "status": "completed"
    }
  ]
}
JSON

tasks_csv="${work}/tasks.csv"
cat >"${tasks_csv}" <<'CSV'
title,status,due
Google Tasks csv,completed,2026-09-21
CSV

obsidian_drafts="$(python3 "${lib_py}" import --from obsidian --source "${obsidian}" --print-drafts)"
python3 -c '
import json, sys
drafts = json.loads(sys.argv[1])
if len(drafts) != 4:
    raise SystemExit(f"obsidian draft count {len(drafts)}")
by_title = {row["title"]: row for row in drafts}
note = by_title["Export proof note"]
if note["type"] != "note":
    raise SystemExit("obsidian note type")
if "Body of the Obsidian fixture note." not in note["body"]:
    raise SystemExit("obsidian body")
if note["data"].get("mood") != "calm":
    raise SystemExit("obsidian frontmatter")
if note["data"].get("import_ref") != "obsidian:Notes/Export proof note.md":
    raise SystemExit("obsidian import_ref")
if not note["idempotency_key"].startswith("imp:obsidian:"):
    raise SystemExit("obsidian idempotency_key")
aliases_note = by_title["Aliases fixture"]
if aliases_note["data"].get("aliases") != ["Other name"]:
    raise SystemExit("obsidian scalar aliases")
quoted = by_title["Quoted aliases fixture"]
if quoted["data"].get("aliases") != ["Quoted alias"]:
    raise SystemExit("obsidian array aliases")
journal = by_title["2026-09-14"]
if journal["type"] != "journal":
    raise SystemExit("daily note should be journal")
again = json.loads(sys.argv[2])
first = {row["source_ref"]: row["idempotency_key"] for row in drafts}
second = {row["source_ref"]: row["idempotency_key"] for row in again}
if first != second:
    raise SystemExit("obsidian keys must be stable")
' "${obsidian_drafts}" "$(python3 "${lib_py}" import --from obsidian --source "${obsidian}" --print-drafts)" \
  || fail "obsidian drafts"

notion_drafts="$(python3 "${lib_py}" import --from notion --source "${notion}" --print-drafts)"
python3 -c '
import json, sys
drafts = json.loads(sys.argv[1])
if len(drafts) != 1:
    raise SystemExit("notion count")
row = drafts[0]
if row["type"] != "note" or row["title"] != "Notion fixture page":
    raise SystemExit("notion title/type")
if "Notion body text." not in row["body"]:
    raise SystemExit("notion body")
' "${notion_drafts}" || fail "notion drafts"

apple_drafts="$(python3 "${lib_py}" import --from apple-notes --source "${apple}" --print-drafts)"
python3 -c '
import json, sys
drafts = json.loads(sys.argv[1])
if drafts[0]["title"] != "Apple Notes fixture":
    raise SystemExit("apple title")
if "Apple note body." not in drafts[0]["body"]:
    raise SystemExit("apple body")
if drafts[0]["type"] != "note":
    raise SystemExit("apple type")
' "${apple_drafts}" || fail "apple drafts"

tasks_drafts="$(python3 "${lib_py}" import --from google-tasks --source "${tasks_json}" --print-drafts)"
python3 -c '
import json, sys
drafts = json.loads(sys.argv[1])
if len(drafts) != 2:
    raise SystemExit("tasks count")
by_title = {row["title"]: row for row in drafts}
open_task = by_title["Google Tasks fixture"]
if open_task["type"] != "task":
    raise SystemExit("task type")
if open_task["status"] != "active":
    raise SystemExit("task status")
if open_task["data"].get("due") != "2026-09-20":
    raise SystemExit("task due")
done = by_title["Google Tasks done"]
if done["status"] != "completed":
    raise SystemExit("completed status")
' "${tasks_drafts}" || fail "google tasks json"

csv_drafts="$(python3 "${lib_py}" import --from google-tasks --source "${tasks_csv}" --print-drafts)"
python3 -c '
import json, sys
drafts = json.loads(sys.argv[1])
if drafts[0]["title"] != "Google Tasks csv":
    raise SystemExit("csv title")
if drafts[0]["data"].get("due") != "2026-09-21":
    raise SystemExit("csv due")
if drafts[0]["status"] != "completed":
    raise SystemExit("csv status")
' "${csv_drafts}" || fail "google tasks csv"

snapshot="${work}/snapshot.json"
cat >"${snapshot}" <<'JSON'
{
  "format": "foundation-export",
  "version": 1,
  "include_deleted": false,
  "ontology": {
    "types": [
      {
        "slug": "note",
        "label": "Note",
        "fields": []
      },
      {
        "slug": "task",
        "label": "Task",
        "fields": [{"name": "due", "kind": "date"}]
      }
    ],
    "relations": []
  },
  "nodes": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "type": "note",
      "title": "Export proof note",
      "status": "active",
      "updated_at": "2026-09-14T00:00:00.000Z",
      "data": {},
      "payload": {"media_type": "text/markdown", "storage": "inline", "body": "Proof body."}
    },
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "type": "task",
      "title": "Export proof task",
      "status": "active",
      "updated_at": "2026-09-14T00:00:00.000Z",
      "data": {"due": "2026-09-15"},
      "payload": {"media_type": "text/markdown", "storage": "inline", "body": ""}
    },
    {
      "id": "33333333-3333-3333-3333-333333333333",
      "type": "note",
      "title": "Blob note",
      "status": "active",
      "updated_at": "2026-09-14T00:00:00.000Z",
      "data": {},
      "payload": {"media_type": "application/pdf", "storage": "blob", "blob_id": "44444444-4444-4444-4444-444444444444"}
    }
  ],
  "edges": [
    {
      "id": "55555555-5555-5555-5555-555555555555",
      "relation_type": "about",
      "from_id": "11111111-1111-1111-1111-111111111111",
      "to_id": "22222222-2222-2222-2222-222222222222"
    }
  ]
}
JSON

out="${work}/out"
python3 "${lib_py}" export --out "${out}" --from-snapshot "${snapshot}" >/dev/null
[[ -f "${out}/foundation.json" ]] || fail "missing foundation.json"
[[ -f "${out}/markdown/note/export-proof-note-11111111.md" ]] || fail "missing note markdown"
[[ -f "${out}/csv/note.csv" ]] || fail "missing note.csv"
[[ -f "${out}/csv/task.csv" ]] || fail "missing task.csv"

python3 -c '
import csv, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
snap = json.loads((root / "foundation.json").read_text())
if snap["format"] != "foundation-export":
    raise SystemExit("json format")
if len(snap["nodes"]) != 3:
    raise SystemExit("json nodes")
if snap["edges"][0]["relation_type"] != "about":
    raise SystemExit("json edges")
md = (root / "markdown/note/export-proof-note-11111111.md").read_text()
if "# Export proof note" not in md:
    raise SystemExit("md title")
if "Proof body." not in md:
    raise SystemExit("md body")
blob = next(root.joinpath("markdown/note").glob("blob-note-*.md")).read_text()
if "blob_id:" not in blob:
    raise SystemExit("blob id missing")
if "secret" in blob.lower() and "sk-" in blob:
    raise SystemExit("blob leaked a key")
with (root / "csv/task.csv").open(newline="") as handle:
    rows = list(csv.DictReader(handle))
if rows[0]["title"] != "Export proof task":
    raise SystemExit("csv title")
if rows[0]["due"] != "2026-09-15":
    raise SystemExit("csv due")
header = list(csv.DictReader((root / "csv/note.csv").open(newline="")).fieldnames or [])
if header[:4] != ["id", "title", "status", "updated_at"]:
    raise SystemExit("csv header")
' "${out}" || fail "export writers"

echo "foundation-portability.test: ok"
