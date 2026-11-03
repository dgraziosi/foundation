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
- [ ] Edit `scripts/restore-vault.sh`.
- [ ] Edit `scripts/restore-vault.test.sh`.
- [ ] Edit `apps/server/src/config.ts`.
- [ ] Edit `apps/server/src/config.test.ts`.
- [ ] Edit `apps/server/src/index.ts`.
- [ ] Edit `apps/server/src/app.ts`.
- [ ] Edit `apps/server/src/security.ts`.
- [ ] Edit `apps/server/src/security.test.ts`.
- [ ] Edit `apps/server/src/auth.ts`.
- [ ] Edit `apps/server/src/auth.test.ts`.
- [ ] Edit `apps/server/src/view.ts`.
- [ ] Edit `apps/server/src/view.test.ts`.
- [ ] Edit `apps/server/src/view-door.ts`.
- [ ] Edit `apps/server/src/view-door.test.ts`.
- [ ] Edit `apps/server/src/view-write.test.ts`.
- [ ] Edit `apps/server/src/view-journal.test.ts`.
- [ ] Edit `apps/server/src/view-digest.test.ts`.
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
- [ ] Create `apps/server/src/secret-compare.ts`.
- [ ] Create `apps/server/src/access-log.ts`.
- [ ] Create `apps/server/src/view-session.ts`.
- [ ] Create `apps/server/src/access-log.test.ts`.
- [ ] Create `apps/server/src/view-session.test.ts`.
- [ ] Create `apps/server/src/secret-compare.test.ts`.

**Build.**

