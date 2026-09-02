#!/usr/bin/env bash
# Locks verify-foundation helper contracts. Does not start host programs.
# Contracts 1–4 run the real script, not only sourced functions.
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
verify_run_id_ok ".." && fail "run id .. must be invalid"
verify_run_id_ok "20260901Tproof1" || fail "date-stamp run id must be valid"

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

# 2. Follow-up commands reuse the last launch id. Launch mints a new one.
last_file="/tmp/foundation-verify-last-run-test-$$"
printf '%s\n' "sharedrun" >"${last_file}"
id="$(env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" "${helper}" run-id)"
[[ "${id}" == "sharedrun" ]] || fail "run-id should reuse last launch, got '${id}'"
ev="$(env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" "${helper}" evidence-dir)"
[[ "${ev}" == *"/evidence/sharedrun" ]] || fail "evidence-dir should use last launch, got '${ev}'"
launch_id="$(
  env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" bash -c '
    source "$1"
    verify_launch_run_id
  ' bash "${helper}"
)"
[[ "${launch_id}" != "sharedrun" ]] || fail "launch should mint, not reuse last-run"
[[ "${launch_id}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || fail "launch mint should be a UTC stamp, got '${launch_id}'"
if ! env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" bash -c '
  source "$1"
  verify_run_id_ok "sharedrun"
' bash "${helper}"; then
  fail "sharedrun should be a valid follow-up id"
fi
rm -rf -- "$(env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" "${helper}" evidence-dir)"
printf '%s\n' "../x" >"${last_file}"
if env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" "${helper}" run-id >/tmp/foundation-verify-badid-$$ 2>/tmp/foundation-verify-badid-err-$$; then
  fail "run-id should refuse an invalid last-run id"
fi
rm -f -- /tmp/foundation-verify-badid-$$ /tmp/foundation-verify-badid-err-$$ "${last_file}"

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

# --- Real-script contracts (1–4). Not sourced functions. ---

real_bin="/tmp/foundation-verify-realbin-$$"
real_keep="${real_bin}/keep-stub.sh"
mkdir -p -- "${real_bin}"
printf '%s\n' '#!/bin/sh' 'exit 0' >"${real_bin}/initdb"
printf '%s\n' '#!/bin/sh' 'exit 0' >"${real_bin}/pg_ctl"
printf '%s\n' '#!/bin/sh' 'exit 0' >"${real_bin}/psql"
chmod +x "${real_bin}/initdb" "${real_bin}/pg_ctl" "${real_bin}/psql"

# 1. State names APP_PID. Real cleanup stops that pid.
run_id="pidstop$$"
last_file="/tmp/foundation-verify-last-run-test-$$"
data_dir="/tmp/foundation-verify-${run_id}/data"
state_file="/tmp/foundation-verify-${run_id}/state"
evidence_dir="/tmp/foundation-verify-evidence-${run_id}"
mkdir -p -- "${data_dir}" "${evidence_dir}"
sleep 120 &
pid="$!"
[[ "${pid}" =~ ^[0-9]+$ ]] || fail "sleep pid"
kill -0 "${pid}" || fail "sleep should be running"
cat >"${state_file}" <<EOF
RUN_ID=${run_id}
DATA_DIR=${data_dir}
STARTED=1
APP_PID=${pid}
EOF
printf '%s\n' "${run_id}" >"${last_file}"
cleanup_out="$(
  env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
    VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
    VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
    "${helper}" cleanup 2>&1
)" || fail "cleanup should exit 0, got: ${cleanup_out}"
[[ "${cleanup_out}" == *"stopping app pid ${pid}"* ]] || fail "cleanup should name the pid, got: ${cleanup_out}"
if kill -0 "${pid}" 2>/dev/null; then
  kill -KILL "${pid}" 2>/dev/null || true
  fail "cleanup left APP_PID ${pid} running"
fi
rm -rf -- "/tmp/foundation-verify-${run_id}" "${evidence_dir}"
rm -f -- "${last_file}"

