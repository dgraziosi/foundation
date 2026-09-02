#!/usr/bin/env bash
# First-day vault init on this machine. Not a bot.
#
#   FOUNDATION_DATA       — the vault (default ./data under the clone;
#                           also read from the clone .env)
#   FOUNDATION_INIT_KEEP_VAULT_UP — optional. Default
#                           scripts/keep-vault-up.sh under the clone.
#
# Copies .env.example to .env when .env is missing. Does not overwrite
# .env. Does not invent an API key or a password. mkdir the data folder
# (keep-up still refuses a missing folder). Then runs keep-up, which
# may initdb an empty first-day folder and start Postgres plus
# `pnpm start`. Refuses postgres/ without PG_VERSION. Does not write
# the graph. Does not put a live path in git.
#
#   scripts/foundation-init.sh  — first-day init, then keep-up
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=keep-vault-up.sh
source "${script_dir}/keep-vault-up.sh"
# shellcheck source=vault-data-dir.sh
source "${script_dir}/vault-data-dir.sh"

foundation_init_nag() {
  echo "foundation-init: $*" >&2
}

# Copy .env.example when .env is missing. Leave an existing .env alone.
foundation_init_ensure_env() {
  local repo_root="$1"
  if [[ -f "${repo_root}/.env" ]]; then
    return 0
  fi
  if [[ ! -f "${repo_root}/.env.example" ]]; then
    foundation_init_nag ".env.example is missing. Run init from a Foundation clone."
    return 1
  fi
  cp -- "${repo_root}/.env.example" "${repo_root}/.env"
}

# First-day mkdir. Does not mkdir postgres/. Does not mkdir over a miss.
foundation_init_ensure_data_dir() {
  local data_dir="$1"
  mkdir -p -- "${data_dir}"
}

foundation_init_keep_script() {
  local repo_root="$1"
  printf '%s\n' "${FOUNDATION_INIT_KEEP_VAULT_UP:-${repo_root}/scripts/keep-vault-up.sh}"
}

foundation_init_main() {
  local repo_root data_dir keep
  repo_root="$(foundation_keep_vault_up_repo_root)"
  keep="$(foundation_init_keep_script "${repo_root}")"

  if ! foundation_init_ensure_env "${repo_root}"; then
    return 1
  fi
  data_dir="$(foundation_keep_vault_up_data_dir "${repo_root}")"
  foundation_init_ensure_data_dir "${data_dir}"
  if ! foundation_vault_data_dir_prepare "${data_dir}"; then
    return 1
  fi
  if [[ ! -x "${keep}" && ! -f "${keep}" ]]; then
    foundation_init_nag "keep-up script is missing (${keep})."
    return 1
  fi
  exec "${keep}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  foundation_init_main "$@"
fi
