#!/usr/bin/env bash
# Locks the four verify-foundation helper contracts. Does not start host programs.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="${script_dir}/verify-foundation.sh"
# shellcheck source=verify-foundation.sh
source "${helper}"

fail() {
  echo "verify-foundation.test: $*" >&2
  exit 1
}

# 1. Cleanup must never choose /tmp as the delete root.
got="$(verify_disposable_run_root "directchild" "/tmp/foundation-verify-directchild" || true)"
[[ "${got}" == "/tmp/foundation-verify-directchild" ]] || fail "direct-child data dir should delete that run root, got '${got}'"
[[ "${got}" != "/tmp" ]] || fail "delete root must not be /tmp"

got="$(verify_disposable_run_root "nested" "/tmp/foundation-verify-nested/data" || true)"
[[ "${got}" == "/tmp/foundation-verify-nested" ]] || fail "default data dir should delete the run root, got '${got}'"

got="$(verify_disposable_run_root "nested" "/tmp/foundation-verify-nested/extra/data" || true)"
[[ -z "${got}" ]] || fail "nested extra path must not be disposable, got '${got}'"

got="$(verify_disposable_run_root "nested" "/tmp/foundation-verify-nested/data/../../../tmp" || true)"
[[ -z "${got}" ]] || fail "path with .. must not be disposable, got '${got}'"

got="$(verify_disposable_run_root "user" "/workspace/data" || true)"
[[ -z "${got}" ]] || fail "clone data dir must not be disposable, got '${got}'"

got="$(verify_disposable_run_root "../x" "/tmp/foundation-verify-../x" || true)"
[[ -z "${got}" ]] || fail "bad run id must not be disposable, got '${got}'"

# Live cleanup of a direct-child VERIFY_DATA_DIR must leave /tmp and a canary.
canary="/tmp/foundation-verify-canary-$$"
run_id="wipeprobe$$"
data_dir="/tmp/foundation-verify-${run_id}"
last_file="/tmp/foundation-verify-last-run-test-$$"
echo "canary" >"${canary}"
mkdir -p -- "${data_dir}"
env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" VERIFY_DATA_DIR="${data_dir}" \
  VERIFY_EVIDENCE_DIR="/tmp/foundation-verify-evidence-${run_id}" \
  bash -c '
    source "$1"
    id="$(verify_resolve_run_id)"
    state="$(verify_state_file "${id}")"
    mkdir -p -- "$(dirname -- "${state}")"
    verify_write_state "${state}" "${id}" "$2"
    mkdir -p -- "$(verify_evidence_dir "${id}")"
  ' bash "${helper}" "${data_dir}"
env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" VERIFY_DATA_DIR="${data_dir}" \
  VERIFY_EVIDENCE_DIR="/tmp/foundation-verify-evidence-${run_id}" \
  "${helper}" cleanup >/tmp/foundation-verify-cleanup-out-$$
[[ -d /tmp ]] || fail "cleanup removed /tmp"
[[ -f "${canary}" ]] || fail "cleanup removed a /tmp canary"
[[ ! -e "${data_dir}" ]] || fail "cleanup left the disposable direct-child dir"
rm -f -- "${canary}" /tmp/foundation-verify-cleanup-out-$$ "${last_file}"
rm -rf -- "/tmp/foundation-verify-evidence-${run_id}"

# 2. Follow-up commands reuse the last launch id.
last_file="/tmp/foundation-verify-last-run-test-$$"
printf '%s\n' "sharedrun" >"${last_file}"
id="$(env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" "${helper}" run-id)"
[[ "${id}" == "sharedrun" ]] || fail "run-id should reuse last launch, got '${id}'"
ev="$(env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" "${helper}" evidence-dir)"
[[ "${ev}" == *"/evidence/sharedrun" ]] || fail "evidence-dir should use last launch, got '${ev}'"
rm -rf -- "$(env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" "${helper}" evidence-dir)"
rm -f -- "${last_file}"

# 3. Doctor loads this run's key file when env and clone .env are empty.
run_id="keyreuse$$"
last_file="/tmp/foundation-verify-last-run-test-$$"
key_dir="/tmp/foundation-verify-${run_id}"
mkdir -p -- "${key_dir}"
printf '%s\n' "verify-scaffold-test-key" >"${key_dir}/api_key"
printf '%s\n' "${run_id}" >"${last_file}"
out="$(
  env -u FOUNDATION_API_KEY -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" \
    "${helper}" doctor 2>&1 || true
)"
[[ "${out}" == *"this run's key file"* ]] || fail "doctor should load the run key file, got: ${out}"
[[ "${out}" != *"verify-scaffold-test-key"* ]] || fail "doctor printed the key"
key_path="$(env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" "${helper}" key-file)"
[[ "${key_path}" == "${key_dir}/api_key" ]] || fail "key-file path, got '${key_path}'"
loaded="$(
  env -u FOUNDATION_API_KEY -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" bash -c '
    source "$1"
    id="$(verify_resolve_run_id)"
    verify_load_api_key "$(verify_repo_root)" "${id}" >/dev/null
    printf "%s" "${FOUNDATION_API_KEY}"
  ' bash "${helper}"
)"
[[ "${loaded}" == "verify-scaffold-test-key" ]] || fail "load_api_key should export the run key"
rm -rf -- "${key_dir}"
rm -f -- "${last_file}"

# 4. Launch backup root stays under the run folder, not the clone.
run_id="backupiso"
last_file="/tmp/foundation-verify-last-run-test-$$"
printf '%s\n' "${run_id}" >"${last_file}"
root="$(VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" "${helper}" backup-root)"
[[ "${root}" == "/tmp/foundation-verify-${run_id}/backups" ]] || fail "backup-root should be under the run, got '${root}'"
[[ "${root}" != *"/workspace/"* ]] || fail "backup-root leaked onto the clone"
rm -f -- "${last_file}"

echo "verify-foundation.test: ok"
