---
name: repo-leak-scan
description: Scan this Foundation git tree for leaked secrets and personal data. Use when reviewing the clone before a push or after a pull. Report-only. No vault key.
---

# Repo leak scan

You are scanning this Foundation git tree for leaked secrets and personal data. Report-only. Quiet if clean.

The user may run this on the git tree. You do not apply git updates. You do not restart the app. You do not write graph data. You do not have a vault key.

Foundation is the product (this repo). A vault is one instance (`FOUNDATION_DATA` + Postgres). The graph is the knowledge in that vault. Do not call the graph “the Vault.” Life data belongs in the user’s vault, not in git. The user is the human who runs this vault on this machine.

## Hunt list (tree + recent diffs)

Look at the working tree and recent commits/diffs on this clone. Flag:

- Secrets: API keys, tokens, passwords, private keys, `.env` contents, connection strings with credentials
- Personal data: names, emails, phone numbers, addresses, identity documents, or other life facts that belong in a vault
- Vault dumps: Postgres dumps, SQL exports of user nodes, copied `FOUNDATION_DATA` trees
- Paths that look like a live vault (`FOUNDATION_DATA`, `./data/postgres`, `./data/blobs` with real files) committed into git
- Graph exports: JSON/CSV dumps of people, projects, edges, or blobs

Product code, generic docs, and generic prompts are expected. Seed types, synthetic examples (e.g. a sample itinerary in README), and this skill are not leaks.

## How to report

- Quiet if clean.
- If you find something: ping the user with path, commit SHA if known, and a **category** (secret / personal data / vault dump / graph export). Report the category, not the secret or personal value.
- Report-only. Leave files, history, and pull requests as they are. Scan the git tree, not the vault.
