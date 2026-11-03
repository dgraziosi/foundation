# Harden a fresh Foundation clone

A person who clones this public repo and runs the documented first-run path ends with a vault only they can open. Other programs, other accounts on the same machine, and a browser open to arbitrary websites cannot. Fail closed. Keep that first run one command. The program is two PRs, `harden-1` then `harden-2`. Do not enable auto-merge.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`. The operator lands `harden-1` and `harden-2`. Owners stop at merge-ready. Nobody merges. Nobody enables auto-merge.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `git show origin/main:pstack/skills/swarm/SKILL.md`
  - [ ] `git show origin/main:.cursor/skills/verify-foundation/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `git show origin/main:pstack/skills/how/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/interrogate/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/technical-writing/SKILL.md`
  - [ ] `git show origin/main:pstack/skills/unslop/SKILL.md`
- [ ] On the operator's go, arm the audit tick as `/loop 1h` with the tick prompt below. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] `harden-1` is first. It branches from `main`.
  - [ ] `harden-2` after `harden-1`. Stack it on the `harden-1` branch so the lockfile and first-run contract stay one story.
- [ ] Hold the file boundaries. `harden-1` owns first-run scripts, server HTTP, config, docs, verify-foundation, and runtime dependency bumps. `harden-2` owns blobs, export, schema persist, and CI workflow pins. The two PRs do not edit the same path.
- [ ] Hold the review gate. `harden-1` changes Unlock and first-run. It waits for the operator's review in chat with screenshots and a video before merge-ready is handed over.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, per **Opening a PR**. Use the run's built-in PR tool when it has one, else `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only at merge prep, on a `git merge-tree` conflict with trunk, on a CI failure that comes from a change on trunk, or when a known concurrent change to the same files lands.

### Verdict and merge, for every PR

- [ ] A full swarm runs once, at the code-ready head. Another full swarm runs only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head, and a wording-only change gets none. Run each full swarm per `pstack/skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. Two or more audit lanes, each with its own focus, that read the diff and the receipts and distrust the PR body. The root audits the receipts in the merge-ready report before the verdict.
- [ ] Judge every finding by the execution playbook's blocking rule. The verdict is clean when none blocks. A failure on trunk behavior in a lane marked `Regression lane against trunk.` is recorded against trunk and does not block the PR. A new head gets a fresh verdict, except for results that stay valid under the patch-id rule in `playbooks/shipping.md`.
- [ ] Stop at verified and green. Hand the PR to the operator. Do not merge. Do not enable auto-merge. After handoff, nobody pushes without the operator's go. A restack that leaves `git patch-id` unchanged keeps its verdict.

### Boot recipe, for every live lane

Each live lane runs on its own cloud VM at the PR head. Drive Viewer through `.cursor/skills/verify-foundation/SKILL.md`. Drive scripts and HTTP with the repo's throwaway launch helper and `curl`.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Launch a throwaway vault with `.cursor/skills/verify-foundation/scripts/verify-foundation.sh launch`. Wait until `GET http://127.0.0.1:8787/health` returns `ok` and `db` up.
- [ ] Deliver Viewer input only through the verify-foundation recipes. Read-only diagnostics are `doctor`, `curl` against `/health`, and the access log file under the throwaway `FOUNDATION_DATA`. Never print a key. Pass keys through env or the helper's mode-600 key files.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Harden first-run secrets and the HTTP door (harden-1)

**Depends on.** None.

**Files.**