# 2. Real launch loads the run key file into this process (no $(…) drop).
run_id="keyexport$$"
last_file="/tmp/foundation-verify-last-run-test-$$"
run_root="/tmp/foundation-verify-${run_id}"
data_dir="${run_root}/data"
state_file="${run_root}/state"
evidence_dir="/tmp/foundation-verify-evidence-${run_id}"
key_secret="verify-scaffold-export-key-$$"
mkdir -p -- "${run_root}"
printf '%s\n' "${key_secret}" >"${run_root}/api_key"
printf '%s\n' '#!/bin/sh' 'exit 1' >"${real_keep}"
chmod +x "${real_keep}"
launch_out="$(
  env -u FOUNDATION_API_KEY -u DATABASE_URL -u VERIFY_RUN_ID \
    PATH="${real_bin}:${PATH}" \
    VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
    VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
    VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
    "${helper}" launch 2>&1
)" && fail "launch should fail when keep-stub exits 1, got: ${launch_out}"
[[ "${launch_out}" != *"unbound variable"* ]] || fail "launch crashed after key load: ${launch_out}"
[[ "${launch_out}" != *"${key_secret}"* ]] || fail "launch printed the key"
[[ -f "${run_root}/api_key" ]] || fail "launch should keep the key file"
got_key="$(tr -d '\r\n' <"${run_root}/api_key")"
[[ "${got_key}" == "${key_secret}" ]] || fail "launch should write the loaded key (not printed)"
[[ ! -f "${state_file}" ]] || fail "launch must not write STARTED state when keep fails"
rm -rf -- "${run_root}" "${evidence_dir}"
rm -f -- "${last_file}"

# 3. Leftover STARTED=1 + green /health is not "already this run".
run_id="leftover$$"
last_file="/tmp/foundation-verify-last-run-test-$$"
run_root="/tmp/foundation-verify-${run_id}"
data_dir="${run_root}/data"
state_file="${run_root}/state"
evidence_dir="/tmp/foundation-verify-evidence-${run_id}"
green_flag="${real_bin}/health-green"
mkdir -p -- "${data_dir}" "${evidence_dir}"
cat >"${state_file}" <<EOF
RUN_ID=${run_id}
DATA_DIR=${data_dir}
STARTED=1
APP_PID=
EOF
printf '%s\n' "${run_id}" >"${last_file}"
: >"${green_flag}"
cat >"${real_bin}/curl" <<EOF
#!/bin/sh
if [ -f "${green_flag}" ]; then
  echo '{"ok":true,"service":"foundation","db":"up"}'
  exit 0
fi
exit 1
EOF
chmod +x "${real_bin}/curl"
leftover_out="$(
  env -u FOUNDATION_API_KEY -u DATABASE_URL -u VERIFY_RUN_ID \
    PATH="${real_bin}:${PATH}" \
    VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
    VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
    VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
    "${helper}" launch 2>&1
)" && fail "leftover STARTED + green health should refuse, got: ${leftover_out}"
[[ "${leftover_out}" != *"already up from this run"* ]] || fail "leftover STARTED must not be already-up: ${leftover_out}"
[[ "${leftover_out}" == *"Refusing to take over a shared instance"* ]] || fail "should refuse shared instance, got: ${leftover_out}"
rm -rf -- "${run_root}" "${evidence_dir}"
rm -f -- "${last_file}" "${green_flag}"

# Full launch via stub keep: writes APP_PID + STARTED=1; cleanup stops that pid.
run_id="launchpid$$"
last_file="/tmp/foundation-verify-last-run-test-$$"
run_root="/tmp/foundation-verify-${run_id}"
data_dir="${run_root}/data"
state_file="${run_root}/state"
evidence_dir="/tmp/foundation-verify-evidence-${run_id}"
url_seen="${real_bin}/database-url.seen"
rm -f -- "${green_flag}"
sleep 1000 &
stub_pid="$!"
[[ "${stub_pid}" =~ ^[0-9]+$ ]] || fail "stub app pid"
cat >"${real_keep}" <<EOF
#!/bin/sh
if [ "\${1:-}" = "stop" ]; then
  exit 0
