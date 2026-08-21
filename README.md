# Foundation

**Vision:** A vault of your life that your bots can act on.

Foundation is a life management system. It gives you a vault to record your life, a method for organizing that vault, and bots that help you take action on what is in it. It is self-hosted. It can run on your computer or any virtual machine. It is designed to work with any harness (Grok Bot, Hermes, OpenClaw, Claude Code, Codex, and others).

## 1. Vault
The vault is one running instance. It holds the **graph** — the live network of your projects, goals, tasks, people, places, and the files that belong with them. Bots read and write that graph. It always stays yours.

## 2. Ontology
The ontology is the vocabulary of the graph: types and relations. Starter types get you going. You can use them, change them, or add your own.

Starter types: area, project, goal, task, person, place, company, note, habit, journal, idea, trip, decision, lesson, spend

Recommended structure: Area → project → goal → task. The point is to break work into smaller pieces so bots can take them on. A habit hangs under a goal. A task may child_of a goal or a project. A spend hangs under a project. A project may hold a budget amount and currency.

## 3. Bots
The bots help you take action on what is in your vault. Three starter recipes ship with the repo. You can add more later using your platform of choice. Paste them from [`docs/AGENTS.md`](docs/AGENTS.md).

Chief of Staff — The bot you talk to. You think out loud, dump what is on your mind, and work through decisions together. It files what matters in the vault, keeps you current on what is open and due, and hands work to the right bot. It asks you when something needs you. It also looks for recurring work in your day and suggests another bot when one would help.
Out of the box: morning brief; capture (what you dump lands in the vault). When you want another seat, it uses [`.agents/skills/create-bot/`](.agents/skills/create-bot/) and the blank template in that folder.

Vault Keeper — Keeps the vault healthy and organized. Checks that it is up. Runs the backup (`scripts/backup-vault.sh`). Reports obvious mess; cleans it only when you ask. Applies product updates on the machine that runs Compose. Keeps `FOUNDATION_DATA` in place and leaves Compose volumes intact.
Out of the box: health check; nightly backup; backup freshness; periodic hygiene; product updates.

Executive Assistant — Inbox and calendar for due dates in the vault. Drafts email; sends when you approve that specific message. Puts vault due dates on the calendar.

**Glossary (locked):** **Foundation** = the product. A **vault** = one instance (`FOUNDATION_DATA` + Postgres). The **graph** = the live network in that vault. A **blob** = a file on a node. An **agent** = anything that can reach the vault MCP. The **operator** = the human who runs Compose. Do not call the graph “the Vault.” Short analog: app / folder / links → Foundation / vault / graph. Ontology is the vocabulary (types and relations).

Do not commit personal life data, documents, or secrets to this repository. Those belong in the operator’s vault, not in git.

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — product contract
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — living vault and graph
- [`docs/MCP_TOOLS.md`](docs/MCP_TOOLS.md) — 14-tool MCP surface
- [`docs/HARNESS.md`](docs/HARNESS.md) — attach the vault MCP from a named harness
- [`docs/AGENTS.md`](docs/AGENTS.md) — starter recipes (Chief of Staff, Vault Keeper, Executive Assistant)
- [`docs/VAULT_HEALTH.md`](docs/VAULT_HEALTH.md) — weekday instance checkup
- [`docs/BACKUP.md`](docs/BACKUP.md) — nightly backup script and throwaway restore
- [`docs/GRAPH_HYGIENE.md`](docs/GRAPH_HYGIENE.md) — weekly graph report
- [`docs/VIEWER.md`](docs/VIEWER.md) — operator window contract: surfaces, shell, tokens, states

## Install

