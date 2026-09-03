#!/usr/bin/env bash
# Assert the product skills tree: folder name matches SKILL.md frontmatter
# name, handoff exists, Dream exists, Vault Keeper procedure routines cite
# .agents/skills/<name>/ including dream, Dream and Vault Keeper Routines
# recommend 02:00, product files this PR touches must not write
# operator or seat, prompts/ is the three starter bots only, the
# blank bot template lives under create-bot, and starters plus the
# template use Job, Responsibilities, Standards, Routines, Skills,
# Tools, Handoffs with Skills vs Tools split.
# Does not launch harnesses or host programs.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
skills_root="${repo_root}/.agents/skills"
prompts_root="${repo_root}/prompts"
vault_keeper="${prompts_root}/vault-keeper.md"

fail() {
  echo "skills-layout.test: $*" >&2
  exit 1
}

frontmatter_name() {
  local skill_md="$1"
  awk '
    NR == 1 && $0 != "---" { exit 1 }
    NR == 1 { next }
    $0 == "---" { exit }
    $1 == "name:" {
      sub(/^name:[[:space:]]*/, "")
      print
      found = 1
      exit
    }
    END { if (!found) exit 1 }
  ' "${skill_md}"
}

extract_section() {
  local source="$1"
  local name="$2"
  awk -v heading="## ${name}" '
    $0 == heading { found=1; next }
    found && /^## / { exit }
    found { print }
  ' "${source}"
}

list_h2() {
  awk '/^## / { print substr($0, 4) }' "$1"
}

# Locked recipe headings, one per line, exact order.
required_headings=$'Job\nResponsibilities\nStandards\nRoutines\nSkills\nTools\nHandoffs'

assert_recipe_headings() {
  local file="$1"
  local got
  got="$(list_h2 "${file}")"
  if [[ "${got}" != "${required_headings}" ]]; then
    fail "${file} must use Job, Responsibilities, Standards, Routines, Skills, Tools, Handoffs in that order"
  fi
}

assert_skills_vs_tools() {
  local file="$1"
  local skills tools
  skills="$(extract_section "${file}" "Skills")"
  tools="$(extract_section "${file}" "Tools")"
  if [[ -z "${tools//[[:space:]]/}" ]]; then
    fail "${file} Tools section is empty; Tools names connectors and runtimes"
  fi
  if ! grep -Fq -- '.agents/skills/' <<<"${skills}"; then
    fail "${file} Skills must name recipe folders under .agents/skills/"
  fi
  if grep -Eiq -- '(^|[^[:alnum:]])(Gmail|Calendar|GitHub|cloud[[:space:]]+agents)([^[:alnum:]]|$)' <<<"${skills}"; then
    fail "${file} Skills names a connector; connectors belong under Tools"
  fi
  if grep -Fq -- '.agents/skills/' <<<"${tools}"; then
    fail "${file} Tools cites a skill folder; recipe folders belong under Skills"
  fi
  if ! grep -Eiq -- 'connector|runtime|MCP|mail|calendar|git|postgres|health|http' <<<"${tools}"; then
    fail "${file} Tools must name connectors and runtimes"
  fi
}

if [[ -e "${repo_root}/skills" ]]; then
  fail "repo-root skills/ must not exist; skills live in .agents/skills/"
fi
# Product recipes stay in .agents/skills/. A pstack verify-* skill may live
# under .cursor/skills/verify-*/ only. Anything else here is a fork.
if [[ -e "${repo_root}/.cursor/skills" ]]; then
  while IFS= read -r skill_md; do
    [[ -n "${skill_md}" ]] || continue
    folder_name="$(basename -- "$(dirname -- "${skill_md}")")"
    if [[ "${folder_name}" != verify-* ]]; then
      fail "do not fork skills into .cursor/skills/; use .agents/skills/ only (${folder_name})"
    fi
    name="$(frontmatter_name "${skill_md}")" || fail "${skill_md} is missing YAML frontmatter name"
    if [[ "${name}" != "${folder_name}" ]]; then
      fail "${skill_md} frontmatter name '${name}' does not match folder '${folder_name}'"
    fi
  done < <(find "${repo_root}/.cursor/skills" -mindepth 2 -maxdepth 2 -type f -name SKILL.md | LC_ALL=C sort)