fi
printf '%s\\n' "\${DATABASE_URL}" >"${url_seen}"
printf '%s\\n' "${stub_pid}" >"${data_dir}/app.pid"
touch "${green_flag}"
exit 0
EOF
chmod +x "${real_keep}"
mkdir -p -- "${run_root}" "${data_dir}"
printf '%s\n' "verify-scaffold-launch-key" >"${run_root}/api_key"
ready_out="$(
  env -u FOUNDATION_API_KEY -u VERIFY_RUN_ID \
    PATH="${real_bin}:${PATH}" \
    DATABASE_URL="postgres://live:live@10.9.8.7:5432/live" \
    VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
    VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
    VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
    "${helper}" launch 2>&1
)" || fail "stub launch should succeed, got: ${ready_out}"
[[ "${ready_out}" == *"already up from this run"* ]] && fail "first stub launch should start, got: ${ready_out}"
[[ -f "${state_file}" ]] || fail "successful launch must write state"
started="$(grep -E '^STARTED=' "${state_file}" | tail -n 1)"
[[ "${started}" == "STARTED=1" ]] || fail "STARTED should be 1 after keep, got ${started}"
app_pid="$(grep -E '^APP_PID=' "${state_file}" | tail -n 1)"
app_pid="${app_pid#APP_PID=}"
[[ "${app_pid}" =~ ^[0-9]+$ ]] || fail "state APP_PID should be numeric, got '${app_pid}'"
kill -0 "${app_pid}" || fail "recorded APP_PID should still be running"
seen_url="$(tr -d '\r\n' <"${url_seen}")"
[[ "${seen_url}" == "postgres://foundation:foundation@127.0.0.1:5432/foundation" ]] || fail "launch forwarded ambient DATABASE_URL: ${seen_url}"
[[ "${seen_url}" != *"10.9.8.7"* ]] || fail "launch attached disposable data to a live cluster"
env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
  VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
  VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
  "${helper}" cleanup >/tmp/foundation-verify-cleanup-launch-$$
if kill -0 "${app_pid}" 2>/dev/null; then
  kill -KILL "${app_pid}" 2>/dev/null || true
  fail "cleanup left launch APP_PID running"
fi
rm -f -- /tmp/foundation-verify-cleanup-launch-$$
rm -rf -- "${run_root}" "${evidence_dir}"
rm -f -- "${last_file}" "${url_seen}" "${green_flag}"
kill -KILL "${stub_pid}" 2>/dev/null || true

# 4. Real database-url command never echoes an ambient live URL.
run_id="dbiso$$"
db_out="$(
  env DATABASE_URL="postgres://live:live@10.9.8.7:5432/live" \
    VERIFY_RUN_ID="${run_id}" "${helper}" database-url
)"
[[ "${db_out}" == "postgres://foundation:foundation@127.0.0.1:5432/foundation" ]] || fail "database-url should be disposable, got '${db_out}'"
[[ "${db_out}" != *"10.9.8.7"* ]] || fail "database-url leaked ambient DATABASE_URL"

# 5. Failed keep after a start must not orphan the vault.
run_id="orphan$$"
last_file="/tmp/foundation-verify-last-run-test-$$"
run_root="/tmp/foundation-verify-${run_id}"
data_dir="${run_root}/data"
state_file="${run_root}/state"
evidence_dir="/tmp/foundation-verify-evidence-${run_id}"
rm -f -- "${green_flag}"
sleep 1000 &
orphan_pid="$!"
[[ "${orphan_pid}" =~ ^[0-9]+$ ]] || fail "orphan stub pid"
cat >"${real_keep}" <<EOF
#!/bin/sh
if [ "\${1:-}" = "stop" ]; then
  rm -f "${green_flag}"
  exit 0
