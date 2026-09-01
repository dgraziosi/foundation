---
name: verify-foundation
description: Drive Foundation's Viewer (the human window on the life graph) to launch, doctor, prove a mapped surface, capture evidence, and clean up. Use when verifying Viewer behavior after a change, or when a later agent needs a scripted way to prove Home, collection, detail, search, or unlock.
---

# Verify Foundation (Viewer)

Foundation is a life graph that models the user so bots can help with life goals. Viewer is the human UI — a read-only window on one vault. It is not a personal-knowledge-management app and not harness chat-memory.

This skill is for the next agent, read cold. The person using a clone is the user. Stay on product. No live vault contents, no staff names, no personal data.

pstack's generic generator writes `.cursor/skills/verify-*`. This repo's product recipes stay under `.agents/skills/`. Do not copy vault-health, Dream, or other product folders here.

## Product words

- **graph** — live records (nodes) and edges
- **ontology** — types and how they connect
- **MCP** — how a bot talks to the graph (`http://127.0.0.1:8787/mcp`)
- **Viewer** — the read-only window (`http://127.0.0.1:8788/view`)
- **vault** — one instance (`FOUNDATION_DATA` + host Postgres)
- **record** — the node
- **user** — the human who runs this vault on this machine

Do not write a live personal vault into git. Do not reintroduce Compose as install. Host programs: Postgres 16 on PATH (`initdb`, `pg_ctl`, `psql`) plus the app (`pnpm start`). The package name for Postgres is unknown in this repo — do not guess an installer.

Journal write (a page that creates or edits a journal record) is **forthcoming**. It is not on this branch. `journal` is only a seed type the window can list when live records exist.

## Launch

Official start on the machine that runs a vault (from the clone root):

```bash
cp .env.example .env
# the human sets FOUNDATION_API_KEY to a long random string; do not commit .env
# empty first-day folder at FOUNDATION_DATA (default ./data) may init
./scripts/keep-vault-up.sh
```

`keep-vault-up.sh` starts Postgres from that data folder's `postgres/` tree, then `pnpm start` (wait for the database, migrate, seed). Ready when:

```bash
curl -fsS http://127.0.0.1:8787/health
# {"ok":true,"service":"foundation","db":"up"}
```

Viewer is then `http://127.0.0.1:8788/view` (from another machine on this vault: `http://<this-host>:8788/view`). MCP / health / agent blobs stay on `127.0.0.1:8787`.

**Verification launch** (disposable folder, not a personal vault). Prefer the helper so the run records what it started:

```bash
.cursor/skills/verify-foundation/scripts/verify-foundation.sh launch
```

That script:

1. Refuses if `GET /health` is already green and this run did not start it — do not drive a shared instance.
2. Requires Node 22, `pnpm`, and Postgres 16 on PATH (`initdb`, `pg_ctl`, `psql`). If any are missing, it prints the gap and exits. It does not guess a package installer.
3. Makes an empty first-day folder under `$VERIFY_DATA_DIR` (default `/tmp/foundation-verify-$RUN_ID/data`).
4. Starts through `scripts/keep-vault-up.sh` with env overrides only (no clone `.env` unless one already exists and you pass through `FOUNDATION_API_KEY`).
5. Waits until `/health` is green, or fails with the keep-vault-up nag.

Default ports (`8787`, `8788`, `5432`) are one-instance. Two side-by-side vaults need different `PORT`, `VIEW_PORT`, and a Postgres port in `DATABASE_URL`, plus a second data folder. This skill does not do that. Refuse a second drive on a shared instance.

Teardown is Cleanup below. There is no short-lived CLI to keep alive: launch means the two host programs are up.

Viewer assets come from `apps/viewer/dist`. `pnpm start` does not build them. Before a first window proof on a clean clone:

```bash
pnpm --filter @foundation/viewer build
```

Without that dist, `/view` still serves the unlock fallback HTML (`Unlock the vault window`). The React Home / collection / detail / search chrome needs the build.

## Doctor

Read-only. Run this first whenever anything looks off:

```bash
.cursor/skills/verify-foundation/scripts/verify-foundation.sh doctor
```