fi

if [[ ! -d "${skills_root}" ]]; then
  fail "missing ${skills_root}"
fi

skill_count=0
while IFS= read -r skill_md; do
  [[ -n "${skill_md}" ]] || continue
  skill_dir="$(dirname -- "${skill_md}")"
  folder_name="$(basename -- "${skill_dir}")"
  name="$(frontmatter_name "${skill_md}")" || fail "${skill_md} is missing YAML frontmatter name"
  if [[ "${name}" != "${folder_name}" ]]; then
    fail "${skill_md} frontmatter name '${name}' does not match folder '${folder_name}'"
  fi
  skill_count=$((skill_count + 1))
done < <(find "${skills_root}" -mindepth 2 -maxdepth 2 -type f -name SKILL.md | LC_ALL=C sort)

if ((skill_count < 1)); then
  fail "no .agents/skills/*/SKILL.md files found"
fi

if [[ ! -f "${skills_root}/handoff/SKILL.md" ]]; then
  fail "missing ${skills_root}/handoff/SKILL.md"
fi

dream_skill="${skills_root}/dream/SKILL.md"
if [[ ! -f "${dream_skill}" ]]; then
  fail "missing ${dream_skill}"
fi
if ! grep -Fq -- '02:00' "${dream_skill}"; then
  fail "Dream skill does not recommend 02:00"
fi
if ! grep -Fq -- '.agents/skills/foundation-mcp/' "${dream_skill}"; then
  fail "Dream skill does not cite .agents/skills/foundation-mcp/"
fi
if ! grep -Fq -- '.agents/skills/handoff/' "${dream_skill}" && ! grep -Fq -- '../handoff/' "${dream_skill}"; then
  fail "Dream skill does not cite handoff"
fi
if grep -Eiq -- 'current picture' "${dream_skill}"; then
  fail "Dream skill must not write current picture"
fi
if ! grep -Fq -- "rewrites the record from today's activity" "${dream_skill}"; then
  fail "Dream skill does not say it rewrites the record from today's activity"
fi
if ! grep -Fq -- "closes what's done" "${dream_skill}"; then
  fail "Dream skill does not say it closes what's done"
fi
if ! grep -Fq -- 'cleans obvious duplicates' "${dream_skill}"; then
  fail "Dream skill does not say it cleans obvious duplicates"
fi
if ! grep -Fq -- 'system of record' "${dream_skill}"; then
  fail "Dream skill does not say record is the system of record"
fi
if ! grep -Fq -- 'audit log' "${dream_skill}"; then
  fail "Dream skill does not say activity is the audit log"
fi
if ! grep -Fq -- 'start of yesterday' "${dream_skill}"; then
  fail "Dream skill does not set search since to the start of yesterday"
fi
if grep -Eiq -- 'start of today' "${dream_skill}"; then
  fail "Dream skill still sets search since to the start of today"
fi
if ! grep -Fq -- 'due `today` filter' "${dream_skill}"; then
  fail "Dream skill does not warn off the due today filter"
fi
if ! grep -Fq -- 'last waking day' "${dream_skill}"; then
  fail "Dream skill does not name the last waking day"
fi
if ! grep -Fq -- 'target_kind' "${dream_skill}"; then
  fail "Dream skill does not filter list_activity by target_kind"
fi
target_kind_hits="$(grep -o -- 'target_kind' "${dream_skill}" | wc -l)"
if ((target_kind_hits < 2)); then
  fail "Dream skill must name target_kind for both node and edge rows"
fi
if ! grep -Fq -- 'target_id' "${dream_skill}"; then
  fail "Dream skill does not take target_id for node activity"
fi
if ! grep -Fq -- 'from_id' "${dream_skill}"; then
  fail "Dream skill does not take from_id from edge activity"
fi
if ! grep -Fq -- 'to_id' "${dream_skill}"; then
  fail "Dream skill does not take to_id from edge activity"
