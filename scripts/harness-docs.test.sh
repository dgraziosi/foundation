#!/usr/bin/env bash
# Assert the harness attach doc names the five harnesses and the localhost MCP URL.
# Does not launch those harnesses.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
doc="${script_dir}/../docs/HARNESS.md"

fail() {
  echo "harness-docs.test: $*" >&2
  exit 1
}

if [[ ! -f "${doc}" ]]; then
  fail "missing ${doc}"
fi

for name in "Grok Bot" "Hermes" "OpenClaw" "Claude Code" "Codex"; do
  if ! grep -Fq -- "${name}" "${doc}"; then
    fail "docs/HARNESS.md does not name ${name}"
  fi
done

if ! grep -Fq -- "http://127.0.0.1:8787/mcp" "${doc}"; then
  fail "docs/HARNESS.md does not name the localhost MCP URL"
fi

echo "harness-docs.test: ok"
