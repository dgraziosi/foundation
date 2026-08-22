#!/usr/bin/env bash
# Contract fixtures for a host-readable live vault data dir.
# No live vault. Locks Compose wiring to the helper.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
helper="${script_dir}/vault-data-dir.sh"
health_doc="${repo_root}/docs/VAULT_HEALTH.md"
compose_file="${repo_root}/docker-compose.yml"

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

# Present-tense public contract lives in VAULT_HEALTH.
for needle in \
  'host user who runs Compose can read' \
  'postgres/PG_VERSION' \
  'A data dir that is only mode 0700 is invisible to host copy and backup' \
  'Do not create `$FOUNDATION_DATA/postgres` or `PG_VERSION` on that miss' \
  'If `$FOUNDATION_DATA/postgres` exists and `PG_VERSION` is missing, refuse' \
  'First `compose up` on an empty data dir still inits' \
  'named POSIX ACL' \
  'not a baked-in number' \
  'never world-writable' \
  'db-init` calls `scripts/vault-data-dir.sh prepare' \
  'db-host-read` calls `grant' \
  'The server calls `grant` again after it `chmod`s `blobs/`' \
  'If the data dir cannot take a named ACL, Compose still starts' \
  'Host-side health fails while the host cannot read'
do
  if ! grep -Fq -- "${needle}" "${health_doc}"; then
    fail "VAULT_HEALTH.md is missing the contract sentence: ${needle}"
  fi
done

if grep -Eq -- '\b1000\b' "${health_doc}"; then
  fail "VAULT_HEALTH.md must not bake in uid 1000"
fi

# Compose stays owner-only on postgres/ and blobs/. No baked-in host uid.
if [[ ! -f "${compose_file}" ]]; then
  fail "missing ${compose_file}"
fi
if grep -Eq -- 'chmod 0?777 /(data/)?(postgres|blobs)' "${compose_file}"; then
  fail "compose must not make postgres/ or blobs/ world-writable"
fi
if grep -Eq -- 'chown.*\b1000\b|user:[[:space:]]*"?1000' "${compose_file}"; then
  fail "compose must not hardcode host uid 1000"
fi
if ! grep -Fq -- 'bash /vault-data-dir.sh prepare /data' "${compose_file}"; then
  fail "compose db-init must call vault-data-dir.sh prepare"
fi
if ! grep -Fq -- 'bash /vault-data-dir.sh grant /data' "${compose_file}"; then
  fail "compose db-host-read must call vault-data-dir.sh grant"
fi
if ! grep -Fq -- 'FOUNDATION_HOST_UID_PROBE: /host-uid-probe' "${compose_file}"; then
  fail "compose grant must take host uid from the clone probe, not a baked-in 1000"
fi
if ! awk '
  $0 ~ /db-host-read:/ { in_grant=1 }
  in_grant && /depends_on:/ { in_deps=1 }
  in_grant && in_deps && $0 ~ /^[[:space:]]+db:/ { saw_db=1 }
  in_grant && saw_db && /service_healthy/ { found=1; exit }
  in_grant && /^  [a-z]/ && $0 !~ /db-host-read:/ { in_grant=0; in_deps=0; saw_db=0 }
  END { exit found ? 0 : 1 }
' "${compose_file}"; then
  fail "compose db-host-read must wait until db is healthy (after official chmod 00700)"
fi
if ! awk '
  $0 ~ /db-host-read:/ { in_grant=1 }
  in_grant && /depends_on:/ { in_deps=1 }
  in_grant && in_deps && /restart: true/ { found=1; exit }
  in_grant && /^  [a-z]/ && $0 !~ /db-host-read:/ { in_grant=0; in_deps=0 }
  END { exit found ? 0 : 1 }
' "${compose_file}"; then
  fail "compose db-host-read must re-run when db restarts (re-grant after official chmod)"
fi
if awk '
  $0 ~ /^  foundation:/ { in_app=1; next }
  in_app && $0 ~ /^  [a-zA-Z]/ { in_app=0 }
  in_app && $0 ~ /db-host-read/ { found=1 }
  END { exit found ? 0 : 1 }
' "${compose_file}"; then
  fail "compose foundation must not wait on db-host-read (host-read must not take the app down)"
fi
if ! awk '
  $0 ~ /^  foundation:/ { in_app=1; next }
  in_app && $0 ~ /^  [a-zA-Z]/ { in_app=0 }
  in_app && $0 ~ /vault-data-dir.sh:\/vault-data-dir.sh/ { found=1 }
  END { exit found ? 0 : 1 }
' "${compose_file}"; then
  fail "compose foundation must mount vault-data-dir.sh so grant can run after blobs chmod"
fi
if ! awk '
  $0 ~ /^  foundation:/ { in_app=1; next }
  in_app && $0 ~ /^  [a-zA-Z]/ { in_app=0 }
  in_app && $0 ~ /FOUNDATION_HOST_UID_PROBE: \/host-uid-probe/ { found=1 }
  END { exit found ? 0 : 1 }
' "${compose_file}"; then
  fail "compose foundation must take host uid from the clone probe, not a baked-in 1000"