fi
if ! grep -Fq -- 'Skip `type` and `relation`' "${dream_skill}"; then
  fail "Dream skill does not skip type and relation activity rows"
fi
if grep -Fq -- 'Raise `limit`' "${dream_skill}"; then
  fail "Dream skill still says Raise limit as the page recipe"
fi
if grep -Fq -- 'Raise `limit`' "${repo_root}/docs/SPEC.md"; then
  fail "docs/SPEC.md still says Raise limit as the page recipe"
fi
if grep -Fq -- 'short of `count`' "${dream_skill}"; then
  fail "Dream skill still pages while the page is short of count"
fi
if grep -Fq -- 'short of `count`' "${repo_root}/docs/SPEC.md"; then
  fail "docs/SPEC.md still pages while the page is short of count"
fi
if grep -Fq -- 'until `count` is done' "${repo_root}/docs/GRAPH_HYGIENE.md"; then
  fail "docs/GRAPH_HYGIENE.md still pages until count is done"
fi
if grep -Fq -- 'until `count` is done' "${skills_root}/graph-hygiene/SKILL.md"; then
  fail "graph-hygiene skill still pages until count is done"
fi
if grep -Eq -- 'page\.length[[:space:]]*<[[:space:]]*count|length[[:space:]]*<[[:space:]]*`?count' "${dream_skill}" "${repo_root}/docs/SPEC.md" "${repo_root}/docs/GRAPH_HYGIENE.md" "${skills_root}/graph-hygiene/SKILL.md"; then
  fail "clone copy still teaches while page.length < count"
fi
if ! grep -Fq -- 'until `next` is omitted' "${dream_skill}"; then
  fail "Dream skill does not stop when next is omitted"
fi
if ! grep -Fq -- 'until `next` is omitted' "${repo_root}/docs/SPEC.md"; then
  fail "docs/SPEC.md does not stop when next is omitted"
fi
if grep -Eiq -- 'read-only SQL look|Read-only SQL on localhost|psql on localhost is allowed|SQL look on localhost is allowed' "${repo_root}/docs/GRAPH_HYGIENE.md"; then
  fail "docs/GRAPH_HYGIENE.md still allows a SQL graph scan"
fi
if grep -Eiq -- 'read-only SQL look|SQL look on localhost is allowed|psql on localhost is allowed' "${skills_root}/graph-hygiene/SKILL.md"; then
  fail "graph-hygiene skill still allows a SQL graph scan"
fi

# Product files this Dream PR touches. Do not scan this test file:
# the assertion itself names the locked words.
pr_copy_files=(
  "${dream_skill}"
  "${skills_root}/graph-hygiene/SKILL.md"
  "${skills_root}/vault-health/SKILL.md"
  "${skills_root}/backup-vault/SKILL.md"
  "${skills_root}/update-foundation/SKILL.md"
  "${skills_root}/foundation-mcp/SKILL.md"
  "${skills_root}/handoff/SKILL.md"
  "${skills_root}/repo-leak-scan/SKILL.md"
  "${skills_root}/create-bot/SKILL.md"
  "${skills_root}/create-bot/bot-template.md"
  "${repo_root}/docs/AGENTS.md"
  "${repo_root}/docs/GRAPH_HYGIENE.md"
  "${repo_root}/docs/HARNESS.md"
  "${repo_root}/docs/ARCHITECTURE.md"
  "${repo_root}/docs/SPEC.md"
  "${repo_root}/docs/VAULT_HEALTH.md"
  "${vault_keeper}"
  "${prompts_root}/chief.md"
  "${prompts_root}/executive-assistant.md"
)
for copy in "${pr_copy_files[@]}"; do
  if [[ ! -f "${copy}" ]]; then
    fail "missing ${copy}"
  fi
  if grep -Eiq -- '(^|[^[:alnum:]])(operator|seat)([^[:alnum:]]|$)' "${copy}"; then
    fail "${copy} must not write operator or seat"
  fi
  if grep -Eiq -- '(^|[^[:alnum:]])(docker|compose)([^[:alnum:]]|$)' "${copy}"; then
    fail "${copy} must not write Docker or Compose"
  fi
