#!/usr/bin/env bash
# One-shot vault snapshot (JSON, Markdown, CSV). Talks to localhost MCP.
# Does not print the API key. Live records only.
#
#   scripts/foundation-export.sh --out DIR
#   scripts/foundation-export.sh --out DIR --format json,markdown,csv
#
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/load-foundation-api-key.sh
source "${script_dir}/lib/load-foundation-api-key.sh"

if [[ ! -f "${script_dir}/lib/foundation_portability.py" ]]; then
  echo "foundation-export: missing lib/foundation_portability.py" >&2
  exit 1
fi

foundation_load_api_key
exec python3 "${script_dir}/lib/foundation_portability.py" export "$@"