fi

dockerfile="${repo_root}/Dockerfile"
if [[ ! -f "${dockerfile}" ]]; then
  fail "missing ${dockerfile}"
fi
if ! grep -Eq -- '(^|[[:space:]])acl([[:space:]]|$)' "${dockerfile}"; then
  fail "foundation image must include acl so grant can run after blobs chmod"
fi
if ! grep -Fq -- 'COPY scripts/vault-data-dir.sh /vault-data-dir.sh' "${dockerfile}"; then
  fail "foundation image must ship vault-data-dir.sh for grant after blobs chmod"
fi

blobs_ts="${repo_root}/packages/db/src/blobs.ts"
if [[ ! -f "${blobs_ts}" ]]; then
  fail "missing ${blobs_ts}"
fi
if ! grep -Fq -- 'FOUNDATION_VAULT_DATA_DIR_HELPER' "${blobs_ts}"; then
  fail "blobs.ts must re-run grant after chmod"
fi

tmp="$(mktemp -d)"
cleanup() {
  if [[ -d "${tmp}" ]] && ! rm -rf -- "${tmp}" 2>/dev/null; then
    sudo -n rm -rf -- "${tmp}" 2>/dev/null || rm -rf -- "${tmp}" || true
  fi
}
trap cleanup EXIT

# CLI is what Compose calls.
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

# First-run: empty data dir. Prepare allows init. Does not mkdir postgres/.
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

# Missing PG_VERSION: postgres/ exists. Refuse. Do not create PG_VERSION.
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
if foundation_vault_data_dir_grant_host_read "${miss}" 2>/dev/null; then
  fail "grant must not run or mkdir when PG_VERSION is missing"
fi
if [[ -e "${miss}/postgres/PG_VERSION" ]]; then
  fail "grant must not mkdir PG_VERSION on a miss"
fi

# Health fails when the host cannot read PG_VERSION. Does not mkdir.
unreadable="${tmp}/unreadable"
mkdir -p "${unreadable}/postgres"
printf '%s\n' '16' >"${unreadable}/postgres/PG_VERSION"
chmod 000 -- "${unreadable}/postgres/PG_VERSION"
if foundation_vault_data_dir_health_pg_version "${unreadable}"; then
  fail "health must fail when the host cannot read PG_VERSION"
fi
chmod 600 -- "${unreadable}/postgres/PG_VERSION"
# Empty leftover postgres/ (exists, no version file) is still a miss.
empty_cluster="${tmp}/empty-cluster"
mkdir -p "${empty_cluster}/postgres"
if foundation_vault_data_dir_prepare "${empty_cluster}"; then
  fail "empty postgres/ without PG_VERSION must refuse"
fi
if [[ -e "${empty_cluster}/postgres/PG_VERSION" ]]; then
  fail "refuse must not mkdir PG_VERSION over an empty leftover cluster"
fi

# Live dir the current user can already read: health passes; no extra paths.
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

# Host uid comes from the clone owner or FOUNDATION_HOST_UID, never 1000.
probe="${tmp}/clone-probe"
printf '%s\n' 'probe' >"${probe}"
got_uid="$(FOUNDATION_HOST_UID_PROBE="${probe}" foundation_vault_data_dir_host_uid)"
want_uid="$(stat -c '%u' -- "${probe}")"
if [[ "${got_uid}" != "${want_uid}" ]]; then
  fail "host uid must be the probe file owner, got ${got_uid} want ${want_uid}"
fi
if ! FOUNDATION_HOST_UID="${want_uid}" foundation_vault_data_dir_host_uid >/dev/null; then
  fail "FOUNDATION_HOST_UID must be accepted when it is numeric"
fi
if FOUNDATION_HOST_UID=not-a-uid foundation_vault_data_dir_host_uid >/dev/null 2>&1; then
  fail "FOUNDATION_HOST_UID must reject a non-numeric value"
fi

# ACL unsupported: setfacl present but fails. Soft-skip so the app starts.
# Leftover miss still refuses. FOUNDATION_GRANT_REQUIRED=1 keeps a hard fail.
fakebin="${tmp}/fake-setfacl"
mkdir -p "${fakebin}"
printf '%s\n' '#!/bin/sh' 'echo "setfacl: Operation not supported" >&2' 'exit 1' >"${fakebin}/setfacl"
chmod +x "${fakebin}/setfacl"
acl_skip="${tmp}/acl-skip"
mkdir -p "${acl_skip}/postgres" "${acl_skip}/blobs"
printf '%s\n' '16' >"${acl_skip}/postgres/PG_VERSION"
if ! PATH="${fakebin}:${PATH}" FOUNDATION_HOST_UID="$(id -u)" bash "${helper}" grant "${acl_skip}"; then
  fail "grant must soft-skip when setfacl is unsupported"
fi
if PATH="${fakebin}:${PATH}" FOUNDATION_HOST_UID="$(id -u)" FOUNDATION_GRANT_REQUIRED=1 bash "${helper}" grant "${acl_skip}"; then
  fail "FOUNDATION_GRANT_REQUIRED=1 must still fail when setfacl is unsupported"