done

if [[ ! -f "${vault_keeper}" ]]; then
  fail "missing ${vault_keeper}"
fi

routines="$(extract_section "${vault_keeper}" "Routines")"
if [[ -z "${routines}" ]]; then
  fail "Vault Keeper Routines section is empty or missing"
fi

for folder in dream vault-health backup-vault graph-hygiene update-foundation; do
  if ! grep -Fq -- ".agents/skills/${folder}/" <<<"${routines}"; then
    fail "Vault Keeper Routines does not cite .agents/skills/${folder}/"
  fi
done
if ! grep -Fq -- '02:00' <<<"${routines}"; then
  fail "Vault Keeper Routines does not recommend Dream at 02:00"
fi
if ! grep -Fq -- '9:15' <<<"${routines}"; then
  fail "Vault Keeper Routines does not set the health report at 9:15"
fi
if ! grep -Fq -- 'scripts/keep-vault-up.sh' <<<"${routines}"; then
  fail "Vault Keeper Routines does not cite scripts/keep-vault-up.sh"
fi
if ! grep -Fq -- '9:15' "${vault_keeper}"; then
  fail "Vault Keeper does not recommend the weekday health report at 9:15"
fi
if ! grep -Fq -- 'scripts/keep-vault-up.sh' "${vault_keeper}"; then
  fail "Vault Keeper does not name scripts/keep-vault-up.sh"
fi

if grep -E -q -- '(^|[^[:alnum:]._/])skills/(dream|vault-health|backup-vault|graph-hygiene|update-foundation)/' <<<"${routines}"; then
  fail "Vault Keeper Routines still cites repo-root skills/ instead of .agents/skills/"
fi

if grep -E -q -- 'prompts/(vault-health|graph-hygiene|update-foundation|repo-leak-scan|bot-template)\.md' <<<"${routines}"; then
  fail "Vault Keeper Routines still cites a moved prompts/ skill form"
fi

agents_doc="${repo_root}/docs/AGENTS.md"
if [[ ! -f "${agents_doc}" ]]; then
  fail "missing ${agents_doc}"
fi
if ! grep -Fq -- '.agents/skills/dream/' "${agents_doc}"; then
  fail "docs/AGENTS.md does not list .agents/skills/dream/"
fi
if ! grep -Fq -- '02:00' "${agents_doc}"; then
  fail "docs/AGENTS.md does not recommend Dream at 02:00"
fi
if ! grep -Fq -- '9:15' "${agents_doc}"; then
  fail "docs/AGENTS.md does not set the health report at 9:15"
fi
if ! grep -Fq -- 'scripts/keep-vault-up.sh' "${agents_doc}"; then
  fail "docs/AGENTS.md does not name scripts/keep-vault-up.sh"
fi
if grep -Fq -- 'Weekday morning vault-health routine' "${agents_doc}"; then
  fail "docs/AGENTS.md still calls vault-health a weekday morning routine only"
fi
if ! grep -Fq -- '## Everyday words' "${agents_doc}"; then
  fail "docs/AGENTS.md is missing Everyday words"
fi
if ! grep -Fq -- 'Feature brands only: Dream, Vault' "${agents_doc}"; then
  fail "docs/AGENTS.md does not lock Dream and Vault as feature brands"
fi
if ! grep -Fq -- 'Url and repo are ordinary words' "${agents_doc}"; then
  fail "docs/AGENTS.md does not say url and repo are ordinary words"
fi
if ! grep -Fq -- 'Link is the edge verb' "${agents_doc}"; then
  fail "docs/AGENTS.md does not say link is the edge verb"
fi
if ! grep -Fq -- 'every skill that cites the vault ships in the same PR' "${agents_doc}"; then
  fail "docs/AGENTS.md does not lock the same-PR skill rule"
fi
if ! grep -Fq -- $'**record** — the node' "${agents_doc}"; then
  fail "docs/AGENTS.md does not say record is the node"
