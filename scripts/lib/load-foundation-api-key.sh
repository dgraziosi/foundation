# Load FOUNDATION_API_KEY into the environment. Does not print the key.
# Source from a host script. Looks at env, then the verify-foundation key
# file, then the clone .env.

_FOUNDATION_PORTABILITY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

foundation_load_api_key() {
  local repo_root helper key_file raw line

  if [[ -n "${FOUNDATION_API_KEY:-}" ]]; then
    return 0
  fi

  repo_root="${_FOUNDATION_PORTABILITY_ROOT}"
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

  if [[ -f "${repo_root}/.env" ]]; then
    line="$(grep -E "^[[:space:]]*FOUNDATION_API_KEY=" "${repo_root}/.env" | tail -n 1 || true)"
    raw="${line#*FOUNDATION_API_KEY=}"
    raw="${raw%$'\r'}"
    if [[ "${raw}" == \"*\" && "${raw}" == *\" ]]; then
      raw="${raw#\"}"
      raw="${raw%\"}"
    fi
    if [[ -n "${raw}" ]]; then
      FOUNDATION_API_KEY="${raw}"
      export FOUNDATION_API_KEY
      return 0
    fi
  fi

  echo "foundation-portability: FOUNDATION_API_KEY is unset" >&2
  return 1
}