fi
mkdir -p -- "${data_dir}"
printf '%s\\n' "${orphan_pid}" >"${data_dir}/app.pid"
touch "${green_flag}"
exit 1
EOF
chmod +x "${real_keep}"
mkdir -p -- "${run_root}" "${data_dir}" "${evidence_dir}"
printf '%s\n' "verify-scaffold-orphan-key" >"${run_root}/api_key"
orphan_out="$(
  env -u FOUNDATION_API_KEY -u DATABASE_URL -u VERIFY_RUN_ID \
    PATH="${real_bin}:${PATH}" \
    VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
    VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
    VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
    "${helper}" launch 2>&1
)" && fail "launch should fail when keep starts then exits 1, got: ${orphan_out}"
[[ "${orphan_out}" == *"keep-vault-up failed"* ]] || fail "should report keep failure, got: ${orphan_out}"
[[ "${orphan_out}" == *"recorded failed start"* ]] || fail "should record failed start, got: ${orphan_out}"
[[ -f "${state_file}" ]] || fail "failed start that launched programs must write state"
started="$(grep -E '^STARTED=' "${state_file}" | tail -n 1)"
[[ "${started}" == "STARTED=0" ]] || fail "failed start must not set STARTED=1, got ${started}"
recorded="$(grep -E '^APP_PID=' "${state_file}" | tail -n 1)"
[[ "${recorded}" == "APP_PID=${orphan_pid}" ]] || fail "failed start must record APP_PID, got ${recorded}"
last_got="$(tr -d '[:space:]' <"${last_file}")"
[[ "${last_got}" == "${run_id}" ]] || fail "failed start must remember last-run, got '${last_got}'"
if kill -0 "${orphan_pid}" 2>/dev/null; then
  kill -KILL "${orphan_pid}" 2>/dev/null || true
  fail "failed launch left the started pid running"
fi

# Cleanup must still stop a recorded failed start (STARTED=0 + APP_PID).
sleep 1000 &
cleanup_fail_pid="$!"
cat >"${state_file}" <<EOF
RUN_ID=${run_id}
DATA_DIR=${data_dir}
STARTED=0
APP_PID=${cleanup_fail_pid}
EOF
printf '%s\n' "${run_id}" >"${last_file}"
cleanup_fail_out="$(
  env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
    VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
    VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
    "${helper}" cleanup 2>&1
)" || fail "cleanup of STARTED=0 leftover should exit 0, got: ${cleanup_fail_out}"
[[ "${cleanup_fail_out}" == *"stopping app pid ${cleanup_fail_pid}"* ]] || fail "cleanup should stop failed-start pid, got: ${cleanup_fail_out}"
if kill -0 "${cleanup_fail_pid}" 2>/dev/null; then
  kill -KILL "${cleanup_fail_pid}" 2>/dev/null || true
  fail "cleanup left STARTED=0 APP_PID ${cleanup_fail_pid} running"
fi
mkdir -p -- "${data_dir}" "${evidence_dir}"

# keep wrote a pid but /health never greened (wait_health timeout).
sleep 1000 &
timeout_pid="$!"
rm -f -- "${green_flag}"
cat >"${real_keep}" <<EOF
#!/bin/sh
if [ "\${1:-}" = "stop" ]; then
  rm -f "${green_flag}"
  exit 0
fi
mkdir -p -- "${data_dir}"
printf '%s\\n' "${timeout_pid}" >"${data_dir}/app.pid"
exit 1
EOF
chmod +x "${real_keep}"
timeout_out="$(
  env -u FOUNDATION_API_KEY -u DATABASE_URL -u VERIFY_RUN_ID \
    PATH="${real_bin}:${PATH}" \
    VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
    VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
    VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
    "${helper}" launch 2>&1
)" && fail "launch should fail when keep writes a pid then exits 1, got: ${timeout_out}"
[[ "${timeout_out}" == *"recorded failed start"* ]] || fail "health-timeout path must record, got: ${timeout_out}"
started="$(grep -E '^STARTED=' "${state_file}" | tail -n 1)"
[[ "${started}" == "STARTED=0" ]] || fail "health-timeout must not set STARTED=1, got ${started}"
if kill -0 "${timeout_pid}" 2>/dev/null; then
  kill -KILL "${timeout_pid}" 2>/dev/null || true
  fail "health-timeout launch left the started pid running"
fi

# keep succeeded and health is green, but app.pid is missing.
: >"${green_flag}"
cat >"${real_keep}" <<EOF
#!/bin/sh
if [ "\${1:-}" = "stop" ]; then
  rm -f "${green_flag}"
  exit 0