- [ ] Mint keys and a database password in keep-up, which init and cron already run. Replace a missing or published `FOUNDATION_API_KEY`. Mint `FOUNDATION_VIEW_KEY` when it is missing or published. Write `.env` mode 600. Do not chmod `FOUNDATION_DATA` 700 in this PR. In README, say the vault owner copies files into `uploads/`. `harden-2` changes the directory mode. Never print a key.
- [ ] Refuse published placeholder strings in `loadConfig`. Refuse an API key or view key shorter than 32 characters when that key is set. Do not require `FOUNDATION_VIEW_KEY` in `loadConfig`. A missing view key must not take MCP down. Do not put a length floor on the database password. CI uses `ci-verify`. The published example password must still not start the server.
- [ ] Run `initdb` with `--auth-local=peer --auth-host=scram-sha-256`. Pin `listen_addresses` to localhost in `postgresql.conf`. Keep the existing `pg_ctl` `-h 127.0.0.1` flag.
- [ ] Create the app role as `LOGIN` without `SUPERUSER`. Grant it ownership of the app database. Do not grant `CREATEDB` or `CREATEROLE`. Do not `ALTER` the initdb OS bootstrap role to `NOSUPERUSER` when that role is the URL user.
- [ ] Create `vector` as the OS superuser over the vault socket before migrate. On Postgres 16 here, `vector.control` has no `trusted` line and a non-superuser owner cannot create it. `pgcrypto`, `unaccent`, and `pg_trgm` are trusted. Still create all four as the OS superuser so the first migrate is a no-op `IF NOT EXISTS`. Leave the statements in the migration files.
- [ ] Add an idempotent keep-up upgrade that rewrites every `trust` line in `pg_hba.conf`, including replication. Trust today accepts any password, so `foundation_keep_vault_up_ensure_app_database` returns early and never `ALTER ROLE`. Always set the role password through the peer socket, then write `DATABASE_URL` into `.env`, then reload. Drop app-role superuser only after extensions exist. Leave graph data in place. A second run that already sees peer, scram, and a non-superuser app role does nothing.
- [ ] Start the app with `env -i` and this allowlist when set. `PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL`, `USER`, and the `EnvSchema` names. After `loadConfig`, drop every other key on `process.env` in `index.ts` so a direct `pnpm start` does not keep shell secrets.
- [ ] Pass `DATABASE_URL` to `psql`, `python3`, and `pg_ctl` helpers on stdin or a mode-600 file, not argv. Restore drops the database and creates it again as the OS socket superuser. The app role does not get `CREATEDB`.
- [ ] Compare live secrets as SHA-256 digests of equal width in `secret-compare.ts`. Cache the digest when the key is loaded. File keys in `api-keys.json` already compare hex digests. Use one helper from `ViewDoor` and `Keyring`. Assert match and mismatch. Do not write a timing test.
- [ ] In `ViewDoor.tryUnlock`, return throttle before any compare when that source is locked. Count a presented secret that fails on `/view/api` and on `/mcp`. Leave a missing credential out of the budget. Keep a separate ledger from unlock, so a bad bot key on loopback does not lock the window. Return 429 with `Retry-After`. A `/mcp` 429 keeps the current JSON-RPC unauthorized object.
- [ ] Delete the fallback lock that treats a bot key as the vault key. When `FOUNDATION_VIEW_KEY` is unset, `/view` refuses every key and MCP still serves. Keep Viewer writes on `VIEWER_WRITE` with destructive true. Do not edit `view-write.ts`.
- [ ] Store a random session id in the `foundation_key` cookie. Persist hashed sessions under `FOUNDATION_DATA` mode 600 so `Max-Age=2592000` outlives a restart. Keep that exact Max-Age. `verify-foundation.test.sh` greps it. Set `Secure` only when the request is HTTPS. Leave localhost HTTP without `Secure`. Keep accepting the view key on `Authorization` for `/view`.
- [ ] Refuse a non-loopback bind unless `VIEW_PUBLIC_ORIGIN` names the Host the browser will send, and the request is TLS or the operator records a cleartext opt-in. `0.0.0.0` is the listen address, not a Host. Do not treat that string as an allowed Host.
- [ ] Reject a `Host` that is not `localhost`, `127.0.0.1`, or `[::1]`, each with that door's port, unless `FOUNDATION_ALLOWED_HOSTS` lists it. Check `Origin` on browser-facing writes to `/view`. One middleware in `createApp` before routes. Do not set `trust proxy`. Leave the SDK DNS-rebinding flag at its default.
- [ ] Drop the global 32 MB parse that runs before auth. Check the MCP key first, then parse `/mcp` at 32 MB so a 20 MB `bytes_base64` blob still fits. Parse the view door, including `POST /view/unlock`, at a small limit.
- [ ] Write a rotated access log under `FOUNDATION_DATA/logs` mode 600, directory 700. Each line is time, `req.socket.remoteAddress`, key label, route, and status. MCP uses `req.agent.name`. The view door sets a non-secret label beside unlock and `requireViewAuth`. Never log the header, the cookie, or `api_key`.
- [ ] Move the lockfile to `@modelcontextprotocol/sdk` `1.32.2`, `body-parser` `2.4.0`, `proxy-addr` `2.0.8`, `fast-uri` `3.1.8`, and `dompurify` `3.4.17`. Leave Zod 4 out of this program. Re-read `StreamableHTTPServerTransport` after the SDK bump.
- [ ] Rewrite first-run copy in positive words. The clone starts locked to the person who ran init. Off-box names the tunnel Host. `docs/HARNESS.md` mentions `429` and `Retry-After`. Leave `.agents/skills/foundation-mcp/SKILL.md` unless `Host: 127.0.0.1:8787` is no longer allowed.

**You see.**

