#!/usr/bin/env bash
# Contract fixtures for keep-vault-up. No live vault. No real Compose.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
keep_script="${script_dir}/keep-vault-up.sh"
health_doc="${repo_root}/docs/VAULT_HEALTH.md"
readme="${repo_root}/README.md"

# shellcheck source=keep-vault-up.sh
source "${keep_script}"

fail() {
  echo "keep-vault-up.test: $*" >&2
  exit 1
}

bash -n "${keep_script}"

if [[ ! -f "${health_doc}" ]]; then
  fail "missing ${health_doc}"
fi
if [[ ! -f "${readme}" ]]; then
  fail "missing ${readme}"
fi

if ! grep -Fq -- 'scripts/keep-vault-up.sh' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not name scripts/keep-vault-up.sh"
fi
if ! grep -Fq -- 'scripts/keep-vault-up.sh' "${readme}"; then
  fail "README does not name scripts/keep-vault-up.sh"
fi
if ! grep -Fq -- '*/15 * * * * /path/to/the/clone/scripts/keep-vault-up.sh' "${health_doc}"; then
  fail "VAULT_HEALTH.md is missing the placeholder schedule line"
fi

if grep -Eq -- '(^|[^[:alnum:]])(operator|seat)([^[:alnum:]]|$)' "${keep_script}" "${health_doc}"; then
  fail "keep-vault-up copy must not write operator or seat"
fi
if grep -Eq -- '/Users/|/home/[a-zA-Z]' "${keep_script}"; then
  fail "keep-vault-up.sh must not contain a live home path"
fi
if grep -Eq -- 'compose[^[:cntrl:]]*--build|--build[^[:cntrl:]]*up' "${keep_script}"; then
  fail "keep-vault-up.sh must not pass --build to compose"
fi
if ! grep -Fq -- 'up -d' "${keep_script}"; then
  fail "keep-vault-up.sh does not run compose up -d"
fi
if grep -Eq -- 'compose[[:space:]]+down' "${keep_script}"; then
  fail "keep-vault-up.sh must not take Compose down"
fi
if ! grep -Fq -- 'http://127.0.0.1:8787/health' "${keep_script}"; then
  fail "keep-vault-up.sh does not default to localhost /health"
fi

green_json='{ "ok": true, "service": "foundation", "db": "up" }'
down_json='{ "ok": false, "service": "foundation", "db": "down" }'
if ! foundation_keep_vault_up_body_is_green "${green_json}"; then
  fail "green /health body should pass"
fi
if foundation_keep_vault_up_body_is_green "${down_json}"; then
  fail "db down body should fail"
fi
if foundation_keep_vault_up_body_is_green '{ "ok": true, "service": "other", "db": "up" }'; then
  fail "wrong service should fail"
fi
if foundation_keep_vault_up_body_is_green ''; then
  fail "empty body should fail"
fi

compose_log="$(mktemp)"
trap 'rm -f -- "${compose_log}"' EXIT

# Green: write nothing. Do not start Compose.
(
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    return 0
  }
  out="$(foundation_keep_vault_up_main 2>&1)"
  rc=$?
  if ((rc != 0)); then
    fail "green health should exit 0 (got ${rc})"
  fi
  if [[ -n "${out}" ]]; then
    fail "green health should write nothing (got: ${out})"
  fi
)
if [[ -s "${compose_log}" ]]; then
  fail "green health must not run compose up"
fi

# Docker missing: nag. Do not start Compose.
: >"${compose_log}"
set +e
out="$(
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_have_docker() { return 1; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "missing Docker should fail"
fi
if ! grep -Fq -- 'Docker is not on this machine' <<<"${out}"; then
  fail "missing Docker did not nag (got: ${out})"
fi
if [[ -s "${compose_log}" ]]; then
  fail "missing Docker must not run compose up"
fi

# Docker present but not running: nag. Do not start Compose.
: >"${compose_log}"
set +e
out="$(
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_have_docker() { return 0; }
  foundation_keep_vault_up_engine_up() { return 1; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "Docker not running should fail"
fi
if ! grep -Fq -- 'Docker is not running' <<<"${out}"; then
  fail "Docker not running did not nag (got: ${out})"
fi
if [[ -s "${compose_log}" ]]; then
  fail "Docker not running must not run compose up"
fi

# Down, then compose up once, then health: quiet.
: >"${compose_log}"
out="$(
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_have_docker() { return 0; }
  foundation_keep_vault_up_engine_up() { return 0; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() { return 0; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
if ((rc != 0)); then
  fail "healed after compose up should exit 0 (got ${rc})"
fi
if [[ -n "${out}" ]]; then
  fail "healed after compose up should write nothing (got: ${out})"
fi
if [[ "$(wc -l <"${compose_log}" | tr -d ' ')" != "1" ]]; then
  fail "compose up must run once (log: $(cat "${compose_log}"))"
fi

# Still down after compose up once: nag.
: >"${compose_log}"
set +e
out="$(
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_have_docker() { return 0; }
  foundation_keep_vault_up_engine_up() { return 0; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() { return 1; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "still-down after compose up should fail"
fi
if ! grep -Fq -- 'compose up ran once and /health still failed' <<<"${out}"; then
  fail "still-down did not nag (got: ${out})"
fi
if [[ "$(wc -l <"${compose_log}" | tr -d ' ')" != "1" ]]; then
  fail "still-down must not loop compose up"
fi

echo "keep-vault-up.test: ok"
