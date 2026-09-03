#!/usr/bin/env bash
# Classifier fixtures and write-guard. No live vault.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
drift_sh="${script_dir}/drift-read.sh"
drift_py="${script_dir}/drift-read.py"

fail() {
  echo "drift-read.test: $*" >&2
  exit 1
}

bash -n "${drift_sh}"
python3 -m py_compile "${drift_py}"

if grep -Eiq -- 'docker|compose exec' "${drift_sh}" "${drift_py}"; then
  fail "drift-read must talk to localhost MCP, not compose exec"
fi

write_hits="$(
  grep -En -- \
    'mcp_call\([^)]*"(upsert|delete|link|unlink|undo|manage_type|manage_relation)"|"name": "(upsert|delete|link|unlink|undo|manage_type|manage_relation)"' \
    "${drift_py}" || true
)"
if [[ -n "${write_hits}" ]]; then
  fail "drift-read.py must not call a write tool"$'\n'"${write_hits}"
fi
if ! grep -Fq -- 'READ_TOOLS = frozenset({"inspect_ontology", "search", "get"})' "${drift_py}"; then
  fail "drift-read.py must lock MCP reads to inspect_ontology, search, and get"
fi
if ! grep -Fq -- 'refused non-read tool' "${drift_py}"; then
  fail "drift-read.py must refuse a non-read tool"
fi

classify() {
  python3 "${drift_py}" --classify-only
}

empty="$(classify <<'JSON'
{"types": [], "records": []}
JSON
)"
python3 -c '
import json, sys
report = json.loads(sys.argv[1])
need = ("missing_needed", "zero_edge", "dangling_refs", "retired_keys", "duplicate_titles")
missing = [name for name in need if name not in report]
if missing:
    raise SystemExit("missing buckets: " + ", ".join(missing))
for name in need:
    if report[name] != []:
        raise SystemExit(name + " should be empty")
' "${empty}" || fail "empty snapshot is not quiet"

planted="$(classify <<'JSON'
{
  "types": [
    {
      "slug": "spend",
      "fields": [
        {"name": "amount", "kind": "number", "needed": true},
        {"name": "currency", "kind": "string", "needed": true},
        {"name": "due", "kind": "date", "needed": false},
        {"name": "vendor", "kind": "string", "needed": false},
        {"name": "stage", "kind": "enum", "needed": true}
      ]
    },
    {
      "slug": "note",
      "fields": []
    },
    {
      "slug": "mention",
      "fields": [
        {"name": "who", "kind": "ref", "needed": false, "ref_type": "person"}
      ]
    },
    {
      "slug": "person",
      "fields": []
    }
  ],
  "records": [
    {
      "node": {"id": "11111111-1111-4111-8111-111111111111", "type": "spend", "title": "Fixture spend missing needed"},
      "data": {},
      "edges": []
    },
    {
      "node": {"id": "22222222-2222-4222-8222-222222222222", "type": "note", "title": "Fixture isolate note"},
      "data": {},
      "edges": []
    },
    {
      "node": {"id": "33333333-3333-4333-8333-333333333333", "type": "note", "title": "Fixture twin title"},
      "data": {"who": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
      "edges": [{"id": "edge-1"}]
    },
    {
      "node": {"id": "44444444-4444-4444-8444-444444444444", "type": "note", "title": "Fixture Twin Title"},
      "data": {"living": {"system": "drive", "id": "file-fixture-1"}},
      "edges": [{"id": "edge-2"}]
    },
    {
      "node": {"id": "55555555-5555-4555-8555-555555555555", "type": "mention", "title": "Named Fixture Ada"},
      "data": {"who": "99999999-9999-4999-8999-999999999999"},
      "edges": [{"id": "edge-3"}]
    }
  ],
  "live_ids": [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555"
  ]
}
JSON
)"
python3 -c '
import json, sys
report = json.loads(sys.argv[1])

missing = report["missing_needed"]
if len(missing) != 1:
    raise SystemExit("expected one missing needed, got %s" % missing)
if missing[0]["title"] != "Fixture spend missing needed":
    raise SystemExit("missing needed title: %s" % missing[0])
if missing[0]["fields"] != ["amount", "currency", "stage"]:
    raise SystemExit("missing needed fields: %s" % missing[0]["fields"])

isolates = [row["title"] for row in report["zero_edge"]]
if "Fixture isolate note" not in isolates:
    raise SystemExit("zero-edge missed isolate: %s" % report["zero_edge"])
if "Fixture spend missing needed" not in isolates:
    raise SystemExit("zero-edge missed spend: %s" % report["zero_edge"])
if "Named Fixture Ada" in isolates:
    raise SystemExit("linked mention reported as zero-edge")

dangling = report["dangling_refs"]
if len(dangling) != 1:
    raise SystemExit("expected one dangling ref after declared-field rules, got %s" % dangling)
if dangling[0]["field"] != "who" or dangling[0]["title"] != "Named Fixture Ada":
    raise SystemExit("dangling row: %s" % dangling[0])
if dangling[0]["target"] != "99999999-9999-4999-8999-999999999999":
    raise SystemExit("dangling target: %s" % dangling[0]["target"])

retired = report["retired_keys"]
if len(retired) != 1 or retired[0]["keys"] != ["living"]:
    raise SystemExit("retired keys: %s" % retired)

dupes = report["duplicate_titles"]
if len(dupes) != 1 or len(dupes[0]["nodes"]) != 2:
    raise SystemExit("duplicate titles: %s" % dupes)
' "${planted}" || fail "planted fixtures landed in the wrong bucket"

skill="${repo_root}/.agents/skills/drift-read/SKILL.md"
if [[ ! -f "${skill}" ]]; then
  fail "missing ${skill}"
fi
if ! grep -Fq -- 'scripts/drift-read.sh' "${skill}"; then
  fail "drift-read skill does not name scripts/drift-read.sh"
fi
if ! grep -Fq -- '@drift read:' "${skill}"; then
  fail "drift-read skill does not name @drift read:"
fi

echo "drift-read.test: ok"