- [ ] A first-day `scripts/foundation-init.sh` produces a mode-600 `.env` with two minted keys and a random `DATABASE_URL` password, then a healthy `/health` of only `ok`, `service`, and `db`.
- [ ] `psql` as a stranger on the same machine using trust fails. The app role is not a superuser. `listen_addresses` is localhost. `vector` exists. Restore recreate still works without `CREATEDB` on the app role.
- [ ] `loadConfig` throws on `change-me-to-a-long-random-string` and on `change-me-to-a-password`.
- [ ] Unlock with the house key returns 401. Unlock with the view key sets a cookie whose value is not the view key. Five empty unlock posts do not 429.
- [ ] Five failed unlocks, then a sixth while locked, return 429 without a successful compare. A later correct key during cooldown also returns 429. A bad MCP key does not lock Unlock.
- [ ] `Host: evil.example` against `/mcp` or `/view` returns 400 or 403.
- [ ] `GET /health` without a key still returns only `ok`, `service`, and `db`.
- [ ] The access log names a key label and never contains the secret.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/server/src/config.test.ts` refuses published and short secrets and still boots without `FOUNDATION_VIEW_KEY`. Run `pnpm --filter @foundation/server test`.
- [ ] `apps/server/src/view-door.test.ts` throttles before compare, drops the fallback lock, and does not count a missing secret.
- [ ] `apps/server/src/secret-compare.test.ts` shows equal-width digest compare on match and mismatch.
- [ ] `apps/server/src/auth.test.ts` returns 429 before a compare on a presented bad header and does not count a missing header.
- [ ] `apps/server/src/view-session.test.ts` stores a session id, not the raw key, keeps `Max-Age=2592000`, and sets `Secure` only on HTTPS.
- [ ] `apps/server/src/security.test.ts` rejects a foreign Host, accepts `127.0.0.1` with the door port, and rejects a foreign Origin on a view write.
- [ ] `apps/server/src/access-log.test.ts` writes the five fields and redacts secrets.
- [ ] `apps/server/src/health.test.ts` still asserts the public shape.
- [ ] `scripts/foundation-init.test.sh` asserts mint, mode 600, and no key on stdout. It no longer expects a verbatim copy of `.env.example`.
- [ ] `scripts/keep-vault-up.test.sh` asserts peer plus scram, rewritten replication lines, localhost listen, non-superuser app role, OS-superuser `vector`, env allowlist start, no URL on argv, and a second run that does not rewrite a healthy cluster.
- [ ] `scripts/restore-vault.test.sh` asserts recreate goes through the vault socket as the OS superuser and that the app role never receives `CREATEDB`.
- [ ] `bash scripts/harness-docs.test.sh` still passes after the positive-copy doc edit.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run first-day keep-up plus Unlock plus Home at trunk and head. Trunk still accepts the house key when `FOUNDATION_VIEW_KEY` is unset. Head refuses the house key and opens only with the minted view key, then paints Home. Save `harden-1-regression.png`. Pass when both sides reach a healthy `/health` and head Home is the Today page.
- [ ] Lane 2. First-day init on an empty clone. Save `harden-1-init-modes.png`. Pass when `.env` is 600, both keys exist, the database password is not the published example, and process stdout has no secret.
- [ ] Lane 3. Inspect the throwaway cluster. Save `harden-1-pg-hba.png`. Pass when `pg_hba.conf` has no `trust` line, including replication, `listen_addresses` is localhost, the app role is not a superuser, and `\dx vector` is present.
- [ ] Lane 4. POST `/view/unlock` with a foreign Host. Save `harden-1-host-reject.png`. Pass when the status is 400 or 403 and no session cookie is set.
- [ ] Lane 5. Five wrong unlocks, then a sixth, then the correct view key while locked. Save `harden-1-unlock-429.png`. Pass when the locked tries are 429 with `Retry-After` and Unlock still shows **That key did not unlock.**
- [ ] Lane 6. Five wrong `Authorization` headers on `/mcp`, then a sixth, then an unlock with the view key. Save `harden-1-mcp-429.png`. Pass when the locked MCP try is 429 with the unauthorized JSON-RPC object and `Retry-After`, and Unlock still opens.
- [ ] Lane 7. Unlock on localhost, then read `Set-Cookie`. Save `harden-1-session-cookie.png`. Pass when the cookie value is not the view key, `HttpOnly`, `SameSite=Strict`, and `Max-Age=2592000` are set, `Secure` is absent, and `/mcp` with that cookie is 401.
- [ ] Lane 8. Off-box bind without TLS and without `VIEW_PUBLIC_ORIGIN`. Save `harden-1-offbox-refuse.png`. Pass when keep-up or boot refuses a non-loopback bind, and a request whose Host is `0.0.0.0` is not treated as allowed.
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
- [ ] Edit `packages/db/src/blobs.test.ts`.
- [ ] Edit `scripts/lib/foundation_portability.py`.
- [ ] Edit `scripts/foundation-portability.test.sh`.
- [ ] Edit `apps/server/src/graph.ts` only at `manageType` and `validateUpsertData`.
- [ ] Edit `apps/server/src/search-filters.test.ts`.
- [ ] Edit the `manage_type` tests that today allow a raw `json_schema` with an empty field list.
- [ ] Edit `docs/MCP_TOOLS.md` only for the hand-written schema sentence.
- [ ] Edit `.github/workflows/verify.yml`.
- [ ] Edit `.cursor/skills/verify-foundation/scripts/verify-foundation.test.sh`.
- [ ] Do not edit any `harden-1` path. Leave `packages/schema/src/json-schema.ts`, `packages/db/src/seed.ts`, and `apps/server/src/undo.ts` alone.

**Build.**

- [ ] In `write_export`, accept a type slug only when it matches `SlugSchema` (`^[a-z][a-z0-9_]*$`). Resolve each write path and refuse it when the resolved path is outside the resolved `--out`. `--from-snapshot` is the live hole. A `manageType` slug cannot contain `..`.
- [ ] Change `UPLOAD_DIR_MODE` to `0o700`. Reject a `source_path` that is not one segment after the `uploads/` prefix. Open that file with `fs.promises.open` and `O_RDONLY | O_NOFOLLOW`. `readFile` on this Node rejects a numeric flag. Open `uploads/` with `O_DIRECTORY | O_NOFOLLOW` and chmod the handle. `O_NOFOLLOW` on the final component still follows a symlinked parent. This Node has no `openat`.
- [ ] Refuse a non-null raw `json_schema` on create and update inside `manageType`, including an empty field list. In `validateUpsertData`, compile from `type.fields` and pass that object to Ajv so an old column never reaches compile. Leave `json-schema.ts`, `seed.ts`, and `undo.ts` alone.
- [ ] Pin `actions/checkout`, `pnpm/action-setup`, and `actions/setup-node` in `verify.yml` to full SHAs. Set top-level `permissions: contents: read`. Leave the `pgvector/pgvector:pg16` image tag. Replacing it with a digest breaks `verify-foundation.test.sh`. Add SHA and permissions asserts next to the existing `workflow_blob` checks.

**You see.**

- [ ] `write_export` with type `../../tmp` writes nothing outside `--out` and exits nonzero.
- [ ] A new vault's `uploads/` is 0700. Ingest of a symlink, or of `nested/file`, fails closed. A regular file in `uploads/` still ingests.
- [ ] `manage_type` with a hostile Ajv schema and no fields returns `{ error, suggestion }` and stores no schema. Upsert of an old row with a leftover column still validates from fields.
- [ ] `verify.yml` has SHA-pinned `actions/checkout`, `pnpm/action-setup`, and `actions/setup-node`, plus `permissions: contents: read`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scripts/foundation-portability.test.sh` adds a traversal type slug and an outside-`--out` case. Run `bash scripts/foundation-portability.test.sh`.
- [ ] `packages/db/src/blobs.test.ts` asserts mode 0700, a symlink miss, and a nested `source_path` miss. Run `pnpm --filter @foundation/db test` with `DATABASE_URL` set. `pnpm --filter @foundation/server test` does not run that file.
- [ ] `manageType` and `search-filters` tests refuse a raw schema. `labeled_fixture` gains a field list. Field-compiled schemas still validate upsert. Run `pnpm --filter @foundation/schema test` and `pnpm --filter @foundation/server test`.
- [ ] `verify-foundation.test.sh` asserts SHA pins and `contents: read` next to the existing `workflow_blob` checks. Run `bash .cursor/skills/verify-foundation/scripts/verify-foundation.test.sh`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.7-xhigh-fast` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Export a throwaway vault that has one `note` and one `task` at trunk and at head. Save `harden-2-regression-export.png`. Pass when both sides write `foundation.json` plus markdown under `--out`, and head node ids match trunk.
- [ ] Lane 2. Export a snapshot whose type is `../../escape`. Save `harden-2-export-traverse.png`. Pass when the process exits nonzero and the parent of `--out` has no new file.
- [ ] Lane 3. Export a legal slug and confirm every written path is inside `--out`. Save `harden-2-export-inside.png`. Pass when `realpath` of each file has the `--out` prefix.
- [ ] Lane 4. Stat `uploads/` on a launched vault. Save `harden-2-uploads-mode.png`. Pass when the mode is 0700.
- [ ] Lane 5. Place a symlink in `uploads/`, then a file under a symlinked parent, then ingest `nested/file`. Save `harden-2-nofollow.png`. Pass when each ingest returns an error and `blobs/` gains no file.
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

No product prototype ran. [Verify init DB env findings](bc-7d38682b-a83a-513b-a762-6673775bb371) measured a throwaway Postgres 16 cluster on this machine. The contested first-run lines below use that run plus the files on `main` at `f0e0708`.

Settled from the tree and the cluster.

- Finding 1 is confirmed for trust and `SUPERUSER`. `foundation_keep_vault_up_init_postgres` calls `initdb` with no `--auth`. A stock `initdb` wrote `trust` for `local`, `127.0.0.1/32`, `::1/128`, and the matching replication lines. `--auth-local=peer --auth-host=scram-sha-256` wrote peer and scram on those same lines. `foundation_keep_vault_up_app_role_sql` creates `LOGIN SUPERUSER`. Under trust, `psql` as the app role with the wrong password still connected. `foundation_keep_vault_up_ensure_app_database` returns when `psql` of the URL succeeds, so a later password edit never reaches `ALTER ROLE`. Listen is already pinned at start by `foundation_keep_vault_up_postgres_listen_args` (`-h 127.0.0.1`). `SHOW listen_addresses` was `127.0.0.1`. `postgresql.conf` still comments `listen_addresses`. A start without `-h` uses the compiled default. The app uses TCP `DATABASE_URL`. keep-up talks to the OS superuser over the vault socket. Peer on that socket was measured. The OS user connected with no `-U` and was superuser. On this image, `vector.control` is `0.6.0` with no `trusted` line. `CREATE EXTENSION vector` as a non-superuser owner failed. After the superuser created it, `IF NOT EXISTS` as the owner succeeded. `pgcrypto`, `unaccent`, and `pg_trgm` are trusted. The owner created those three and ordinary migrate DDL. Runtime does not need `SUPERUSER`, `CREATEDB`, or `CREATEROLE`. `foundation_restore_recreate_database` drops as the URL role, then `CREATE DATABASE` fails without `CREATEDB`. Give recreate to the OS socket superuser. Do not grant the app role `CREATEDB`. Do not demote the initdb bootstrap role when it is the URL user.
- Finding 2 is confirmed. `foundation_init_ensure_env` copies `.env.example` and does not mint. `loadConfig` accepts any nonempty `FOUNDATION_API_KEY`. `.env.example` ships `change-me-to-a-long-random-string` and `change-me-to-a-password`. Init copies both. Keep-up then sets the role password from that URL, so the published password works. A 32 character floor belongs on the API key and the view key, not on the database password. CI uses `ci-verify`.
- Finding 3 is partial. `cp` writes `.env` at the umask, usually 644. `.env.example` is 644. There is no `keys/` directory. `mint-api-key.sh` already chmods `api-keys.json` to 600. `initdb` already makes `postgres/` 700. Do not chmod `FOUNDATION_DATA` 700 in `harden-1`. That would hide the 1777 uploads drop box before `harden-2` changes it.
- Finding 4 is confirmed. Installed SDK `1.30.0` has `enableDnsRebindingProtection` and defaults it off. The type comment marks the flag deprecated and says to use external middleware. `handleMcpRequest` passes only `sessionIdGenerator`. `validateRequestHeaders` no-ops when the flag is false. No Host or Origin check exists in Foundation source. `view.test.ts` unlocks with `Host: 192.168.10.20:8788`. The view app is also mounted on the MCP door at `http://127.0.0.1:8787/view`.
- Finding 5 is confirmed. `ViewDoor.tryUnlock` compares, then checks cooldown. `view-door.test.ts` requires a correct key to open during cooldown. `admit` does not touch the ledger. `requireViewAuth` uses `admit`. `requireApiKey` has no budget. `GET /view/api/session` on every locked page load has no Authorization header. Counting a missing credential would lock the person after five refreshes. Loopback is one address for every local account.
- Finding 6 is confirmed as documented behavior. `windowLockOf` falls back to the keyring. `bootstrapPrincipal` is always destructive. `VIEWER_WRITE` is destructive for delete, undo, and restore. Journal and field writes do not need that flag. A non-destructive named key in fallback can still trash. Requiring the view key in `loadConfig` would refuse `pnpm start` and take MCP down on every current env. Mint the view key in keep-up. Delete fallback so a bot key never opens `/view`. Keep MCP up when the view key is still missing.
- Finding 7 is confirmed. `apiKeyCookieHeader` stores the raw key for 2592000 seconds, HttpOnly, SameSite Strict, no Secure. There is no TLS listener. `0.0.0.0` is the bind address. The browser Host is the tunnel name or the LAN address. An in-memory session dies on restart while `verify-foundation.test.sh` requires the literal `Max-Age=2592000`. Persist the map. A `Secure` cookie on plain `http://127.0.0.1` can fail in a browser that does not treat loopback as a secure context.
- Finding 8 is confirmed. There is no HTTP access log. `FOUNDATION_DATA/app.log` is `nohup` stdout. Graph `activity` is a different record. `createApp` never sets `trust proxy`. Log `req.socket.remoteAddress`. The view door has no `req.agent`, so the label is set beside unlock. Ship the log in the same PR as the session cookie, or the first logger would record the raw key.
- Finding 9 is partial. `safeEqualUtf8` leaks length on the bootstrap secret, in-memory named secrets, and the view key. File keys already compare SHA-256 hex through `hashApiKey` and `safeEqualHex`. `parseNamedKeysFile` only accepts 64 hex chars.
- Finding 10 is already done. `registerHealth` and `apps/server/src/health.test.ts` already keep the public body to `ok`, `service`, and `db`. Do not reopen it except as a regression lane.
- Finding 11 is confirmed. `write_export` joins `node.type` into markdown folders and CSV names. `safe_filename` only sanitizes the title. On this machine, `markdown / "../../escape"` resolved outside `--out`, and an absolute slug discarded `--out`. `SlugSchema` is `^[a-z][a-z0-9_]*$`. `node_types.slug` has no `CHECK`. `--from-snapshot` is raw JSON.
- Finding 12 is confirmed. `UPLOAD_DIR_MODE` is `0o1777`. README documents that drop box. Ingest `realpath`s then `readFile`s. On Node 22.23.4 here, `O_NOFOLLOW` is `131072`. `fs.promises.open` with `O_RDONLY | O_NOFOLLOW` on a symlink returned `ELOOP`. `readFile` rejected that numeric flag. Opening a file through a symlinked parent with `O_NOFOLLOW` returned the outside bytes. There is no `openat` on `fs.promises`. `pnpm --filter @foundation/server test` does not run `packages/db/src/blobs.test.ts`.
- Finding 13 is partial. `manageType` already compiles from fields when a field list exists. The hole is an empty field list. `validateDataAgainstJsonSchema` is the only `ajv.compile` call. `validateSchema` is false. The `catch` does not bound a compile that never returns. Ajv was not installed in that checkout, so a hang was not measured. `search-filters.test.ts` `labeled_fixture` and `docs/MCP_TOOLS.md` rely on a hand-written schema. Refusing new raw schemas without changing `validateUpsertData` leaves every old column on the Ajv path.
- Finding 14 is confirmed. `createApp` runs `express.json({ limit: "32mb" })` before `requireApiKey`. That 32 MB matches `BLOB_MAX_BYTES` plus base64. `docs/MCP_TOOLS.md` says so. Installed SDK is `1.30.0`. `npm view` this turn reported SDK `1.32.2`, `body-parser` `2.4.0`, `express` `5.3.0`, `proxy-addr` `2.0.8`, `dompurify` `3.4.17`, and `zod` `4.6.7`. GHSA-f897-62hf-6gxq is the SDK body-size class. Express `5.2.1` already allows the patched `body-parser` and `proxy-addr`. Leave Zod 4 out.
- Finding 15 is confirmed. `.github/workflows/verify.yml` uses `actions/checkout@v4`, `pnpm/action-setup@v4`, and `actions/setup-node@v4`, with no `permissions` block. `verify-foundation.test.sh` greps `pgvector/pgvector:pg16` and does not check SHAs.
- Finding 16 is confirmed. `foundation_keep_vault_up_start_app` runs `nohup pnpm start` in a subshell that inherits the whole environment. An empty `env -i` breaks `pnpm` and breaks verify launch, which passes `DATABASE_URL` in the environment because dotenv will not override it. The planned allowlist is `PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL`, `USER`, and the `EnvSchema` names. Keep-up, restore, and `psql "${url}"` also put the URL on argv. Move those to stdin or a mode-600 file while this PR already edits those scripts. `scripts/mint-api-key.sh` still prints a new secret once. That is the documented mint.
- Finding 17 is already done and stronger than the ask. `scripts/backup-vault.sh` already requires `BACKUP_AGE_RECIPIENT`, encrypts with age, writes mode 0600, and prunes with `BACKUP_KEEP_DAYS` (default 14). Blob files in the backup tree stay in the clear. A fresh clone with a commented recipient refuses the first dump. That is already the safe behavior. Do not add an off switch. Do not edit `scripts/backup-vault.sh` in this program.

