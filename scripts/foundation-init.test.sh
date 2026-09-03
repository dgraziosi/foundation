#!/usr/bin/env bash
# Contract fixtures for foundation-init and host schedule fragments.
# No live vault.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
init_script="${script_dir}/foundation-init.sh"
readme="${repo_root}/README.md"
health_doc="${repo_root}/docs/VAULT_HEALTH.md"
plist="${repo_root}/host/foundation.keep-vault-up.plist"
crontab="${repo_root}/host/crontab"

# shellcheck source=foundation-init.sh
source "${init_script}"

# Contract fixtures. No live vault. Drop leftover host env so fixtures
# do not mkdir or prepare a data dir this run did not create.
unset FOUNDATION_DATA BACKUP_ROOT DATABASE_URL

fail() {
  echo "foundation-init.test: $*" >&2
  exit 1
}

bash -n "${init_script}"

if [[ ! -f "${readme}" ]]; then
  fail "missing ${readme}"
fi
if [[ ! -f "${health_doc}" ]]; then
  fail "missing ${health_doc}"
fi
if [[ ! -f "${plist}" ]]; then
  fail "missing ${plist}"
fi
if [[ ! -f "${crontab}" ]]; then
  fail "missing ${crontab}"
fi

if ! grep -Fq -- 'scripts/foundation-init.sh' "${readme}"; then
  fail "README does not name scripts/foundation-init.sh"
fi
if ! grep -Fq -- 'pnpm' "${readme}"; then
  fail "README does not name pnpm"
fi
if ! grep -Fq -- 'pnpm start' "${readme}"; then
  fail "README does not name pnpm start"
fi
if ! grep -Fq -- 'scripts/foundation-init.sh' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not name scripts/foundation-init.sh"
fi
if ! grep -Fq -- 'scripts/keep-vault-up.sh' "${health_doc}"; then
  fail "VAULT_HEALTH.md does not name scripts/keep-vault-up.sh"
fi

# README must not invent an installer that is not a product tool here.
if grep -Eiq -- '(^|[^[:alnum:]])(pipx|poetry|conda|choco|winget)([^[:alnum:]]|$)' "${readme}"; then
  fail "README invents an installer that is not in this repo"
fi
if grep -Eiq -- 'brew install|apt-get install|apt install|yum install|dnf install|pip3? install|gem install|cargo install|npm install -g' "${readme}"; then
  fail "README invents an installer command that is not in this repo"
fi

# Every scripts/*.sh the README names must exist.
while IFS= read -r rel; do
  [[ -n "${rel}" ]] || continue
  if [[ ! -f "${repo_root}/${rel}" ]]; then
    fail "README names missing script ${rel}"
  fi
done < <(grep -oE -- 'scripts/[A-Za-z0-9._-]+\.sh' "${readme}" | LC_ALL=C sort -u)

# Schedule fragments ship with the clone-path placeholder, never a home path.
for fragment in "${plist}" "${crontab}"; do
  if ! grep -Fq -- '/path/to/the/clone' "${fragment}"; then
    fail "${fragment} is missing the /path/to/the/clone placeholder"
  fi
  if grep -Eq -- '/Users/|/home/[a-zA-Z]' "${fragment}"; then
    fail "${fragment} must not contain a home path"
  fi
done

if ! grep -Fq -- '/path/to/the/clone/scripts/keep-vault-up.sh' "${plist}"; then
  fail "plist must point at keep-vault-up.sh under the clone placeholder"
fi
if ! grep -Fq -- '/path/to/the/clone/scripts/keep-vault-up.sh' "${crontab}"; then
  fail "crontab must point at keep-vault-up.sh under the clone placeholder"
fi

if grep -Eq -- '/Users/|/home/[a-zA-Z]' "${init_script}"; then
  fail "foundation-init.sh must not contain a live home path"
fi
if grep -Eiq -- 'docker|compose' "${init_script}"; then
  fail "foundation-init.sh must not mention Docker or Compose"
fi
if grep -Eiq -- '(^|[^[:alnum:]])(operator|seat)([^[:alnum:]]|$)' "${init_script}"; then
  fail "foundation-init copy must not write operator or seat"
fi
if ! grep -Fq -- 'pnpm start' "${init_script}"; then
  fail "foundation-init.sh must hand off to keep-up / pnpm start"
fi

tmp_root="$(mktemp -d)"
trap 'rm -rf -- "${tmp_root}"' EXIT

# Copy .env.example when .env is missing. Do not overwrite an existing .env.
env_clone="${tmp_root}/env-clone"
mkdir -p "${env_clone}"
printf '%s\n' 'FOUNDATION_API_KEY=from-example' >"${env_clone}/.env.example"
(
  foundation_keep_vault_up_repo_root() { printf '%s\n' "${env_clone}"; }
  foundation_init_ensure_env "${env_clone}"
)
if [[ ! -f "${env_clone}/.env" ]]; then
  fail "init must copy .env.example when .env is missing"