Worth driving only when all of these hold:

| Check | Expect |
| --- | --- |
| `GET http://127.0.0.1:8787/health` | HTTP 200 and `{ "ok": true, "service": "foundation", "db": "up" }` |
| `GET http://127.0.0.1:8788/view` | HTTP 200 HTML. Body contains `Foundation` (built app) or `Unlock the vault window` (fallback or unlock gate) |
| Ports | MCP/health on `8787`, Viewer on `8788`. If this run launched, the state file names the data dir and app pid we started |
| Auth | `FOUNDATION_API_KEY` is set in the environment or the clone `.env`. Do not print the key |
| Build | For a full window drive: `apps/viewer/dist/index.html` exists |

If health is down, the instance is not worth driving. Do not invent graph rows to make Home look populated. An empty first-day vault is a valid Viewer: Recents **Nothing yet.** and open tasks **No open tasks.**

## Drive

Primary surface: the Viewer in a browser. Same-path HTTP is the fallback when a browser cannot run (the SPA calls these routes).

Stable handles (prefer these over coordinates):

| Handle | What it is |
| --- | --- |
| heading `Unlock the vault window` | Unlock door |
| password field `name="api_key"` | Unlock key (no accessible name on the input) |
| button `Unlock` | Submit unlock |
| `[data-surface="home"]` | Home |
| rail text `Home` / `Search` | Left rail. Collapsed Search uses `aria-label="Search"` |
| `[data-surface="search-overlay"]` | Search overlay. Heading `Search`, search field placeholder `Search the graph`, button `Close` |
| `[data-surface="view-strip"]` | Content-host strip. Pinned `Home` plus open collection/detail tabs |
| `[data-surface="detail-page"]` | Detail page |
| `[data-surface="graph"]` | Collection graph layout |
| `aria-label="View"` | Collection layout switcher |
| `aria-label="Show completed"` | Collection session chrome (does not write) |
| `aria-label="Theme"` | Rail Light / Dark / System |

Routes (basename `/view`):

| Path | Surface |
| --- | --- |
| `/view` | Unlock gate, then Home |
| `/view/recents` | Recents page (from Home Recents **View all**) |
| `/view/types/:slug` | Collection for that type |
| `/view/nodes/:id` | Detail for that record |

HTTP the window already uses (cookie `foundation_key` with `Path=/view`, or `Authorization: ApiKey <key>`):

```bash
# unlock (same door as the form; JSON so you get { ok: true } + Set-Cookie)
curl -sS -D - http://127.0.0.1:8788/view/unlock \
  -H "content-type: application/json" -H "accept: application/json" \
  -d "{\"api_key\":\"${FOUNDATION_API_KEY}\"}"

# session / Home widgets / collection / detail / search
curl -sS http://127.0.0.1:8788/view/api/session -H "Authorization: ApiKey ${FOUNDATION_API_KEY}"
curl -sS http://127.0.0.1:8788/view/api/recents -H "Authorization: ApiKey ${FOUNDATION_API_KEY}"
curl -sS http://127.0.0.1:8788/view/api/tasks -H "Authorization: ApiKey ${FOUNDATION_API_KEY}"
curl -sS http://127.0.0.1:8788/view/api/ontology -H "Authorization: ApiKey ${FOUNDATION_API_KEY}"
curl -sS "http://127.0.0.1:8788/view/api/types/task" -H "Authorization: ApiKey ${FOUNDATION_API_KEY}"
curl -sS "http://127.0.0.1:8788/view/api/nodes/<UUID>" -H "Authorization: ApiKey ${FOUNDATION_API_KEY}"
curl -sS "http://127.0.0.1:8788/view/api/search?q=Fixture" -H "Authorization: ApiKey ${FOUNDATION_API_KEY}"
```

The cookie does not unlock `/mcp` or `/blobs/:id`. Do not post writes through Viewer — the window has no create/edit/complete. Do not call MCP `upsert` to fake a Viewer write.

Read the feature map under [`features/`](features/README.md) before driving. Drive one mapped feature end to end. A proof that only hits `/health` is not a Viewer proof.