fi
rm -f "${data_dir}/app.pid"
touch "${green_flag}"
exit 0
EOF
chmod +x "${real_keep}"
missing_out="$(
  env -u FOUNDATION_API_KEY -u DATABASE_URL -u VERIFY_RUN_ID \
    PATH="${real_bin}:${PATH}" \
    VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
    VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
    VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
    "${helper}" launch 2>&1
)" && fail "launch should fail when app pid is missing, got: ${missing_out}"
[[ "${missing_out}" == *"app pid is missing"* ]] || fail "should report missing pid, got: ${missing_out}"
[[ "${missing_out}" == *"recorded failed start"* ]] || fail "missing-pid path must record, got: ${missing_out}"
started="$(grep -E '^STARTED=' "${state_file}" | tail -n 1)"
[[ "${started}" == "STARTED=0" ]] || fail "missing pid must not set STARTED=1, got ${started}"
if [[ -f "${green_flag}" ]]; then
  rm -f -- "${green_flag}"
  fail "missing-pid launch left leftover green /health"
fi

# Later launch must reclaim leftover green /health from STARTED=0, not refuse.
sleep 1000 &
reclaim_pid="$!"
cat >"${state_file}" <<EOF
RUN_ID=${run_id}
DATA_DIR=${data_dir}
STARTED=0
APP_PID=${reclaim_pid}
EOF
printf '%s\n' "${run_id}" >"${last_file}"
: >"${green_flag}"
success_pid=""
sleep 1000 &
success_pid="$!"
cat >"${real_keep}" <<EOF
#!/bin/sh
if [ "\${1:-}" = "stop" ]; then
  rm -f "${green_flag}"
  exit 0
fi
printf '%s\\n' "${success_pid}" >"${data_dir}/app.pid"
touch "${green_flag}"
exit 0
EOF
chmod +x "${real_keep}"
reclaim_out="$(
  env -u FOUNDATION_API_KEY -u DATABASE_URL -u VERIFY_RUN_ID \
    PATH="${real_bin}:${PATH}" \
    VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
    VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
    VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
    "${helper}" launch 2>&1
)" || fail "reclaim then launch should succeed, got: ${reclaim_out}"
[[ "${reclaim_out}" != *"Refusing to take over a shared instance"* ]] || fail "must not refuse leftover failed start: ${reclaim_out}"
[[ "${reclaim_out}" == *"reclaiming a failed start"* ]] || fail "should reclaim failed start, got: ${reclaim_out}"
[[ "${reclaim_out}" == *"already up from this run"* ]] && fail "reclaim should start, not already-up: ${reclaim_out}"
if kill -0 "${reclaim_pid}" 2>/dev/null; then
  kill -KILL "${reclaim_pid}" 2>/dev/null || true
  fail "reclaim left the leftover pid running"
fi
started="$(grep -E '^STARTED=' "${state_file}" | tail -n 1)"
[[ "${started}" == "STARTED=1" ]] || fail "successful reclaim launch should set STARTED=1, got ${started}"
env -u VERIFY_RUN_ID VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${run_id}" \
  VERIFY_DATA_DIR="${data_dir}" VERIFY_STATE_FILE="${state_file}" \
  VERIFY_EVIDENCE_DIR="${evidence_dir}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
  "${helper}" cleanup >/tmp/foundation-verify-cleanup-orphan-$$
if kill -0 "${success_pid}" 2>/dev/null; then
  kill -KILL "${success_pid}" 2>/dev/null || true
  fail "cleanup left reclaim APP_PID running"
fi
rm -f -- /tmp/foundation-verify-cleanup-orphan-$$
rm -rf -- "${run_root}" "${evidence_dir}"
rm -f -- "${last_file}" "${green_flag}"
kill -KILL "${orphan_pid}" "${reclaim_pid}" "${success_pid}" 2>/dev/null || true

# Later launch without VERIFY_RUN_ID reclaims last-run's STARTED=0 leftover.
failed_id="orphanlast$$"
failed_root="/tmp/foundation-verify-${failed_id}"
failed_data="${failed_root}/data"
failed_state="${failed_root}/state"
mint_evidence="/tmp/foundation-verify-evidence-lastreclaim-$$"
mkdir -p -- "${failed_data}"
sleep 1000 &
last_leftover_pid="$!"
cat >"${failed_state}" <<EOF
RUN_ID=${failed_id}
DATA_DIR=${failed_data}
STARTED=0
APP_PID=${last_leftover_pid}
EOF
printf '%s\n' "${failed_id}" >"${last_file}"
: >"${green_flag}"
sleep 1000 &
last_success_pid="$!"
cat >"${real_keep}" <<EOF
#!/bin/sh
if [ "\${1:-}" = "stop" ]; then
  rm -f "${green_flag}"
  exit 0
