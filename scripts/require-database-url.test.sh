#!/usr/bin/env bash
# Prove database test suites fail when DATABASE_URL is unset.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

fail() {
  echo "require-database-url.test: $*" >&2
  exit 1
}

gate="${repo_root}/scripts/require-database-url.sh"
[[ -f "${gate}" ]] || fail "gate script is missing"
grep -Fq 'bash ../../scripts/require-database-url.sh' "${repo_root}/apps/server/package.json" \
  || fail "server test script must run the DATABASE_URL gate"
grep -Fq 'bash ../../scripts/require-database-url.sh' "${repo_root}/packages/db/package.json" \
  || fail "db test script must run the DATABASE_URL gate"

unset_log="$(mktemp)"
set_ok="$(mktemp)"
server_log="$(mktemp)"
db_log="$(mktemp)"
cleanup() {
  rm -f -- "${unset_log}" "${set_ok}" "${server_log}" "${db_log}"
}
trap cleanup EXIT

if env -u DATABASE_URL bash "${gate}" >"${unset_log}" 2>&1; then
  fail "gate must fail when DATABASE_URL is unset"
fi
grep -Fq "DATABASE_URL is required; refusing to skip database tests" "${unset_log}" \
  || fail "gate must refuse to skip (got: $(cat "${unset_log}"))"

if ! env DATABASE_URL="postgres://foundation:ci@127.0.0.1:5432/foundation" \
  bash "${gate}" >"${set_ok}" 2>&1; then
  fail "gate must pass when DATABASE_URL is set (got: $(cat "${set_ok}"))"
fi

set +e
env -u DATABASE_URL pnpm --filter @foundation/server test >"${server_log}" 2>&1
server_ec=$?
set -e
[[ "${server_ec}" -ne 0 ]] || fail "server tests must fail when DATABASE_URL is unset"
grep -Fq "DATABASE_URL is required; refusing to skip database tests" "${server_log}" \
  || fail "server tests still skip without DATABASE_URL (got: $(cat "${server_log}"))"
if grep -Eiq 'tests (skipped|todo)' "${server_log}"; then
  fail "server tests reported skips instead of failing (got: $(cat "${server_log}"))"
fi

set +e
env -u DATABASE_URL pnpm --filter @foundation/db test >"${db_log}" 2>&1
db_ec=$?
set -e
[[ "${db_ec}" -ne 0 ]] || fail "db tests must fail when DATABASE_URL is unset"
grep -Fq "DATABASE_URL is required; refusing to skip database tests" "${db_log}" \
  || fail "db tests still skip without DATABASE_URL (got: $(cat "${db_log}"))"

echo "require-database-url.test: ok"