When a browser is available: open `http://127.0.0.1:8788/view`, use the handles above, capture the action and the resulting state.

When a browser is not available: use the HTTP door above for the same feature, and say you did not click the React chrome.

When host Postgres is not on PATH: do not guess an installer. Prove what you can:

```bash
pnpm --filter @foundation/viewer test
pnpm --filter @foundation/viewer build
pnpm test
```

Server tests that need `DATABASE_URL` skip when it is unset. That skip is not a live Viewer drive. Record it as a block.

## Evidence

Named location (survives Cleanup):

```text
.cursor/skills/verify-foundation/evidence/<run-id>/
```

`<run-id>` is the `VERIFY_RUN_ID` the helper printed (or a UTC stamp you chose). Cleanup deletes host programs and the disposable data dir. It must not delete this folder.

Capture:

- The feature id and entry point (see the map)
- The action (click Unlock, open Search, GET `/view/api/session`, …)
- The resulting state (heading, empty copy, JSON body, HTTP status)
- Side effects that matter: `Set-Cookie` on unlock; no new rows from Viewer (read-only)
- Screenshot + ARIA snapshot when a browser drove the window
- Command, stdout, stderr, exit code when HTTP or tests were the drive

Proof standards:

- Exercise the real user path (window or the `/view` routes the window calls). Do not use MCP tools as a stand-in for Unlock / Home / Search.
- Capture the action and the resulting state, not only the last screen.
- Mocks only where a production boundary already isolates an external system. Viewer has none of those on this path.
- An empty first-day vault is valid proof for Home empty copy. Do not seed a fake life.
- Do not store API keys, `.env`, or vault rows in evidence. Redact `Set-Cookie` values.

## Cleanup

```bash
.cursor/skills/verify-foundation/scripts/verify-foundation.sh cleanup
```

Stops only what **this run** started (pid from the helper state file, then `scripts/keep-vault-up.sh stop` with that `FOUNDATION_DATA`). Never `pkill` by process name. Does not delete `./data` on the clone. Does not delete evidence.

If launch created `$VERIFY_DATA_DIR`, cleanup removes that disposable folder after stop. If you pointed launch at an existing folder the user already had, cleanup stops programs and leaves the folder.

After cleanup, confirm `.cursor/skills/verify-foundation/evidence/<run-id>/` still exists.

## Helpers

Executable helper (from the clone root):

```bash
.cursor/skills/verify-foundation/scripts/verify-foundation.sh doctor
.cursor/skills/verify-foundation/scripts/verify-foundation.sh launch
.cursor/skills/verify-foundation/scripts/verify-foundation.sh cleanup
.cursor/skills/verify-foundation/scripts/verify-foundation.sh evidence-dir
```

| Command | What it does |
| --- | --- |
| `doctor` | Read-only health, window GET, toolchain, optional state-file check |
| `launch` | Disposable first-day folder + `keep-vault-up.sh`. Writes a state file |
| `cleanup` | Stop what launch started; remove disposable folder; keep evidence |
| `evidence-dir` | Print the evidence path for this `VERIFY_RUN_ID` |

Env the helper reads (all optional except as noted):

| Variable | Default |
| --- | --- |
| `VERIFY_RUN_ID` | UTC stamp |
| `VERIFY_DATA_DIR` | `/tmp/foundation-verify-$VERIFY_RUN_ID/data` |
| `VERIFY_STATE_FILE` | `/tmp/foundation-verify-$VERIFY_RUN_ID/state` |
| `VERIFY_EVIDENCE_DIR` | `.cursor/skills/verify-foundation/evidence/$VERIFY_RUN_ID` |
| `FOUNDATION_HEALTH_URL` | `http://127.0.0.1:8787/health` |
| `FOUNDATION_VIEW_URL` | `http://127.0.0.1:8788/view` |
| `FOUNDATION_API_KEY` | required for launch; verification scaffold only — not a personal key |

## Feature map

Index: [`features/README.md`](features/README.md).

Mapped now: Unlock, Home, Collection, Detail, Search. Journal write is forthcoming (not on this branch).