Still unproven until `harden-1` runs on a throwaway vault.

- Whether `pnpm start` needs any name beyond the allowlist above. Prove it by starting the app from a dirty shell and that list.
- Whether a `pg_hba.conf` rewrite that also touches replication still reloads on an existing personal cluster, not only on the measured throwaway.

## Appendix B. Alternatives rejected

One PR. It would mix Postgres auth, Viewer cookies, Ajv, and CI pins. Review would stall. Two PRs keep the "only they can open it" promise in `harden-1` and the isolated file guards in `harden-2`.

Three PRs that split `view-door.ts` or `config.ts`. Unlock throttle, view-key require, and digest compare all live in `view-door.ts`. Host, session, and body parse need the new config keys. Splitting those files would violate the no-shared-path rule.

Carry the bot's destructive flag into Viewer writes. That still lets any bot key open `/view` when the view key is missing. A dedicated minted view key is the smaller fail-closed rule and keeps first-run one command.

Keep the house-key fallback and only document the risk. A fresh clone that copies `.env.example` would still open `/view` with a published key.

Leave `FOUNDATION_VIEW_KEY` optional after a custom API key is already set. [Verify init DB env findings](bc-7d38682b-a83a-513b-a762-6673775bb371) recommended that so an existing vault keeps the house-key window. That leaves finding 6 open. keep-up mints the view key into `.env` before `pnpm start` and does not print it. `loadConfig` still does not require the variable, so MCP stays up if someone starts without keep-up. `/view` then refuses every key.

