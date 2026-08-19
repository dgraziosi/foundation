#!/usr/bin/env bash
# Assert the product skills tree: folder name matches SKILL.md frontmatter
# name, Vault Keeper procedure routines cite skills/<name>/, prompts/ is
# seats only, and the blank bot template lives under create-bot.
# Does not launch harnesses or Compose.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
skills_root="${repo_root}/skills"
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
  fail "no skills/*/SKILL.md files found"
fi

if [[ ! -f "${vault_keeper}" ]]; then
  fail "missing ${vault_keeper}"
fi

routines="$(extract_section "${vault_keeper}" "Routines")"
if [[ -z "${routines}" ]]; then
  fail "Vault Keeper Routines section is empty or missing"
fi

for folder in vault-health backup-vault graph-hygiene update-foundation; do
  if ! grep -Fq -- "skills/${folder}/" <<<"${routines}"; then
    fail "Vault Keeper Routines does not cite skills/${folder}/"
  fi
done

if grep -E -q -- 'prompts/(vault-health|graph-hygiene|update-foundation|repo-leak-scan|bot-template)\.md' <<<"${routines}"; then
  fail "Vault Keeper Routines still cites a moved prompts/ skill form"
fi

if [[ ! -d "${prompts_root}" ]]; then
  fail "missing ${prompts_root}"
fi

mapfile -t prompt_files < <(find "${prompts_root}" -maxdepth 1 -type f -name '*.md' | LC_ALL=C sort)
expected_seats=(
  "${prompts_root}/chief.md"
  "${prompts_root}/executive-assistant.md"
  "${prompts_root}/vault-keeper.md"
)
if ((${#prompt_files[@]} != ${#expected_seats[@]})); then
  fail "prompts/ should contain only the three seats, found: ${prompt_files[*]-}"
fi
for i in "${!expected_seats[@]}"; do
  if [[ "${prompt_files[$i]}" != "${expected_seats[$i]}" ]]; then
    fail "prompts/ should contain only the three seats, found: ${prompt_files[*]}"
  fi
done

if [[ ! -f "${skills_root}/create-bot/bot-template.md" ]]; then
  fail "missing ${skills_root}/create-bot/bot-template.md"
fi
if [[ -e "${prompts_root}/bot-template.md" ]]; then
  fail "leftover prompts/bot-template.md; template belongs under skills/create-bot/"
fi

echo "skills-layout.test: ok"
