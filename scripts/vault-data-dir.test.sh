#!/usr/bin/env bash
# Contract fixtures for the live vault data dir. No live vault.
# Same user as Postgres and the app. No Docker. No ACL grant.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
helper="${script_dir}/vault-data-dir.sh"
health_doc="${repo_root}/docs/VAULT_HEALTH.md"

# shellcheck source=vault-data-dir.sh
source "${helper}"

fail() {
  echo "vault-data-dir.test: $*" >&2
  exit 1
}

bash -n "${helper}"

if [[ ! -f "${health_doc}" ]]; then
  fail "missing ${health_doc}"
fi

for needle in \
  'postgres/PG_VERSION' \
  'Do not create `$FOUNDATION_DATA/postgres` or `PG_VERSION` on that miss' \
  'If `$FOUNDATION_DATA/postgres` exists and `PG_VERSION` is missing, refuse' \
  'Empty first-day folder may init' \
  'never world-writable' \
  'Host-side health fails while the host cannot read'
do
  if ! grep -Fq -- "${needle}" "${health_doc}"; then
    fail "VAULT_HEALTH.md is missing the contract sentence: ${needle}"
  fi
done

if grep -Eiq -- 'docker|compose' "${helper}"; then
  fail "vault-data-dir.sh must not mention Docker or Compose"
fi
if grep -Eq -- 'setfacl|FOUNDATION_HOST_UID|uid 999' "${helper}"; then
  fail "vault-data-dir.sh must not grant ACLs or take a second uid"
fi
if grep -Eq -- '\b1000\b' "${health_doc}" "${helper}"; then
  fail "vault-data-dir copy must not bake in uid 1000"
fi

if [[ -e "${repo_root}/docker-compose.yml" ]]; then
  fail "docker-compose.yml must not ship"
fi
if [[ -e "${repo_root}/Dockerfile" ]]; then
  fail "Dockerfile must not ship"
fi

blobs_ts="${repo_root}/packages/db/src/blobs.ts"
if [[ ! -f "${blobs_ts}" ]]; then
  fail "missing ${blobs_ts}"
fi
if grep -Fq -- 'FOUNDATION_VAULT_DATA_DIR_HELPER' "${blobs_ts}"; then
  fail "blobs.ts must not re-run a host-read grant"
fi
if grep -Fq -- 'grantHostRead' "${blobs_ts}"; then
  fail "blobs.ts must not call grantHostRead"
fi

tmp="$(mktemp -d)"
trap 'rm -rf -- "${tmp}"' EXIT

if ! bash "${helper}" prepare "${tmp}/cli-first"; then
  fail "CLI prepare must allow a first-run empty dir"
fi
if [[ -e "${tmp}/cli-first/postgres" ]]; then
  fail "CLI prepare must not mkdir postgres/"
fi
mkdir -p "${tmp}/cli-miss/postgres"
if bash "${helper}" prepare "${tmp}/cli-miss"; then
  fail "CLI prepare must refuse postgres/ without PG_VERSION"
fi
mkdir -p "${tmp}/cli-health/postgres"
printf '%s\n' '16' >"${tmp}/cli-health/postgres/PG_VERSION"
if ! bash "${helper}" health "${tmp}/cli-health"; then
  fail "CLI health must pass when PG_VERSION is readable"
fi
chmod 000 -- "${tmp}/cli-health/postgres/PG_VERSION"
if bash "${helper}" health "${tmp}/cli-health"; then
  fail "CLI health must fail when the host cannot read PG_VERSION"
fi
chmod 600 -- "${tmp}/cli-health/postgres/PG_VERSION"

first_run="${tmp}/first-run"
mkdir -p "${first_run}"
if ! foundation_vault_data_dir_prepare "${first_run}"; then
  fail "empty data dir must still be allowed to init"
fi
if [[ -e "${first_run}/postgres" ]]; then
  fail "prepare must not mkdir postgres/ on a first-run empty data dir"
fi
if foundation_vault_data_dir_health_pg_version "${first_run}"; then
  fail "health must fail when PG_VERSION is missing"
fi
if [[ -e "${first_run}/postgres" ]]; then
  fail "health must not mkdir postgres/ when PG_VERSION is missing"
fi

miss="${tmp}/miss"
mkdir -p "${miss}/postgres"
printf '%s\n' 'leftover' >"${miss}/postgres/leftover-file"
if foundation_vault_data_dir_prepare "${miss}"; then
  fail "postgres/ without PG_VERSION must refuse"
fi
if [[ -e "${miss}/postgres/PG_VERSION" ]]; then
  fail "refuse must not create PG_VERSION over a miss"
fi
if [[ ! -f "${miss}/postgres/leftover-file" ]]; then
  fail "refuse must not replace a leftover postgres/ tree"
fi
if foundation_vault_data_dir_health_pg_version "${miss}"; then
  fail "health must fail when PG_VERSION is missing"
fi
if [[ -e "${miss}/postgres/PG_VERSION" ]]; then
  fail "health must not create PG_VERSION on a miss"
fi

unreadable="${tmp}/unreadable"
mkdir -p "${unreadable}/postgres"
printf '%s\n' '16' >"${unreadable}/postgres/PG_VERSION"
chmod 000 -- "${unreadable}/postgres/PG_VERSION"
if foundation_vault_data_dir_health_pg_version "${unreadable}"; then
  fail "health must fail when the host cannot read PG_VERSION"
fi
chmod 600 -- "${unreadable}/postgres/PG_VERSION"

empty_cluster="${tmp}/empty-cluster"
mkdir -p "${empty_cluster}/postgres"
if foundation_vault_data_dir_prepare "${empty_cluster}"; then
  fail "empty postgres/ without PG_VERSION must refuse"
fi
if [[ -e "${empty_cluster}/postgres/PG_VERSION" ]]; then
  fail "refuse must not mkdir PG_VERSION over an empty leftover cluster"
fi

readable="${tmp}/readable"
mkdir -p "${readable}/postgres" "${readable}/blobs"
printf '%s\n' '16' >"${readable}/postgres/PG_VERSION"
printf '%s\n' 'fixture-blob' >"${readable}/blobs/fixture"
if ! foundation_vault_data_dir_prepare "${readable}"; then
  fail "live dir with PG_VERSION must be allowed"
fi
if ! foundation_vault_data_dir_health_pg_version "${readable}"; then
  fail "health must pass when the host can read PG_VERSION"
fi

echo "vault-data-dir.test: ok"