- [ ] Edit `scripts/keep-vault-up.sh`.
- [ ] Edit `scripts/keep-vault-up.test.sh`.
- [ ] Edit `scripts/foundation-init.sh`.
- [ ] Edit `scripts/foundation-init.test.sh`.
- [ ] Edit `apps/server/src/config.ts`.
- [ ] Edit `apps/server/src/config.test.ts`.
- [ ] Edit `apps/server/src/app.ts`.
- [ ] Edit `apps/server/src/auth.ts`.
- [ ] Edit `apps/server/src/auth.test.ts`.
- [ ] Edit `apps/server/src/view.ts`.
- [ ] Edit `apps/server/src/view.test.ts`.
- [ ] Edit `apps/server/src/view-door.ts`.
- [ ] Edit `apps/server/src/view-door.test.ts`.
- [ ] Edit `apps/server/src/keyring.ts`.
- [ ] Edit `apps/server/src/keyring.test.ts`.
- [ ] Edit `apps/server/src/mcp.ts`.
- [ ] Edit `apps/server/package.json`.
- [ ] Edit `pnpm-lock.yaml`.
- [ ] Edit `.env.example`.
- [ ] Edit `README.md`.
- [ ] Edit `docs/VIEWER.md`.
- [ ] Edit `docs/SPEC.md`.
- [ ] Edit `docs/HARNESS.md`.
- [ ] Edit `docs/ARCHITECTURE.md`.
- [ ] Edit `docs/VAULT_HEALTH.md`.
- [ ] Edit `.cursor/skills/verify-foundation/SKILL.md`.
- [ ] Edit `.cursor/skills/verify-foundation/features/unlock.md`.
- [ ] Edit `.agents/skills/foundation-mcp/SKILL.md`.
- [ ] Create `apps/server/src/secret-compare.ts`.
- [ ] Create `apps/server/src/host-guard.ts`.
- [ ] Create `apps/server/src/access-log.ts`.
- [ ] Create `apps/server/src/view-session.ts`.
- [ ] Create `apps/server/src/host-guard.test.ts`.
- [ ] Create `apps/server/src/access-log.test.ts`.
- [ ] Create `apps/server/src/view-session.test.ts`.
- [ ] Create `apps/server/src/secret-compare.test.ts`.

**Build.**

- [ ] Mint `FOUNDATION_API_KEY` and `FOUNDATION_VIEW_KEY` in `foundation_init_ensure_env` when `.env` is missing, and mint a missing view key on an existing `.env`. Write `.env` mode 600. Write `FOUNDATION_DATA` mode 700. Never print a key.
- [ ] Refuse published placeholder strings and short secrets in `loadConfig`. The published API key and the published database password in `.env.example` must not start the server.
- [ ] Run `initdb` with `--auth-local=peer --auth-host=scram-sha-256`. Pin `listen_addresses` to localhost in `postgresql.conf`. Keep the existing `pg_ctl` `-h 127.0.0.1` flag.
- [ ] Create the app role as `LOGIN` without `SUPERUSER`. Grant it ownership of the app database. Create `pgcrypto`, `unaccent`, `pg_trgm`, and `vector` as the OS superuser over the vault socket before `pnpm start` migrate.
- [ ] Add an idempotent keep-up upgrade that rewrites `pg_hba.conf`, sets a random password when the URL is missing or published, updates `DATABASE_URL` in `.env`, reloads Postgres, then `ALTER ROLE ... NOSUPERUSER` only after extensions and grants exist. Leave graph data in place.
- [ ] Start the app with `env -i` and only the variables `pnpm start` needs, plus the config keys. Do not inherit the launching shell.
- [ ] Compare secrets as SHA-256 digests of equal width in `secret-compare.ts`. Use that helper from `ViewDoor` and `Keyring`.
- [ ] In `ViewDoor.tryUnlock`, return throttle before any compare when that source is locked. Count a failed header on `/mcp` and `/view/api` against the same kind of budget and return 429 before compare when locked.
- [ ] Require `FOUNDATION_VIEW_KEY`. Delete the fallback lock that treats a bot key as the vault key. Keep Viewer writes on `VIEWER_WRITE` with destructive true, because the person who typed the vault key owns the vault.
- [ ] Store a random session id in the `foundation_key` cookie. Persist hashed sessions under `FOUNDATION_DATA` mode 600. Set `Secure` when the request is TLS. Refuse `VIEW_HOST=0.0.0.0` unless the request is TLS or `VIEW_PUBLIC_ORIGIN` names the tunnel route.
- [ ] Reject a `Host` that is not localhost or `127.0.0.1` unless `FOUNDATION_ALLOWED_HOSTS` lists it. Check `Origin` on browser-facing writes to `/view`.
- [ ] Parse `/mcp` JSON after `requireApiKey` with a small limit. Drop the global 32 MB parse that runs before auth.
- [ ] Write a rotated access log under `FOUNDATION_DATA/logs` mode 600, directory 700. Each line is time, source IP, key label, route, and status. Log auth and unlock failures. Never log a secret.
- [ ] Upgrade `@modelcontextprotocol/sdk`, `express` (and its `body-parser`, `proxy-addr`, `qs`), `zod` if a patched release reaches runtime, and the other high or critical prod audit hits that reach the server or Viewer. Set `enableDnsRebindingProtection` on `StreamableHTTPServerTransport`.
- [ ] Rewrite first-run copy in positive words. The clone starts locked to the person who ran init. Off-box is an explicit TLS or named-origin path, not a hint to bind every interface on plain HTTP.

