#!/usr/bin/env bash
# Mint a named MCP API key for one bot. Prints the secret once.
# Stores only the sha256 under FOUNDATION_DATA/api-keys.json.
# Never commit that file or the secret.
#
#   scripts/mint-api-key.sh --name chief
#   scripts/mint-api-key.sh --name vault-keeper --destructive --label "Vault Keeper"
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

nag() {
  echo "mint-api-key: $*" >&2
}

usage() {
  nag "usage: scripts/mint-api-key.sh --name <slug> [--label <text>] [--destructive] [--data-dir <path>]"
  return 2
}

data_dir_from_env() {
  local line raw
  if [[ -n "${FOUNDATION_DATA:-}" ]]; then
    printf '%s\n' "${FOUNDATION_DATA}"
    return 0
  fi
  if [[ -f "${repo_root}/.env" ]]; then
    line="$(grep -E '^[[:space:]]*FOUNDATION_DATA=' "${repo_root}/.env" | tail -n 1 || true)"
    raw="${line#*FOUNDATION_DATA=}"
    raw="${raw%\"}"
    raw="${raw#\"}"
    if [[ -n "${raw}" ]]; then
      printf '%s\n' "${raw}"
      return 0
    fi
  fi
  printf '%s\n' "${repo_root}/data"
}

name=""
label=""
destructive=0
data_dir=""

while (($#)); do
  case "$1" in
    --name)
      [[ $# -ge 2 ]] || usage
      name="$2"
      shift 2
      ;;
    --label)
      [[ $# -ge 2 ]] || usage
      label="$2"
      shift 2
      ;;
    --destructive)
      destructive=1
      shift
      ;;
    --data-dir)
      [[ $# -ge 2 ]] || usage
      data_dir="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      nag "unknown argument: $1"
      usage
      ;;
  esac
done

if [[ -z "${name}" ]]; then
  usage
fi
if [[ ! "${name}" =~ ^[a-z][a-z0-9_-]{0,62}$ ]]; then
  nag "name must look like chief or vault-keeper"
  exit 1
fi
if [[ "${name}" == "root" ]]; then
  nag "name root is reserved for FOUNDATION_API_KEY"
  exit 1
fi

if [[ -z "${data_dir}" ]]; then
  data_dir="$(data_dir_from_env)"
fi
if [[ "${data_dir}" != /* ]]; then
  data_dir="$(cd "${repo_root}" && cd "${data_dir}" 2>/dev/null && pwd || true)"
  if [[ -z "${data_dir}" ]]; then
    nag "data dir is missing. mkdir FOUNDATION_DATA first (official init: scripts/foundation-init.sh)."
    exit 1
  fi
fi
if [[ ! -d "${data_dir}" ]]; then
  nag "data dir is missing (${data_dir}). mkdir FOUNDATION_DATA first."
  exit 1
fi

keys_file="${data_dir}/api-keys.json"
secret="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
digest="$(printf '%s' "${secret}" | python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())')"
actor_label="${label:-${name}}"
scopes="[]"
if ((destructive == 1)); then
  scopes='["destructive"]'
fi

python3 - "${keys_file}" "${name}" "${digest}" "${actor_label}" "${scopes}" <<'PY'
import fcntl, json, os, sys
path, name, digest, label, scopes_raw = sys.argv[1:]
scopes = json.loads(scopes_raw)
lock_fd = os.open(path + ".lock", os.O_RDWR | os.O_CREAT, 0o600)
try:
    fcntl.flock(lock_fd, fcntl.LOCK_EX)
    try:
        with open(path, encoding="utf-8") as fh:
            raw = fh.read()
        data = json.loads(raw) if raw.strip() else {"keys": []}
    except FileNotFoundError:
        data = {"keys": []}
    except json.JSONDecodeError:
        print("mint-api-key: api-keys.json is not JSON", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, dict) or not isinstance(data.get("keys"), list):
        print("mint-api-key: api-keys.json must be { keys: [...] }", file=sys.stderr)
        sys.exit(1)
    for row in data["keys"]:
        if isinstance(row, dict) and row.get("name") == name:
            print(f"mint-api-key: a key named {name} already exists", file=sys.stderr)
            sys.exit(1)
    data["keys"].append({
        "name": name,
        "secret_sha256": digest,
        "actor_label": label,
        "scopes": scopes,
    })
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)
finally:
    os.close(lock_fd)
PY

chmod 600 -- "${keys_file}"
echo "${secret}"
echo "mint-api-key: wrote hash for ${name} to ${keys_file} (secret printed once above; not stored)" >&2
