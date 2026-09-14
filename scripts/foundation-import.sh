#!/usr/bin/env bash
# One-shot import from Obsidian, Notion, Apple Notes, or Google Tasks.
# Talks to localhost MCP. Creates live records. Does not wipe the vault.
# Does not print the API key. Re-run uses the same idempotency_key.
#
#   scripts/foundation-import.sh --from obsidian --source DIR
#   scripts/foundation-import.sh --from notion --source export.zip --dry-run
#   scripts/foundation-import.sh --from apple-notes --source DIR
#   scripts/foundation-import.sh --from google-tasks --source tasks.json
#
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/load-foundation-api-key.sh
source "${script_dir}/lib/load-foundation-api-key.sh"

if [[ ! -f "${script_dir}/lib/foundation_portability.py" ]]; then
  echo "foundation-import: missing lib/foundation_portability.py" >&2
  exit 1
fi

foundation_load_api_key
exec python3 "${script_dir}/lib/foundation_portability.py" import "$@"