**You see.**

- [ ] A first-day `scripts/foundation-init.sh` produces a mode-600 `.env` with two minted keys and a random `DATABASE_URL` password, then a healthy `/health` of only `ok`, `service`, and `db`.
- [ ] `psql` as a stranger on the same machine using trust fails. The app role is not a superuser. `listen_addresses` is localhost.
- [ ] `loadConfig` throws on `change-me-to-a-long-random-string` and on `change-me-to-a-password`.
- [ ] Unlock with the house key returns 401. Unlock with the view key sets a cookie whose value is not the view key.
- [ ] Five failed unlocks, then a sixth while locked, return 429 without a successful compare. A later correct key during cooldown also returns 429.
- [ ] `Host: evil.example` against `/mcp` or `/view` returns 400 or 403.
- [ ] `GET /health` without a key still returns only `ok`, `service`, and `db`.
- [ ] The access log names a key label and never contains the secret.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/server/src/config.test.ts` refuses published and short secrets, and requires `FOUNDATION_VIEW_KEY`. Run `pnpm --filter @foundation/server test`.
- [ ] `apps/server/src/view-door.test.ts` throttles before compare and drops the fallback lock.
- [ ] `apps/server/src/secret-compare.test.ts` shows equal-width digest compare.
- [ ] `apps/server/src/auth.test.ts` and a new header-budget case return 429 before a compare.
- [ ] `apps/server/src/view-session.test.ts` stores a session id, not the raw key, and sets `Secure` on TLS.
- [ ] `apps/server/src/host-guard.test.ts` rejects a foreign Host and a foreign Origin on a view write.
- [ ] `apps/server/src/access-log.test.ts` writes the five fields and redacts secrets.
- [ ] `apps/server/src/health.test.ts` still asserts the public shape.
- [ ] `scripts/foundation-init.test.sh` asserts mint, mode 600, and no key on stdout.
- [ ] `scripts/keep-vault-up.test.sh` asserts peer plus scram, localhost listen, non-superuser role, env -i start, and a second run that does not rewrite a healthy cluster.
- [ ] `bash scripts/harness-docs.test.sh` still passes after the positive-copy doc edit.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run first-day keep-up plus Unlock plus Home at trunk and head. Trunk still accepts the house key when `FOUNDATION_VIEW_KEY` is unset. Head refuses the house key and opens only with the minted view key, then paints Home. Save `harden-1-regression.png`. Pass when both sides reach a healthy `/health` and head Home is the Today page.
- [ ] Lane 2. First-day init on an empty clone. Save `harden-1-init-modes.png`. Pass when `.env` is 600, `FOUNDATION_DATA` is 700, both keys exist, and process stdout has no secret.
- [ ] Lane 3. Inspect the throwaway cluster. Save `harden-1-pg-hba.png`. Pass when `pg_hba.conf` has no `trust` line for local or loopback, `listen_addresses` is localhost, and `pg_roles.rolsuper` is false for the app role.
- [ ] Lane 4. POST `/view/unlock` with a foreign Host. Save `harden-1-host-reject.png`. Pass when the status is 400 or 403 and no session cookie is set.
- [ ] Lane 5. Five wrong unlocks, then a sixth, then the correct view key while locked. Save `harden-1-unlock-429.png`. Pass when the locked tries are 429 with `Retry-After` and Unlock still shows **That key did not unlock.**
- [ ] Lane 6. Five wrong `Authorization` headers on `/mcp`, then a sixth. Save `harden-1-mcp-429.png`. Pass when the locked try is 429 and the JSON-RPC body is unauthorized, not a tool result.
- [ ] Lane 7. Unlock on localhost, then read `Set-Cookie`. Save `harden-1-session-cookie.png`. Pass when the cookie value is not the view key, `HttpOnly` and `SameSite=Strict` are set, and `/mcp` with that cookie is 401.
- [ ] Lane 8. Off-box bind without TLS and without `VIEW_PUBLIC_ORIGIN`. Save `harden-1-offbox-refuse.png`. Pass when keep-up or boot refuses to publish `0.0.0.0` on plain HTTP.
- [ ] Lane 9. Unauthenticated `/health`, then a wrong key, then the API key. Save `harden-1-health-shape.png`. Pass when the first two bodies have only `ok`, `service`, and `db`, and the keyed body may add bind fields.
- [ ] Lane 10. Existing-install upgrade. Start from a trunk trust cluster with people in the graph, run head keep-up, then open Viewer with the minted view key. Save `harden-1-upgrade.png`. Pass when node count is unchanged, `DATABASE_URL` has a non-published password, and Home shows a known title from the old graph.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Warm keep-up to `/health` 200 wall time in milliseconds, and `/view/unlock` POST duration in milliseconds, measured at trunk and at head.
- [ ] Probe. Interleave trunk and head. On each side launch the throwaway vault, `curl` `/health` until 200, then POST unlock once with the key that side accepts. Repeat the pair ten times.
- [ ] Baseline. Record the trunk health-ready time and unlock time first.
- [ ] Rule. Head health-ready may not exceed trunk plus 20 percent. Head unlock may not exceed trunk plus 50 milliseconds. A compare of unlike first-day paths is not a ratio. Use the warm-cluster path on both sides.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1, lane 5, and lane 10 screenshots into `/tmp/media/harden-1-review-regression.png`, `/tmp/media/harden-1-review-unlock.png`, and `/tmp/media/harden-1-review-upgrade.png`.
- [ ] Record a 30 to 60 second video of first-day init, Unlock with the view key, and Home on a lane VM. Save it as `/tmp/media/harden-1-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends `harden-1` to the base-branch stack. The operator lands it. Do not squash-merge from the owner. Do not enable auto-merge.

