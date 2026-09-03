#!/usr/bin/env bash
# Report-only graph drift. Prints five buckets. Does not write.
#
#   scripts/drift-read.sh
#   scripts/drift-read.sh --classify-only < snapshot.json
#
# MCP reads only: inspect_ontology, search, get.
# FOUNDATION_API_KEY from the environment, else this verify run's key
# file, else the clone .env. Does not print the key.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
classify="${script_dir}/drift-read.py"

drift_read_nag() {
  echo "drift-read: $*" >&2
}

drift_read_env_value() {
  local key="$1"
  local raw=""
  local line

  eval "raw=\"\${${key}:-}\""
  if [[ -z "${raw}" && -f "${repo_root}/.env" ]]; then
    line="$(grep -E "^[[:space:]]*${key}=" "${repo_root}/.env" | tail -n 1 || true)"
    raw="${line#*"${key}"=}"
    raw="${raw%$'\r'}"
    if [[ "${raw}" == \"*\" && "${raw}" == *\" ]]; then
      raw="${raw#\"}"
      raw="${raw%\"}"
    fi
  fi
  printf '%s\n' "${raw}"
}

drift_read_load_key() {
  local helper key_file raw
  if [[ -n "${FOUNDATION_API_KEY:-}" ]]; then
    return 0
  fi
  helper="${repo_root}/.cursor/skills/verify-foundation/scripts/verify-foundation.sh"
  if [[ -x "${helper}" || -f "${helper}" ]]; then
    key_file="$("${helper}" key-file 2>/dev/null || true)"
    if [[ -n "${key_file}" && -f "${key_file}" ]]; then
      raw="$(tr -d '\r\n' <"${key_file}")"
      if [[ -n "${raw}" ]]; then
        FOUNDATION_API_KEY="${raw}"
        export FOUNDATION_API_KEY
        return 0
      fi
    fi
  fi
  raw="$(drift_read_env_value FOUNDATION_API_KEY)"
  if [[ -n "${raw}" ]]; then
    FOUNDATION_API_KEY="${raw}"
    export FOUNDATION_API_KEY
    return 0
  fi
  drift_read_nag "FOUNDATION_API_KEY is unset"
  return 1
}

if [[ ! -f "${classify}" ]]; then
  drift_read_nag "missing ${classify}"
  exit 1
fi

if [[ "${1:-}" == "--classify-only" ]]; then
  exec python3 "${classify}" --classify-only
fi

drift_read_load_key
exec python3 "${classify}" "$@"
