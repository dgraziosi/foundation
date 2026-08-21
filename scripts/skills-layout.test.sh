#!/usr/bin/env bash
# Assert the product skills tree: folder name matches SKILL.md frontmatter
# name, handoff exists, Vault Keeper procedure routines cite
# .agents/skills/<name>/, prompts/ is the three starter bots only, the
# blank bot template lives under create-bot, and starters plus the
# template use Job, Responsibilities, Standards, Routines, Skills,
# Tools, Handoffs with Skills vs Tools split.
# Does not launch harnesses or Compose.
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
  if ! grep -Eiq -- 'connector|runtime|MCP|mail|calendar|git|docker|health|http' <<<"${tools}"; then
    fail "${file} Tools must name connectors and runtimes"
  fi
}

if [[ -e "${repo_root}/skills" ]]; then
  fail "repo-root skills/ must not exist; skills live in .agents/skills/"
fi
if [[ -e "${repo_root}/.cursor/skills" ]]; then
  fail "do not fork skills into .cursor/skills/; use .agents/skills/ only"
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

if [[ ! -f "${vault_keeper}" ]]; then
  fail "missing ${vault_keeper}"
fi

routines="$(extract_section "${vault_keeper}" "Routines")"
if [[ -z "${routines}" ]]; then
  fail "Vault Keeper Routines section is empty or missing"
fi

for folder in vault-health backup-vault graph-hygiene update-foundation; do
  if ! grep -Fq -- ".agents/skills/${folder}/" <<<"${routines}"; then
    fail "Vault Keeper Routines does not cite .agents/skills/${folder}/"
  fi
done

if grep -E -q -- '(^|[^[:alnum:]._/])skills/(vault-health|backup-vault|graph-hygiene|update-foundation)/' <<<"${routines}"; then
  fail "Vault Keeper Routines still cites repo-root skills/ instead of .agents/skills/"
fi

if grep -E -q -- 'prompts/(vault-health|graph-hygiene|update-foundation|repo-leak-scan|bot-template)\.md' <<<"${routines}"; then
  fail "Vault Keeper Routines still cites a moved prompts/ skill form"
fi

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

echo "skills-layout.test: ok"