fi
if ! grep -Fq -- $'**activity** — the audit log' "${agents_doc}"; then
  fail "docs/AGENTS.md does not say activity is the audit log"
fi

chief="${prompts_root}/chief.md"
if [[ ! -f "${chief}" ]]; then
  fail "missing ${chief}"
fi
chief_routines="$(extract_section "${chief}" "Routines")"
chief_skills="$(extract_section "${chief}" "Skills")"
if [[ -z "${chief_routines}" ]]; then
  fail "Chief of Staff Routines section is empty or missing"
fi
if ! grep -Fq -- '.agents/skills/dream/' <<<"${chief_routines}"; then
  fail "Chief of Staff Routines does not cite .agents/skills/dream/"
fi
if ! grep -Fq -- '02:00' <<<"${chief_routines}"; then
  fail "Chief of Staff Routines does not say Vault Keeper runs Dream at 02:00"
fi
if ! grep -Fq -- '08:00' <<<"${chief_routines}"; then
  fail "Chief of Staff Routines does not set the morning brief at 08:00"
fi
if ! grep -Fq -- '.agents/skills/dream/' <<<"${chief_skills}"; then
  fail "Chief of Staff Skills does not cite .agents/skills/dream/"
fi
if ! grep -Fq -- '.agents/skills/vault-health/' <<<"${chief_routines}"; then
  fail "Chief of Staff Routines does not cite .agents/skills/vault-health/"
fi
if ! grep -Fq -- '9:15' <<<"${chief_routines}"; then
  fail "Chief of Staff Routines does not say the health report is 9:15"
fi
if ! grep -Fq -- 'scripts/keep-vault-up.sh' <<<"${chief_routines}"; then
  fail "Chief of Staff Routines does not name scripts/keep-vault-up.sh"
fi
if ! grep -Fq -- 'Do not run them from this bot' <<<"${chief_routines}"; then
  fail "Chief of Staff Routines does not leave vault health to Vault Keeper"
fi
if ! grep -Fq -- '.agents/skills/vault-health/' <<<"${chief_skills}"; then
  fail "Chief of Staff Skills does not cite .agents/skills/vault-health/"
fi
if grep -Eq -- 'search `living`|data\.living|data\.code|search `code`|search `link`|data\.link' "${chief}"; then
  fail "Chief of Staff still uses leftover living/code/link keys"
fi
if ! grep -Fq -- 'search `url`' "${chief}"; then
  fail "Chief of Staff does not search url before upsert"
fi
if ! grep -Fq -- 'Pass `url` `{ system, id }`' "${chief}"; then
  fail "Chief of Staff does not pass url { system, id } on upsert"
fi
if ! grep -Fq -- 'data.repo' "${chief}"; then
  fail "Chief of Staff does not name data.repo for GitHub"
fi
if ! grep -Fq -- 'search `repo`' "${chief}"; then
  fail "Chief of Staff does not search repo before upsert"
fi
if grep -Eiq -- 'wait until|#54|living/code pointer PR' "${dream_skill}"; then
  fail "Dream skill still defers Chief of Staff lines"
fi

spec_doc="${repo_root}/docs/SPEC.md"
mcp_tools_doc="${repo_root}/docs/MCP_TOOLS.md"
arch_doc="${repo_root}/docs/ARCHITECTURE.md"
if [[ ! -f "${spec_doc}" ]]; then
  fail "missing ${spec_doc}"
fi
if grep -Fq -- 'due, link, repo' "${spec_doc}"; then
  fail "docs/SPEC.md rewrite bag still lists link as a data key"
fi
if ! grep -Fq -- 'due, repo, url (https), receipt' "${spec_doc}"; then
  fail "docs/SPEC.md rewrite bag does not keep due, repo, url (https), receipt"
fi
if ! grep -Fq -- 'scripts/keep-vault-up.sh' "${spec_doc}"; then
  fail "docs/SPEC.md instance routines do not name scripts/keep-vault-up.sh"
fi
if ! grep -Fq -- '9:15' "${spec_doc}"; then
  fail "docs/SPEC.md instance routines do not name the weekday 9:15 written report"