Require `FOUNDATION_VIEW_KEY` inside `loadConfig`. [Verify HTTP auth findings](bc-d4fc24b0-8e51-580d-bb74-aea39f1092fc) measured that this refuses `pnpm start` and takes MCP down on every current env.

Parse `/mcp` at a small JSON limit. That breaks a 20 MB `bytes_base64` ingest. Auth first, then keep 32 MB on `/mcp`. Use the small limit on the view door.

Turn on the SDK DNS-rebinding flag. The installed type marks it deprecated and says to use external middleware. The Host compare is an exact raw header match, port included, and it runs only inside `transport.handleRequest`.

Set `trust proxy`. That wakes the critical `proxy-addr` bug. `createApp` does not set it today.

Ship Zod 4 in this program. Tool handlers parse with Zod 3 after auth. The SDK still accepts Zod 3. That bump is its own slice.

Count a missing unlock or header as a failure. Five loads of the unlock page would lock the person. `Gate` calls `GET /view/api/session` with cookies and no Authorization header.

Share one failure ledger across Unlock and `/mcp`. A bad bot key from loopback would lock the human window. Every local account shares `127.0.0.1`.

Rely on `O_NOFOLLOW` alone. [Verify FS schema CI findings](bc-12490eda-406c-5b87-9370-57826a6ce20c) opened a file through a symlinked parent and read the outside bytes. One path segment is the check that closes that.