fi
if [[ -e "${acl_skip}/postgres/PG_VERSION.extra" ]]; then
  fail "soft-skip must not create extra live-cluster files"
fi

# Named POSIX ACL on a 0700 dir owned by another uid. Re-apply after
# chmod 00700 (the official image does this on every start).
if command -v setfacl >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  live="${tmp}/live-acl"
  mkdir -p "${live}/postgres" "${live}/blobs"
  printf '%s\n' '16' >"${live}/postgres/PG_VERSION"
  printf '%s\n' 'fixture-blob' >"${live}/blobs/fixture"
  sudo -n chown -R 999:999 -- "${live}/postgres" "${live}/blobs"
  sudo -n chmod 0700 -- "${live}/postgres" "${live}/blobs"
  sudo -n chmod 0600 -- "${live}/postgres/PG_VERSION" "${live}/blobs/fixture"
  if foundation_vault_data_dir_health_pg_version "${live}" 2>/dev/null; then
    fail "0700-only live dir must be invisible to the host until grant"
  fi
  export FOUNDATION_HOST_UID
  FOUNDATION_HOST_UID="$(id -u)"
  if ! sudo -n --preserve-env=FOUNDATION_HOST_UID bash -c "
    set -euo pipefail
    # shellcheck source=vault-data-dir.sh
    source \"${helper}\"
    foundation_vault_data_dir_grant_host_read \"${live}\"
  "; then
    fail "grant must apply named POSIX ACL on a live dir"
  fi
  if ! foundation_vault_data_dir_health_pg_version "${live}"; then
    fail "host must read PG_VERSION on a live dir after grant"
  fi
  if [[ "$(cat -- "${live}/postgres/PG_VERSION")" != "16" ]]; then
    fail "host must read PG_VERSION contents after grant"
  fi
  if [[ "$(cat -- "${live}/blobs/fixture")" != "fixture-blob" ]]; then
    fail "host must read blobs after grant"
  fi
  postgres_mode="$(stat -c '%a' -- "${live}/postgres")"
  blobs_mode="$(stat -c '%a' -- "${live}/blobs")"
  if [[ "${postgres_mode}" == *7 || "${postgres_mode}" == 777 || "${blobs_mode}" == 777 ]]; then
    fail "grant must not make the live dir world-writable (postgres=${postgres_mode} blobs=${blobs_mode})"
  fi
  if [[ "${postgres_mode}" != 700 && "${postgres_mode}" != 750 ]]; then
    fail "postgres/ mode must stay 0700 or 0750 after grant, got ${postgres_mode}"
  fi

  # Restart: official image chmod 00700 zeros the ACL mask. Postgres
  # still starts at 0700. Re-apply grant so the host can read again.
  sudo -n chmod 00700 -- "${live}/postgres"
  if foundation_vault_data_dir_health_pg_version "${live}" 2>/dev/null; then
    fail "after chmod 00700 the host must not see a stale grant"
  fi
  if ! sudo -n --preserve-env=FOUNDATION_HOST_UID bash -c "
    set -euo pipefail
    # shellcheck source=vault-data-dir.sh
    source \"${helper}\"
    foundation_vault_data_dir_grant_host_read \"${live}\"
  "; then
    fail "grant must re-apply after chmod 00700"
  fi
  if ! foundation_vault_data_dir_health_pg_version "${live}"; then
    fail "restart path: host must read PG_VERSION after re-grant"
  fi
  postgres_mode="$(stat -c '%a' -- "${live}/postgres")"
  if [[ "${postgres_mode}" != 700 && "${postgres_mode}" != 750 ]]; then
    fail "after re-grant postgres/ mode must stay 0700 or 0750, got ${postgres_mode}"
  fi

  # Server chmod 0700 on blobs/ zeros the ACL mask the same way.
  sudo -n chmod 0700 -- "${live}/blobs"
  if cat -- "${live}/blobs/fixture" >/dev/null 2>&1; then
    fail "after blobs chmod 0700 the host must not see a stale grant"
  fi
  if ! sudo -n --preserve-env=FOUNDATION_HOST_UID bash -c "
    set -euo pipefail
    # shellcheck source=vault-data-dir.sh
    source \"${helper}\"
    foundation_vault_data_dir_grant_host_read \"${live}\"
  "; then
    fail "grant must re-apply after blobs chmod 0700"
  fi
  if [[ "$(cat -- "${live}/blobs/fixture")" != "fixture-blob" ]]; then
    fail "after blobs chmod the host must read blobs after re-grant"
  fi
  blobs_mode="$(stat -c '%a' -- "${live}/blobs")"
  if [[ "${blobs_mode}" != 700 && "${blobs_mode}" != 750 ]]; then
    fail "after blobs re-grant mode must stay 0700 or 0750, got ${blobs_mode}"
  fi
  unset FOUNDATION_HOST_UID
else
  echo "vault-data-dir.test: skip ACL live-dir cases (need setfacl and passwordless sudo)" >&2
fi

echo "vault-data-dir.test: ok"
