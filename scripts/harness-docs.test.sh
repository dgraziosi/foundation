#!/usr/bin/env bash
# Assert each named harness section has the localhost MCP URL, how to pass
# the API key, and confirm with bootstrap or search. Does not launch harnesses.
# Does not only grep the file as a whole — an empty Grok Bot heading must fail.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
doc="${script_dir}/../docs/HARNESS.md"

fail() {
  echo "harness-docs.test: $*" >&2
  exit 1
}

extract_section() {
  local source="$1"
  local name="$2"
  awk -v heading="## ${name}" '
    $0 == heading { found=1; next }
    found && /^## / { exit }
    found { print }
  ' "${source}"
}

section_ok() {
  local name="$1"
  local body="$2"
  if ! grep -Fq -- "http://127.0.0.1:8787/mcp" <<<"${body}"; then
    echo "harness-docs.test: ${name} section is missing the localhost MCP URL" >&2
    return 1
  fi
  if ! grep -Fq -- "Authorization" <<<"${body}" || ! grep -Fq -- "ApiKey YOUR_KEY" <<<"${body}"; then
    echo "harness-docs.test: ${name} section does not say how to pass the API key" >&2
    return 1
  fi
  if ! grep -Fq -- "bootstrap" <<<"${body}" || ! grep -Fq -- "search" <<<"${body}"; then
    echo "harness-docs.test: ${name} section does not say how to confirm with bootstrap or search" >&2
    return 1
  fi
  if ! grep -Fq -- ".agents/skills/" <<<"${body}"; then
    echo "harness-docs.test: ${name} section does not import or point at .agents/skills/" >&2
    return 1
  fi
  return 0
}

if [[ ! -f "${doc}" ]]; then
  fail "missing ${doc}"
fi
if ! grep -Fq -- 'After unlock the window can write today’s journal' "${doc}"; then
  fail "HARNESS.md does not say after unlock the window can write today’s journal"
fi
if ! grep -Fq -- 'Other types stay read-only' "${doc}"; then
  fail "HARNESS.md does not say other types stay read-only"
fi
if ! grep -Fq -- 'The cookie still does not open MCP' "${doc}"; then
  fail "HARNESS.md does not say the cookie still does not open MCP"
fi

for name in "Grok Bot" "Hermes" "OpenClaw" "Claude Code" "Codex"; do
  body="$(extract_section "${doc}" "${name}")"
  if [[ -z "${body}" ]]; then
    fail "${name} section is empty or missing"
  fi
  if ! section_ok "${name}" "${body}"; then
    fail "${name} section is incomplete"
  fi
done

empty_fixture="$(mktemp)"
trap 'rm -f -- "${empty_fixture}"' EXIT
cat >"${empty_fixture}" <<'EOF'
## Grok Bot

## Hermes
EOF
empty_body="$(extract_section "${empty_fixture}" "Grok Bot")"
if section_ok "Grok Bot" "${empty_body}" 2>/dev/null; then
  fail "empty Grok Bot heading must fail"
fi

echo "harness-docs.test: ok"