Pin the Postgres service image to a digest. `verify-foundation.test.sh` greps the tag `pgvector/pgvector:pg16`.

Refuse new raw schemas and leave `validateUpsertData` on the stored column. Old rows and undo snapshots would still reach Ajv.

Grant the app role `CREATEDB` so restore can recreate. Measured. The owner can drop the database and then fail the create, which writes `.restore-failed` and blocks keep-up. Recreate as the OS socket superuser.

Floor the database password at 32 characters. That rejects CI's `ci-verify` and the `change-me` fixture in `config.test.ts`. Refuse only the published example password.

chmod `FOUNDATION_DATA` 700 in `harden-1`. That hides `uploads/` from other local accounts before `harden-2` changes the drop-box mode.

`--auth-local=scram` for the vault socket. keep-up's `psql` is the OS superuser over that socket. Peer matches that path. Scram stays on TCP for the app.

Leave backup encryption optional. The script already fails closed without a recipient. Weakening it would move the product backward.

Reopen `/health`. The public shape is already the one the audit asked for.

## Appendix C. Risks

- Lockout on an existing `.env` that still has the published API key or password. `harden-1` keep-up mints replacements into `.env` and does not print them. The owner re-reads `.env`. A start that still sees a published value refuses to boot.
- Lockout on an existing vault with no `FOUNDATION_VIEW_KEY`. keep-up mints one into `.env` on the first head start. Viewer then accepts only that key. The house key stops opening `/view`.
- Lockout if `ALTER ROLE NOSUPERUSER` runs before `vector` exists. The upgrade creates extensions as the OS superuser first, then drops app-role superuser. A failed step leaves the previous `pg_hba` in place when the rewrite is a temp file plus rename.
- Lockout if the upgrade demotes the initdb bootstrap role. Skip `NOSUPERUSER` when the URL user is that OS user.
- Lockout if restore drops the database as the app role and then cannot create it. Recreate on the vault socket as the OS superuser.
- Lockout if scram is reloaded while the role password still differs from `DATABASE_URL`. Trust hid that drift. Always `ALTER ROLE` through the socket before reload.
- Lockout from throttle-before-compare. Five failures lock that source for the budget cooldown, including a later correct key. Loopback is one address. That is the fail-closed choice. Unlock already shows **That key did not unlock.** and `Retry-After`.
- Lockout for an owner who already binds `VIEW_HOST=0.0.0.0` on plain HTTP. Head refuses a non-loopback bind until they name `VIEW_PUBLIC_ORIGIN`. Document the named-origin path in README with positive copy.
- Lockout if `Secure` is set on localhost HTTP. Some browsers do not treat loopback as a secure context. Set `Secure` only on HTTPS.
- Lockout if the session map is memory-only while the cookie lasts 30 days. Persist hashed sessions under `FOUNDATION_DATA`.
- `env -i` drops a variable `pnpm` needs. The live lane starts from a dirty shell. If boot fails, add only the missing name to the allowlist.
- pstack playbook paths under `origin/main:pstack/...` are not in this git tree. They live in the Cursor plugin. Owners read the plugin copies when `git show` misses. The control skill that is in this tree is `.cursor/skills/verify-foundation/SKILL.md`.
- `harden-2` stacked on `harden-1` restacks when the parent moves. Keep patch-id stable.