## Isolate file, schema, and CI guards (harden-2)

**Depends on.** harden-1.

**Files.**

- [ ] Edit `packages/db/src/blobs.ts`.
- [ ] Edit `packages/db` blob tests that assert `UPLOAD_DIR_MODE` or the realpath ingest path.
- [ ] Edit `scripts/lib/foundation_portability.py`.
- [ ] Edit `scripts/foundation-portability.test.sh`.
- [ ] Edit `apps/server/src/graph.ts` only at the `manage_type` json_schema persist branches.
- [ ] Edit the `manage_type` tests that today allow a raw `json_schema` with an empty field list.
- [ ] Edit `packages/schema/src/json-schema.ts` only if compile stays on field-built objects.
- [ ] Edit `packages/schema/src/json-schema.test.ts`.
- [ ] Edit `.github/workflows/verify.yml`.
- [ ] Do not edit any `harden-1` path.

**Build.**

- [ ] In `write_export`, accept a type slug only when it matches the type-name rule already used for fields (`^[a-z][a-z0-9_]*$` or the live type slug regex if one is stricter). Resolve each write path and refuse any path outside `--out`.
- [ ] Change `UPLOAD_DIR_MODE` to `0o700`. Open upload and blob files with `O_NOFOLLOW` (and `O_NOFOLLOW` on the directory fd) so a realpath-then-read swap cannot follow a symlink.
- [ ] Persist `json_schema` only from `compileJsonSchemaFromFields`. Refuse a raw `json_schema` on create and update, including the empty-fields branch in `manageType`.
- [ ] Pin third-party GitHub Actions in `verify.yml` to full SHAs. Set top-level `permissions: contents: read`.