fi
printf '%s\\n' "${last_success_pid}" >"\${FOUNDATION_DATA}/app.pid"
touch "${green_flag}"
exit 0
EOF
chmod +x "${real_keep}"
last_reclaim_out="$(
  env -u FOUNDATION_API_KEY -u DATABASE_URL -u VERIFY_RUN_ID -u VERIFY_STATE_FILE -u VERIFY_DATA_DIR \
    PATH="${real_bin}:${PATH}" \
    VERIFY_LAST_RUN_FILE="${last_file}" \
    VERIFY_EVIDENCE_DIR="${mint_evidence}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
    "${helper}" launch 2>&1
)" || fail "last-run reclaim then launch should succeed, got: ${last_reclaim_out}"
[[ "${last_reclaim_out}" != *"Refusing to take over a shared instance"* ]] || fail "must not refuse last-run leftover: ${last_reclaim_out}"
[[ "${last_reclaim_out}" == *"reclaiming a failed start"* ]] || fail "should reclaim last-run failed start, got: ${last_reclaim_out}"
if kill -0 "${last_leftover_pid}" 2>/dev/null; then
  kill -KILL "${last_leftover_pid}" 2>/dev/null || true
  fail "last-run reclaim left the leftover pid running"
fi
minted_id="$(printf '%s\n' "${last_reclaim_out}" | sed -n 's/^launch: run //p' | head -n 1)"
[[ "${minted_id}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || fail "last-run reclaim should mint, got '${minted_id}'"
[[ "${minted_id}" != "${failed_id}" ]] || fail "last-run reclaim must not reuse the failed id"
minted_state="/tmp/foundation-verify-${minted_id}/state"
[[ -f "${minted_state}" ]] || fail "minted launch must write its own state"
started="$(grep -E '^STARTED=' "${minted_state}" | tail -n 1)"
[[ "${started}" == "STARTED=1" ]] || fail "minted reclaim launch should set STARTED=1, got ${started}"
env -u VERIFY_RUN_ID -u VERIFY_STATE_FILE -u VERIFY_DATA_DIR \
  VERIFY_LAST_RUN_FILE="${last_file}" VERIFY_RUN_ID="${minted_id}" \
  VERIFY_EVIDENCE_DIR="${mint_evidence}" VERIFY_KEEP_VAULT_UP="${real_keep}" \
  "${helper}" cleanup >/tmp/foundation-verify-cleanup-lastreclaim-$$
if kill -0 "${last_success_pid}" 2>/dev/null; then
  kill -KILL "${last_success_pid}" 2>/dev/null || true
  fail "cleanup left last-run reclaim APP_PID running"
fi
rm -f -- /tmp/foundation-verify-cleanup-lastreclaim-$$ "${last_file}" "${green_flag}"
rm -rf -- "${failed_root}" "/tmp/foundation-verify-${minted_id}" "${mint_evidence}"
kill -KILL "${last_leftover_pid}" "${last_success_pid}" 2>/dev/null || true

rm -rf -- "${real_bin}"

# Current window copy. A cold agent must not learn the old door or Home map.
map_root="$(cd "${script_dir}/.." && pwd)"
map_blob="$(cat "${map_root}/SKILL.md" "${map_root}/features/"*.md "${map_root}/PROOF.md")"
for banned in \
  "Unlock the vault window" \
  "Same key as MCP" \
  "API key required" \
  "Title is required" \
  "Home has no Today" \
  "Home does not link to Today"
do
  [[ "${map_blob}" != *"${banned}"* ]] || fail "verify-foundation map still says '${banned}'"
done
[[ "${map_blob}" == *"Write today"* ]] || fail "verify-foundation map must show Today on Home"
[[ "${map_blob}" == *"That key did not unlock"* ]] || fail "verify-foundation map must use person unlock error"
[[ "${map_blob}" == *"Keep a title"* ]] || fail "verify-foundation map must show Keep a title"

echo "verify-foundation.test: ok"