## Appendix D. Links and reading list

Read before editing.

- `scripts/keep-vault-up.sh`, `scripts/foundation-init.sh`, `scripts/restore-vault.sh`, `apps/server/src/config.ts`, `apps/server/src/index.ts`, `apps/server/src/security.ts`, `apps/server/src/view-door.ts`, `apps/server/src/auth.ts`, `apps/server/src/app.ts`, `apps/server/src/mcp.ts`, `apps/server/src/view-write.ts`, `packages/db/src/blobs.ts`, `scripts/lib/foundation_portability.py`, `apps/server/src/graph.ts` (`manageType` and `validateUpsertData`), `.github/workflows/verify.yml`, `docs/MCP_TOOLS.md`, `scripts/backup-vault.sh`, `apps/server/src/health.test.ts`
- `.cursor/skills/verify-foundation/SKILL.md` and `features/unlock.md`
- `.agents/skills/foundation-mcp/SKILL.md`

`harden-1` runs `pstack/skills/how/SKILL.md` before the Postgres role and session-cookie shapes, and `pstack/skills/interrogate/SKILL.md` before the view-key and off-box bind choices ship.

[Verify HTTP auth findings](bc-d4fc24b0-8e51-580d-bb74-aea39f1092fc) and [Verify FS schema CI findings](bc-12490eda-406c-5b87-9370-57826a6ce20c) are the other two read-only reports this plan absorbed.

`harden-2` does not need interrogate. It is mechanical guards.

Decision trail per `pstack/skills/show-me-your-work/SKILL.md` lives with the execution owners after the operator's go. This plan file is the program checklist they run.