fi
if grep -Fq -- 'Merge keeps link' "${spec_doc}"; then
  fail "docs/SPEC.md receipt write still says merge keeps link"
fi
if ! grep -Fq -- 'Merge keeps due and the other live keys' "${spec_doc}"; then
  fail "docs/SPEC.md receipt write does not say merge keeps due and the other live keys"
fi
spec_freeze_needles=(
  '## Agent API (14 tools)'
  'A further tool still needs a SPEC amendment'
  'This amendment adds no tool'
  'It does not add a tool.'
  'No new MCP tool'
  'no new tool'
  '**14 tools**'
)
for needle in "${spec_freeze_needles[@]}"; do
  if grep -Fq -- "${needle}" "${spec_doc}"; then
    fail "docs/SPEC.md still contains freeze phrase: ${needle}"
  fi
done
if [[ ! -f "${mcp_tools_doc}" ]]; then
  fail "missing ${mcp_tools_doc}"
fi
if ! grep -Fq -- 'payload?, data?, url?, status?, metadata?' "${mcp_tools_doc}"; then
  fail "docs/MCP_TOOLS.md upsert In omits top-level url?"
fi
if grep -Fq -- 'payload?, data?, status?, metadata?, base_updated_at?' "${mcp_tools_doc}"; then
  fail "docs/MCP_TOOLS.md upsert In still omits url?"
fi
if ! grep -Fq -- 'Leftover `data.living`, `data.code`, `data.origin`, and `data.link` writes migrate into `url` or `repo` and the leftover keys are stripped.' "${mcp_tools_doc}"; then
  fail "docs/MCP_TOOLS.md leftover writes omit migrate-into-url/repo or do not match SPEC"
fi
if grep -Fq -- 'writes refuse.' "${mcp_tools_doc}" "${spec_doc}"; then
  fail "product docs still say leftover writes refuse"
fi
if grep -Fq -- 'A bad picture' "${mcp_tools_doc}"; then
  fail "docs/MCP_TOOLS.md still says A bad picture"
fi
if ! grep -Fq -- 'A bad body' "${mcp_tools_doc}"; then
  fail "docs/MCP_TOOLS.md does not say A bad body"
fi
if grep -Fq -- 'living vault and graph' "${repo_root}/README.md"; then
  fail "README still says living vault and graph"
fi
if grep -Fq -- 'Runs `scripts/backup-vault.sh`.' "${agents_doc}"; then
  fail "docs/AGENTS.md nightly backup is only Runs scripts/backup-vault.sh"
fi
if ! grep -Fq -- 'dumps localhost Postgres' "${agents_doc}"; then
  fail "docs/AGENTS.md nightly dump does not name localhost Postgres"
fi
if ! grep -Fq -- 'nags if the dump is missing or old' "${agents_doc}"; then
  fail "docs/AGENTS.md nightly backup does not say the bot nags if the dump is missing or old"
fi
if grep -Fq -- 'current picture' "${repo_root}/packages/db/migrations/014_receipt_search_filters.sql"; then
  fail "014_receipt_search_filters.sql still says current picture"
fi
if grep -Fq -- 'Identity stays on' "${repo_root}/packages/db/migrations/014_receipt_search_filters.sql"; then
  fail "014_receipt_search_filters.sql still says Identity stays on data.origin"
fi
if grep -Fq -- 'get the picture' "${repo_root}/packages/schema/src/node-picture.test.ts"; then
  fail "node-picture.test.ts still says get the picture"
fi
if grep -Fq -- 'fiancee dinner' "${repo_root}/apps/viewer/src/format.test.ts"; then
  fail "format.test.ts still uses a fiancee dinner fixture"
fi
if grep -Eiq -- '(^|[^[:alnum:]])operator([^[:alnum:]]|$)' "${repo_root}/packages/schema/src/lookup-classify.ts"; then
  fail "lookup-classify.ts still says operator"