**You see.**

- [ ] `write_export` with type `../../tmp` writes nothing outside `--out` and exits nonzero.
- [ ] A new vault's `uploads/` is 0700. Ingest of a symlink under `uploads/` fails closed.
- [ ] `manage_type` with a hostile Ajv schema and no fields returns `{ error, suggestion }` and stores no schema.
- [ ] `verify.yml` has SHA-pinned `actions/checkout`, `pnpm/action-setup`, and `actions/setup-node`, plus `permissions: contents: read`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scripts/foundation-portability.test.sh` adds a traversal type slug and an outside-`--out` case. Run `bash scripts/foundation-portability.test.sh`.
- [ ] Blob tests assert mode 0700 and a symlink ingest miss. Run `pnpm --filter @foundation/server test` for the blob file.
- [ ] `manage_type` tests refuse a raw schema. Field-compiled schemas still validate upsert. Run `pnpm --filter @foundation/schema test` and the graph manage_type cases.
- [ ] A workflow test or `scripts/skills-layout.test.sh` sibling asserts SHA pins and `contents: read` if the repo already greps workflows. Otherwise add a small shell assert next to the existing verify-foundation workflow checks.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Export a throwaway vault that has one `note` and one `task` at trunk and at head. Save `harden-2-regression-export.png`. Pass when both sides write `foundation.json` plus markdown under `--out`, and head node ids match trunk.
- [ ] Lane 2. Export a snapshot whose type is `../../escape`. Save `harden-2-export-traverse.png`. Pass when the process exits nonzero and the parent of `--out` has no new file.
- [ ] Lane 3. Export a legal slug and confirm every written path is inside `--out`. Save `harden-2-export-inside.png`. Pass when `realpath` of each file has the `--out` prefix.
- [ ] Lane 4. Stat `uploads/` on a launched vault. Save `harden-2-uploads-mode.png`. Pass when the mode is 0700.
- [ ] Lane 5. Place a symlink in `uploads/` and ingest it. Save `harden-2-nofollow.png`. Pass when ingest returns an error and `blobs/` gains no file.
- [ ] Lane 6. Ingest a regular file under `uploads/`. Save `harden-2-blob-ok.png`. Pass when the blob GET with the API key returns the bytes.
- [ ] Lane 7. `manage_type` create with empty fields and a large `$ref` loop schema. Save `harden-2-schema-refuse.png`. Pass when the tool returns an error and `inspect_ontology` shows no stored schema.
- [ ] Lane 8. `manage_type` with a normal field list, then upsert that matches. Save `harden-2-schema-fields.png`. Pass when upsert succeeds.
- [ ] Lane 9. Read `.github/workflows/verify.yml` at the head SHA. Save `harden-2-ci-pins.png`. Pass when each `uses:` third-party action is a 40-character SHA and `permissions.contents` is `read`.
- [ ] Lane 10. Re-run verify-foundation Unlock and Home on the same vault after the blob and export probes. Save `harden-2-viewer-still.png`. Pass when Home still paints Today and a known title.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Export wall time in milliseconds for a 50-node snapshot, and ingest wall time in milliseconds for a 1 MiB regular file, at trunk and at head.
- [ ] Probe. Interleave trunk and head. Build the same snapshot and the same file on both sides. Time `foundation_portability` export and one blob ingest.
- [ ] Baseline. Record the trunk export time and ingest time first.
- [ ] Rule. Head export may not exceed trunk plus 20 percent. Head ingest may not exceed trunk plus 20 percent. Both sides must produce the metric on the same snapshot and file.

**Review gate.** None. harden-2 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto the `harden-1` branch after the verdict, patch-id unchanged.
- [ ] The root appends `harden-2` onto `harden-1`. The operator lands the stack bottom-up. Do not merge from the owner. Do not enable auto-merge.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

No prototype ran. Each contested audit line was settled by reading the files on `main` at `f0e0708`.

Settled from the tree.

- Finding 1 is confirmed for trust and `SUPERUSER`. `foundation_keep_vault_up_init_postgres` calls `initdb` with no `--auth`. `foundation_keep_vault_up_app_role_sql` creates `LOGIN SUPERUSER`. Listen is already pinned at start by `foundation_keep_vault_up_postgres_listen_args` (`-h 127.0.0.1`). Still write `listen_addresses` in `postgresql.conf` so a manual `pg_ctl` without `-h` does not widen the bind. The app already uses TCP `DATABASE_URL` on localhost. keep-up already talks to the OS superuser over the vault socket. `--auth-local=peer --auth-host=scram-sha-256` matches that split.
- Finding 2 is confirmed. `foundation_init_ensure_env` copies `.env.example` and does not mint. `loadConfig` accepts any nonempty `FOUNDATION_API_KEY`. `.env.example` ships `change-me-to-a-long-random-string` and `change-me-to-a-password`.
- Finding 3 is confirmed. `cp` writes `.env` at the umask, usually 644. There is no `keys/` directory. Treat `FOUNDATION_DATA` as the secret directory (700) and `.env` plus `api-keys.json` as 600. `mint-api-key.sh` already chmods the keys file.
- Finding 4 is confirmed. `StreamableHTTPServerTransport` is constructed with only `sessionIdGenerator`. `security.ts` has no Host check. `view.test.ts` even unlocks with an off-box Host.
- Finding 5 is confirmed. `ViewDoor.tryUnlock` compares, then checks cooldown. `view-door.test.ts` currently requires a correct key to open during cooldown. `requireViewAuth` uses `admit`, which has no budget. `requireApiKey` has no budget.
- Finding 6 is confirmed as documented behavior, not a coding accident. `windowLockOf` falls back to the keyring. `VIEWER_WRITE` is always destructive. The fix is a dedicated view key, not a carry of the bot flag. Init mints the view key so first-run stays one command.
- Finding 7 is confirmed. `apiKeyCookieHeader` stores the raw key for 2592000 seconds, HttpOnly, SameSite Strict, no Secure. README tells the operator to set `VIEW_HOST=0.0.0.0`.
- Finding 8 is confirmed. There is no request access log. Graph `activity` is a different log.
- Finding 9 is confirmed in part. `timingSafeEqual` is already used, but `safeEqualUtf8` returns early when lengths differ, so length leaks. Digest compare removes that.
- Finding 10 is already done. `registerHealth` and `apps/server/src/health.test.ts` already keep the public body to `ok`, `service`, and `db`. Do not reopen it except as a regression lane.
- Finding 11 is confirmed. `write_export` joins `node.type` into markdown folders and CSV names. `safe_filename` only sanitizes the title.
- Finding 12 is confirmed. `UPLOAD_DIR_MODE` is `0o1777`. Ingest `realpath`s then `readFile`s.
- Finding 13 is confirmed in part. `manageType` compiles from fields when a field list exists, and already refuses a raw schema in that case. An empty field list still persists `input.json_schema`. `validateDataAgainstJsonSchema` then `ajv.compile`s whatever was stored.
- Finding 14 is confirmed. `createApp` runs `express.json({ limit: "32mb" })` before `requireApiKey`. `@modelcontextprotocol/sdk` is `^1.30.0`. `pnpm audit --prod` reports high or critical on that SDK, `express` then `body-parser` / `proxy-addr` / `qs`, `zod`, `ajv` then `fast-uri`, and Viewer `dompurify`.
- Finding 15 is confirmed. `.github/workflows/verify.yml` uses `actions/checkout@v4`, `pnpm/action-setup@v4`, and `actions/setup-node@v4`, with no `permissions` block.
- Finding 16 is confirmed. `foundation_keep_vault_up_start_app` runs `nohup pnpm start` in a subshell that inherits the whole environment.
- Finding 17 is already done and stronger than the ask. `scripts/backup-vault.sh` already requires `BACKUP_AGE_RECIPIENT`, encrypts with age, writes mode 0600, and prunes with `BACKUP_KEEP_DAYS` (default 14). Do not make encryption optional. Do not turn it off by default.

Still unproven until `harden-1` runs on a throwaway vault.

- The exact `GRANT` list that lets migrate and runtime work after `NOSUPERUSER`. Owner of the database plus keep-up-created extensions is the planned set. Prove it by running migrate on a non-superuser role.
- Whether `env -i` must pass extra Node or pnpm variables beyond PATH, HOME, and the config keys. Prove it by starting the app from a dirty shell and a clean allowlist.

## Appendix B. Alternatives rejected

One PR. It would mix Postgres auth, Viewer cookies, Ajv, and CI pins. Review would stall. Two PRs keep the "only they can open it" promise in `harden-1` and the isolated file guards in `harden-2`.

Three PRs that split `view-door.ts` or `config.ts`. Unlock throttle, view-key require, and digest compare all live in `view-door.ts`. Host, session, and body parse need the new config keys. Splitting those files would violate the no-shared-path rule.

Carry the bot's destructive flag into Viewer writes. That still lets any bot key open `/view` when the view key is missing. A dedicated minted view key is the smaller fail-closed rule and keeps first-run one command.

Keep the house-key fallback and only document the risk. A fresh clone that copies `.env.example` would still open `/view` with a published key.

`--auth-local=scram` for the vault socket. keep-up's `psql` is the OS superuser over that socket. Peer matches that path. Scram stays on TCP for the app.

Leave backup encryption optional. The script already fails closed without a recipient. Weakening it would move the product backward.

Reopen `/health`. The public shape is already the one the audit asked for.

## Appendix C. Risks

- Lockout on an existing `.env` that still has the published API key or password. `harden-1` keep-up mints replacements into `.env` and does not print them. The owner re-reads `.env`. A start that still sees a published value refuses to boot.
- Lockout on an existing vault with no `FOUNDATION_VIEW_KEY`. keep-up mints one into `.env` on the first head start. Viewer then accepts only that key. The house key stops opening `/view`.
- Lockout if `ALTER ROLE NOSUPERUSER` runs before extensions exist. The upgrade creates extensions first, then grants, then drops superuser. A failed step leaves the previous `pg_hba` in place when the rewrite is a temp file plus rename.
- Lockout from throttle-before-compare. Five failures lock that source for the budget cooldown, including a later correct key. That is the fail-closed choice. Unlock already shows **That key did not unlock.** and `Retry-After`.
- Lockout for an owner who already binds `VIEW_HOST=0.0.0.0` on plain HTTP. Head refuses that bind until they set TLS or `VIEW_PUBLIC_ORIGIN`. Document the named-origin path in README with positive copy.
- `env -i` drops a variable `pnpm` needs. The live lane starts from a dirty shell. If boot fails, add only the missing name to the allowlist.
- pstack playbook paths under `origin/main:pstack/...` are not in this git tree. They live in the Cursor plugin. Owners read the plugin copies when `git show` misses. The control skill that is in this tree is `.cursor/skills/verify-foundation/SKILL.md`.
- `harden-2` stacked on `harden-1` restacks when the parent moves. Keep patch-id stable.

## Appendix D. Links and reading list

Read before editing.

- `scripts/keep-vault-up.sh`, `scripts/foundation-init.sh`, `apps/server/src/config.ts`, `apps/server/src/view-door.ts`, `apps/server/src/auth.ts`, `apps/server/src/app.ts`, `apps/server/src/mcp.ts`, `apps/server/src/view-write.ts`, `packages/db/src/blobs.ts`, `scripts/lib/foundation_portability.py`, `apps/server/src/graph.ts` (`manageType`), `.github/workflows/verify.yml`, `scripts/backup-vault.sh`, `apps/server/src/health.test.ts`
- `.cursor/skills/verify-foundation/SKILL.md` and `features/unlock.md`
- `.agents/skills/foundation-mcp/SKILL.md`

`harden-1` runs `pstack/skills/how/SKILL.md` before the Postgres role and session-cookie shapes, and `pstack/skills/interrogate/SKILL.md` before the view-key and off-box bind choices ship.

`harden-2` does not need interrogate. It is mechanical guards.

Decision trail per `pstack/skills/show-me-your-work/SKILL.md` lives with the execution owners after the operator's go. This plan file is the program checklist they run.