Requires [Docker Compose](https://docs.docker.com/compose/) and a copy of this repo. Node 22 is only needed if you run the app on the host instead of in Compose.

1. Copy the env file and set an API key (do not commit `.env`):

   ```bash
   cp .env.example .env
   # set FOUNDATION_API_KEY to a long random string
   ```

2. Start Postgres and the Foundation server. Durable files go under `FOUNDATION_DATA` (default `./data`):

   ```bash
   docker compose up --build
   ```

   After Compose is up, paste the starter recipes in [`docs/AGENTS.md`](docs/AGENTS.md). What “healthy” means: [`docs/VAULT_HEALTH.md`](docs/VAULT_HEALTH.md). Graph report: [`docs/GRAPH_HYGIENE.md`](docs/GRAPH_HYGIENE.md).

3. Point an MCP client at `http://127.0.0.1:8787/mcp` with:

   ```http
   Authorization: ApiKey <FOUNDATION_API_KEY>
   ```

   `Authorization: Bearer <FOUNDATION_API_KEY>` is accepted as an equivalent.

   After Compose is up, attach from Grok Bot, Hermes, OpenClaw, Claude Code, or Codex on this same machine. Put the URL and API key in that harness. Confirm it works: call `bootstrap` (step 4) or a simple `search`. What the operator does, plus the file snippet where the config differs: [`docs/HARNESS.md`](docs/HARNESS.md). The generic JSON shape (`url` + `headers`) is:

   ```json
   {
     "mcpServers": {
       "foundation": {
         "url": "http://127.0.0.1:8787/mcp",
         "headers": {
           "Authorization": "ApiKey YOUR_KEY"
         }
       }
     }
   }
   ```

4. Call `bootstrap` first. It returns the starter spine (`area → project → goal → habit | task` — preferred, not a hard gate for `task` → `project`), seeded types/relations, and how to extend the ontology.

   After bootstrap, an agent can `upsert` an `area` and `project`, `link` them with `child_of`, store an HTML itinerary on a `trip` node (`payload.media_type = "text/html"`), `search` that itinerary back, list open or overdue tasks with `search` `{ type: "task", status: "active" }` or `{ type: "task", due: "overdue" }` (no query), `upsert` a `spend` under a project (`amount` `12.50`, `currency` `USD`, `vendor` `Fixture vendor`, `stage` `quoted` or `paid`) and list those lines with `search` `{ type: "spend", under }` or `{ type: "spend", data_equals: { stage: "paid" } }`, `lookup` a name then `working_set` for the open work around that node, attach a PDF blob on a `note` (`payload.storage = "blob"`), `manage_type` a custom type (including retire of an unused authored type), `list_activity` for receipts, and `undo` a reversible mutation. Destructive tools (`delete`, `unlink`, `undo`, `manage_type` retire) require `confirm: true`. If you already have a UUID, call `get` for the node or `working_set` for the agenda. An empty lexical `search` is not a reason to upsert a duplicate.

   With Node 22 + pnpm (and Compose already up):

   ```bash
   pnpm bootstrap
   ```

   Or with curl (SSE JSON-RPC; look for the `data:` line):

   ```bash
   set -a && source .env && set +a
   ```

   **Health** (no auth): `GET http://127.0.0.1:8787/health` — `{ ok, service, db }`.

   **Window:** read-only operator window at `/view` (same API key as MCP). On this machine: `http://127.0.0.1:8788/view`. From another machine on this vault: `http://<this-host>:8788/view`. Unlock, then Home (Recents, open tasks, type folders), Collection, and Detail as a page. Search is a rail overlay. The window does not write.

   **Blobs:** large files are `$FOUNDATION_DATA/blobs/<uuid>` (not git, not agent-data). Ingest with `upsert` (`payload.storage = "blob"` plus `bytes_base64`, or drop a file in `$FOUNDATION_DATA/uploads` and pass `source_path`). Cap 20MB. Fetch bytes: `GET /blobs/:id` with the API key. `get` returns blob metadata, not the file body.

   **Bootstrap:**

   ```bash
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"bootstrap","arguments":{}}}'
   ```

   **Mutate → list_activity → search → undo** (replace UUIDs from the upsert/`list_activity` responses):

   ```bash
   # upsert an HTML itinerary
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"upsert","arguments":{"type":"trip","title":"Sample itinerary","payload":{"media_type":"text/html","storage":"inline","body":"<html><body><h1>Itinerary</h1><p>Day 1: arrive NRT</p></body></html>"}}}}'

   # search the itinerary back
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search","arguments":{"query":"arrive NRT","type":"trip"}}}'

   # list receipts for that node
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_activity","arguments":{"action":"create","target":"<NODE_UUID>"}}}'

   # undo that create (soft-deletes; requires confirm)
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"undo","arguments":{"id":"<ACTIVITY_UUID>","confirm":true}}}'
   ```

   **Store a small PDF as a blob** (synthetic example; `get` returns `blob_id` + sha256, not the bytes). Fetch bytes with `GET /blobs/<BLOB_ID>`:

   ```bash
   PDF_B64="$(printf '%s' '%PDF-1.1
trailer<</Root 1 0 R>>
%%EOF' | base64 -w0)"
   curl -sS http://127.0.0.1:8787/mcp \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"upsert\",\"arguments\":{\"type\":\"note\",\"title\":\"Sample PDF\",\"payload\":{\"media_type\":\"application/pdf\",\"storage\":\"blob\",\"bytes_base64\":\"${PDF_B64}\"}}}}"

   curl -sS "http://127.0.0.1:8787/blobs/<BLOB_ID>" \
     -H "Authorization: ApiKey ${FOUNDATION_API_KEY}" \
     -o /tmp/sample.pdf
   ```

   Operator drop-box (no base64): copy a file into `$FOUNDATION_DATA/uploads/` then `upsert` with `payload.source_path` set to the filename. The server moves it to `blobs/<uuid>`. Compose `db-init` creates `uploads/` mode 1777 (sticky) so the host user can write on a bind mount; `blobs/` stays 0700.

   If Postgres fails to start on a bind-mounted data dir, Compose already runs a `db-init` step that `chown`s `$FOUNDATION_DATA/postgres` to uid 999. `FOUNDATION_DATA` is the vault; keep that directory and leave Compose volumes intact.

Never point `FOUNDATION_DATA` at an agent profile or memory directory.

## License

[MIT](LICENSE) © 2026 Foundation contributors