fi
if grep -Eiq -- '(^|[^[:alnum:]])operator([^[:alnum:]]|$)' \
  "${repo_root}/packages/schema/src/type-identity.ts" \
  "${repo_root}/packages/schema/src/type-identity.test.ts"; then
  fail "type-identity still says operator"
fi
if grep -Fq -- 'actor_label: "operator"' "${repo_root}/apps/server/src/cas-safety.test.ts"; then
  fail "cas-safety.test.ts still uses actor_label operator"
fi
if grep -Eiq -- '(^|[^[:alnum:]])operator([^[:alnum:]]|$)' \
  "${repo_root}/packages/schema/src/fields.test.ts" \
  "${repo_root}/apps/server/src/graph.test.ts"; then
  fail "fields.test.ts or graph.test.ts still says operator"
fi
if ! grep -Fq -- 'merge keeps user field' "${repo_root}/packages/schema/src/fields.test.ts"; then
  fail "fields.test.ts does not say merge keeps user field"
fi
if ! grep -Fq -- 'Discrete action — user note.' "${repo_root}/apps/server/src/graph.test.ts"; then
  fail "graph.test.ts does not say Discrete action — user note."
fi
if ! grep -Fq -- 'User description' "${repo_root}/apps/server/src/graph.test.ts"; then
  fail "graph.test.ts does not say User description"
fi
if ! grep -Fq -- 'user { id } clear on a system view survives seed apply' "${repo_root}/apps/server/src/graph.test.ts"; then
  fail "graph.test.ts does not say user { id } clear"
fi
if [[ -f "${repo_root}/apps/viewer/src/components/ui/sheet.tsx" ]]; then
  fail "unused Inspector sheet component is still present"
fi
if grep -Fq -- 'inspector:' "${repo_root}/apps/viewer/tailwind.config.js"; then
  fail "tailwind still has unused width.inspector"
fi
if grep -Fq -- '--radius-sheet' "${repo_root}/apps/viewer/src/styles.css"; then
  fail "styles.css still has unused --radius-sheet"
fi
if ! grep -Fq -- 'data.url: null clears the href' "${repo_root}/apps/server/src/tools/bootstrap.ts"; then
  fail "bootstrap how_to_extend.nodes does not clear href with data.url: null"
fi
if grep -Fq -- 'Url is not unique' "${repo_root}/apps/server/src/tools/bootstrap.ts"; then
  fail "bootstrap how_to_extend.nodes still says Url is not unique"
fi
if grep -Fq -- 'url: null clears; omit the key to leave url unchanged' "${repo_root}/apps/server/src/tools/bootstrap.ts"; then
  fail "bootstrap how_to_extend.nodes still says url: null clears data.url"
fi

foundation_mcp="${skills_root}/foundation-mcp/SKILL.md"
if [[ ! -f "${foundation_mcp}" ]]; then
  fail "missing ${foundation_mcp}"
fi
if ! grep -Fq -- '`search` `{ url }`' "${foundation_mcp}"; then
  fail "foundation-mcp does not search { url } for Gmail, Calendar, Drive"
fi
if ! grep -Fq -- '`search` `{ repo }`' "${foundation_mcp}"; then
  fail "foundation-mcp does not search { repo } for GitHub"
fi
if grep -Eq -- 'search `\{ link \}`|data\.link|search `\{ living \}`|data\.living|search `\{ code \}`|data\.code|current picture' "${foundation_mcp}"; then
  fail "foundation-mcp still uses a retired identity word"
fi

retired_word_hits() {
  local file="$1"
  grep -En -- \
    'data\.link|search `\{ link \}`|search `{ link }`|data\.living|search `\{ living \}`|data\.code|search `\{ code \}`|data\.origin|search `\{ origin \}`|current picture' \
    "${file}" || true
}

retired_fixture="${repo_root}/scripts/retired-words-fixture.md"
if [[ ! -f "${retired_fixture}" ]]; then
  fail "missing ${retired_fixture}"
fi
if [[ -z "$(retired_word_hits "${retired_fixture}")" ]]; then
  fail "retired-words fixture must still show living/code/link-as-search so the grep has a lock"
