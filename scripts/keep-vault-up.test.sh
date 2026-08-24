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
if ! grep -Fq -- 'green is not enough' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not say /health green is not enough"
fi
if ! grep -Fq -- 'Do not create an empty cluster over that miss' "${health_doc}" \
  && ! grep -Fq -- 'Do not mkdir an empty live cluster over a miss' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not refuse mkdir over a miss"
fi
if ! grep -Fq -- 'no records' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not alert on zero records"
fi
if ! grep -Fq -- 'nag and stop' "${health_doc}"; then
  fail "VAULT_HEALTH.md step 3 must nag and stop when Docker is missing"
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
if ! grep -Eq -- 'up -d >/dev/null 2>&1' "${keep_script}"; then
  fail "keep-vault-up.sh must hide compose stdout and stderr"
fi
if ! grep -Fq -- 'compose up failed to start' "${keep_script}"; then
  fail "keep-vault-up.sh must nag that compose start failed"
fi
if grep -Eq -- 'compose[[:space:]]+down' "${keep_script}"; then
  fail "keep-vault-up.sh must not take Compose down"
fi
if ! grep -Fq -- 'http://127.0.0.1:8787/health' "${keep_script}"; then
  fail "keep-vault-up.sh does not default to localhost /health"
fi
if grep -Eiq -- '(^|[^[:alnum:]])(persist|watchdog|sentinel)([^[:alnum:]]|$)' "${keep_script}"; then
  fail "keep-vault-up.sh must not mint insider words"
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
tmp_root="$(mktemp -d)"
trap 'rm -f -- "${compose_log}"; rm -rf -- "${tmp_root}"' EXIT

# Health + real cluster: write nothing. Do not start Compose.
: >"${compose_log}"
out="$(
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_cluster_ok() { return 0; }
  foundation_keep_vault_up_refuse_miss() { return 0; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
if ((rc != 0)); then
  fail "health + real cluster should exit 0 (got ${rc})"
fi
if [[ -n "${out}" ]]; then
  fail "health + real cluster should write nothing (got: ${out})"
fi
if [[ -s "${compose_log}" ]]; then
  fail "health + real cluster must not run compose up"
fi

# Docker missing: nag. Do not start Compose.
: >"${compose_log}"
set +e
out="$(
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_refuse_miss() { return 0; }
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
  foundation_keep_vault_up_refuse_miss() { return 0; }
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

# Down, then compose up once, then health + real cluster: quiet.
: >"${compose_log}"
out="$(
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_refuse_miss() { return 0; }
  foundation_keep_vault_up_have_docker() { return 0; }
  foundation_keep_vault_up_engine_up() { return 0; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    return 0
  }
  foundation_keep_vault_up_wait_health() { return 0; }
  foundation_keep_vault_up_cluster_ok() { return 0; }
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
  foundation_keep_vault_up_refuse_miss() { return 0; }
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

# compose up itself fails: nag that start failed, not that /health still failed.
: >"${compose_log}"
set +e
out="$(
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_refuse_miss() { return 0; }
  foundation_keep_vault_up_have_docker() { return 0; }
  foundation_keep_vault_up_engine_up() { return 0; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    return 1
  }
  foundation_keep_vault_up_wait_health() {
    echo waited >>"${compose_log}"
    return 1
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "compose start failure should fail"
fi
if ! grep -Fq -- 'compose up failed to start' <<<"${out}"; then
  fail "compose start failure did not nag (got: ${out})"
fi
if grep -Fq -- '/health still failed' <<<"${out}"; then
  fail "compose start failure must not claim /health still failed (got: ${out})"
fi
if [[ "$(wc -l <"${compose_log}" | tr -d ' ')" != "1" ]]; then
  fail "compose start failure must not wait on health (log: $(cat "${compose_log}"))"
fi

# /health green + empty cluster (0 records): nag. Do not compose up.
miss="${tmp_root}/empty-cluster"
mkdir -p "${miss}/postgres"
printf '%s\n' '16' >"${miss}/postgres/PG_VERSION"
: >"${compose_log}"
set +e
out="$(
  FOUNDATION_DATA="${miss}"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_live_node_count() { printf '%s\n' '0'; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "zero records should fail even when /health is green"
fi
if ! grep -Fq -- 'no records' <<<"${out}"; then
  fail "zero records did not nag (got: ${out})"
fi
if [[ -s "${compose_log}" ]]; then
  fail "zero records must not run compose up"
fi

# Existing data dir, postgres/ without PG_VERSION: refuse. Do not mkdir. Do not compose up.
miss_pg="${tmp_root}/miss-pg"
mkdir -p "${miss_pg}/postgres"
: >"${compose_log}"
set +e
out="$(
  FOUNDATION_DATA="${miss_pg}"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 1; }
  foundation_keep_vault_up_have_docker() { return 0; }
  foundation_keep_vault_up_engine_up() { return 0; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    mkdir -p "${miss_pg}/postgres"
    printf '%s\n' '16' >"${miss_pg}/postgres/PG_VERSION"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "missing PG_VERSION should fail"
fi
if ! grep -Fq -- 'no PG_VERSION' <<<"${out}"; then
  fail "missing PG_VERSION did not nag (got: ${out})"
fi
if [[ -e "${miss_pg}/postgres/PG_VERSION" ]]; then
  fail "must not mkdir PG_VERSION over a miss"
fi
if [[ -s "${compose_log}" ]]; then
  fail "missing PG_VERSION must not run compose up"
fi

# /health green, data dir exists, PG_VERSION missing: nag. Do not mkdir.
miss_up="${tmp_root}/miss-up"
mkdir -p "${miss_up}/postgres"
: >"${compose_log}"
set +e
out="$(
  FOUNDATION_DATA="${miss_up}"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_compose_up() {
    echo compose >>"${compose_log}"
    return 0
  }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "green /health with missing PG_VERSION should fail"
fi
if ! grep -Fq -- 'no PG_VERSION' <<<"${out}"; then
  fail "green /health with missing PG_VERSION did not nag (got: ${out})"
fi
if [[ -e "${miss_up}/postgres/PG_VERSION" ]]; then
  fail "green /health miss must not mkdir PG_VERSION"
fi
if [[ -s "${compose_log}" ]]; then
  fail "green /health miss must not run compose up"
fi

# Health + PG_VERSION + records: quiet.
real="${tmp_root}/real"
mkdir -p "${real}/postgres"
printf '%s\n' '16' >"${real}/postgres/PG_VERSION"
out="$(
  FOUNDATION_DATA="${real}"
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${tmp_root}"; }
  foundation_keep_vault_up_health_ok() { return 0; }
  foundation_keep_vault_up_live_node_count() { printf '%s\n' '3'; }
  foundation_keep_vault_up_main 2>&1
)"
rc=$?
if ((rc != 0)); then
  fail "health + real cluster fixture should exit 0 (got ${rc})"
fi
if [[ -n "${out}" ]]; then
  fail "health + real cluster fixture should write nothing (got: ${out})"
fi

echo "keep-vault-up.test: ok"