fi
if ! grep -Fq -- 'FOUNDATION_API_KEY=from-example' "${env_clone}/.env"; then
  fail "copied .env must match .env.example"
fi
printf '%s\n' 'FOUNDATION_API_KEY=already-set' >"${env_clone}/.env"
printf '%s\n' 'FOUNDATION_API_KEY=from-example-changed' >"${env_clone}/.env.example"
(
  foundation_init_ensure_env "${env_clone}"
)
if ! grep -Fq -- 'FOUNDATION_API_KEY=already-set' "${env_clone}/.env"; then
  fail "init must not overwrite an existing .env"
fi

# Missing .env.example: refuse.
no_example="${tmp_root}/no-example"
mkdir -p "${no_example}"
set +e
out="$(foundation_init_ensure_env "${no_example}" 2>&1)"
rc=$?
set -e
if ((rc == 0)); then
  fail "missing .env.example should fail"
fi
if ! grep -Fq -- '.env.example is missing' <<<"${out}"; then
  fail "missing .env.example did not nag (got: ${out})"
fi

# mkdir the data folder. Do not mkdir postgres/.
blank="${tmp_root}/blank-data"
foundation_init_ensure_data_dir "${blank}"
if [[ ! -d "${blank}" ]]; then
  fail "init must mkdir the data folder"
fi
if [[ -e "${blank}/postgres" ]]; then
  fail "init must not mkdir postgres/ itself"
fi

# Full main: mkdir, copy env, then exec keep-up. Stub keep-up. No live vault.
run_clone="${tmp_root}/run-clone"
mkdir -p "${run_clone}/scripts"
printf '%s\n' 'FOUNDATION_DATA=./data' 'DATABASE_URL=postgres://foundation:fixture@127.0.0.1:1/foundation' \
  >"${run_clone}/.env.example"
printf '%s\n' '#!/usr/bin/env bash' 'echo keep-stub-ran' 'exit 0' >"${run_clone}/scripts/keep-stub.sh"
chmod +x "${run_clone}/scripts/keep-stub.sh"
cp -- "${init_script}" "${run_clone}/scripts/foundation-init.sh"
cp -- "${script_dir}/keep-vault-up.sh" "${run_clone}/scripts/keep-vault-up.sh"
cp -- "${script_dir}/vault-data-dir.sh" "${run_clone}/scripts/vault-data-dir.sh"
chmod +x "${run_clone}/scripts/foundation-init.sh"
out="$(
  FOUNDATION_INIT_KEEP_VAULT_UP="${run_clone}/scripts/keep-stub.sh" \
    "${run_clone}/scripts/foundation-init.sh"
)"
if [[ "${out}" != "keep-stub-ran" ]]; then
  fail "init should exec keep-up (got: ${out})"
fi
if [[ ! -f "${run_clone}/.env" ]]; then
  fail "init should copy .env before keep-up"
fi
if [[ ! -d "${run_clone}/data" ]]; then
  fail "init should mkdir ./data before keep-up"
fi
if [[ -e "${run_clone}/data/postgres" ]]; then
  fail "init must not mkdir postgres/ before keep-up"
fi

# postgres/ without PG_VERSION: refuse. Do not start keep-up. Do not mkdir PG_VERSION.
miss_clone="${tmp_root}/miss-clone"
mkdir -p "${miss_clone}/scripts" "${miss_clone}/data/postgres"
printf '%s\n' 'FOUNDATION_DATA=./data' >"${miss_clone}/.env"
printf '%s\n' 'leftover' >"${miss_clone}/data/postgres/leftover-file"
printf '%s\n' '#!/usr/bin/env bash' 'echo keep-should-not-run' 'exit 0' >"${miss_clone}/scripts/keep-stub.sh"
chmod +x "${miss_clone}/scripts/keep-stub.sh"
cp -- "${init_script}" "${miss_clone}/scripts/foundation-init.sh"
cp -- "${script_dir}/keep-vault-up.sh" "${miss_clone}/scripts/keep-vault-up.sh"
cp -- "${script_dir}/vault-data-dir.sh" "${miss_clone}/scripts/vault-data-dir.sh"
chmod +x "${miss_clone}/scripts/foundation-init.sh"
set +e
out="$(
  FOUNDATION_INIT_KEEP_VAULT_UP="${miss_clone}/scripts/keep-stub.sh" \
    "${miss_clone}/scripts/foundation-init.sh" 2>&1
)"
rc=$?
set -e
if ((rc == 0)); then
  fail "init over a miss should fail"
fi
if grep -Fq -- 'keep-should-not-run' <<<"${out}"; then
  fail "init over a miss must not start keep-up"
fi
if [[ -e "${miss_clone}/data/postgres/PG_VERSION" ]]; then
  fail "init must not mkdir PG_VERSION over a miss"
fi
if [[ ! -f "${miss_clone}/data/postgres/leftover-file" ]]; then
  fail "init must not replace a leftover postgres/ tree"
fi

echo "foundation-init.test: ok"