fi
if ! grep -Fq -- 'data.origin' "${retired_fixture}"; then
  fail "retired-words fixture must still show origin as a Foundation key"
fi
if ! grep -Eiq -- '(^|[^[:alnum:]])operator([^[:alnum:]]|$)' "${retired_fixture}"; then
  fail "retired-words fixture must still show operator"
fi
if [[ -n "$(retired_word_hits "${foundation_mcp}")" ]]; then
  fail "foundation-mcp still has a retired identity line"
fi
while IFS= read -r skill_md; do
  [[ -n "${skill_md}" ]] || continue
  hits="$(retired_word_hits "${skill_md}")"
  if [[ -n "${hits}" ]]; then
    fail "${skill_md} still uses a retired identity word"
  fi
done < <(find "${skills_root}" -mindepth 2 -maxdepth 3 -type f -name '*.md' | LC_ALL=C sort)

# Operator on MCP / glossary skills only. Do not grep the whole tree.
for glossary_skill in \
  "${foundation_mcp}" \
  "${skills_root}/create-bot/SKILL.md" \
  "${skills_root}/create-bot/bot-template.md"
do
  if [[ ! -f "${glossary_skill}" ]]; then
    fail "missing ${glossary_skill}"
  fi
  if grep -Eiq -- '(^|[^[:alnum:]])operator([^[:alnum:]]|$)' "${glossary_skill}"; then
    fail "${glossary_skill} must not write operator"
  fi
done

if [[ ! -d "${prompts_root}" ]]; then
  fail "missing ${prompts_root}"
fi

mapfile -t prompt_files < <(find "${prompts_root}" -maxdepth 1 -type f -name '*.md' | LC_ALL=C sort)
expected_bots=(
  "${prompts_root}/chief.md"
  "${prompts_root}/executive-assistant.md"
  "${prompts_root}/vault-keeper.md"
)
if ((${#prompt_files[@]} != ${#expected_bots[@]})); then
  fail "prompts/ should contain only the three starter bots, found: ${prompt_files[*]-}"
fi
for i in "${!expected_bots[@]}"; do
  if [[ "${prompt_files[$i]}" != "${expected_bots[$i]}" ]]; then
    fail "prompts/ should contain only the three starter bots, found: ${prompt_files[*]}"
  fi
done

if [[ ! -f "${skills_root}/create-bot/bot-template.md" ]]; then
  fail "missing ${skills_root}/create-bot/bot-template.md"
fi
if [[ -e "${prompts_root}/bot-template.md" ]]; then
  fail "leftover prompts/bot-template.md; template belongs under .agents/skills/create-bot/"
fi

recipe_files=(
  "${prompts_root}/chief.md"
  "${prompts_root}/executive-assistant.md"
  "${prompts_root}/vault-keeper.md"
  "${skills_root}/create-bot/bot-template.md"
)
for recipe in "${recipe_files[@]}"; do
  assert_recipe_headings "${recipe}"
  assert_skills_vs_tools "${recipe}"
done

# confirm: true is no longer the destructive gate. Clone copy must not teach it.
clone_copy_confirm=(
  "${repo_root}/README.md"
  "${repo_root}/docs"
  "${repo_root}/prompts"
  "${skills_root}"
)
confirm_hits="$(grep -RFn -- 'confirm: true' "${clone_copy_confirm[@]}" || true)"
if [[ -n "${confirm_hits}" ]]; then
  fail "clone copy still requires confirm: true as the destructive gate"$'\n'"${confirm_hits}"
fi
if ! grep -Fq -- 'destructive scope' "${foundation_mcp}"; then
  fail "foundation-mcp does not teach destructive scope"
fi
if ! grep -Fq -- 'destructive scope' "${repo_root}/docs/SPEC.md"; then
  fail "docs/SPEC.md does not teach destructive scope"
fi
if ! grep -Fq -- 'mint-api-key.sh' "${repo_root}/docs/HARNESS.md"; then
  fail "docs/HARNESS.md does not tell a clone how to mint a named key"
fi

echo "skills-layout.test: ok"
