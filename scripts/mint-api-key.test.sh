#!/usr/bin/env bash
# Mint writes a hash, not the secret, and refuses name root.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
mint="${repo_root}/scripts/mint-api-key.sh"

fail() {
  echo "mint-api-key.test: $*" >&2
  exit 1
}

scratch="$(mktemp -d "${TMPDIR:-/tmp}/foundation-mint-XXXXXX")"
trap 'rm -rf -- "${scratch}"' EXIT

if "${mint}" --name root --data-dir "${scratch}" >/dev/null 2>&1; then
  fail "name root must refuse"
fi

secret="$("${mint}" --name chief --label "Chief of Staff" --data-dir "${scratch}")"
if [[ ! "${secret}" =~ ^[0-9a-f]{64}$ ]]; then
  fail "secret should be 64 hex chars"
fi
keys="${scratch}/api-keys.json"
if [[ ! -f "${keys}" ]]; then
  fail "missing api-keys.json"
fi
if grep -Fq -- "${secret}" "${keys}"; then
  fail "api-keys.json must not store the secret"
fi
if ! grep -Fq -- '"name": "chief"' "${keys}"; then
  fail "api-keys.json missing name chief"
fi
if ! grep -Fq -- '"actor_label": "Chief of Staff"' "${keys}"; then
  fail "api-keys.json missing actor_label"
fi
if "${mint}" --name chief --data-dir "${scratch}" >/dev/null 2>&1; then
  fail "duplicate name must refuse"
fi

destructive_secret="$("${mint}" --name vault-keeper --destructive --data-dir "${scratch}")"
if [[ "${destructive_secret}" == "${secret}" ]]; then
  fail "second mint reused the first secret"
fi
if ! grep -Fq -- '"destructive"' "${keys}"; then
  fail "destructive scope was not stored"
fi

echo "mint-api-key.test: ok"
