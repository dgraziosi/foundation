# Unlock

Unlock is the door to the Viewer. The person types the vault key. A good key sets an HttpOnly cookie `Path=/view` and shows Home. A bad key stays on the door with **That key did not unlock.** That cookie unlocks Viewer routes (including journal write). It does not unlock MCP or agent blobs.

## Sub-features

- `unlock-door` shows **Unlock** when the session is missing or 401. The field is **Vault key**.
- `unlock-reject` keeps the door and shows **That key did not unlock.** for a wrong key. JSON `POST /view/unlock` uses the same error.
- `unlock-accept` accepts the key, sets `foundation_key` (`Path=/view`; HttpOnly; SameSite=Strict), and proceeds to Home.
- `unlock-cookie-scope` proves the cookie does not unlock `/mcp` or `/blobs/:id`.

## How to get to it (user POV)

- Open `http://127.0.0.1:8788/view` (or `http://<this-host>:8788/view` from another machine on this vault) with no session cookie.
- Open any `/view/...` route while the session is missing; the gate is the same door.
- Submit the form labeled **Unlock**, password field `name="api_key"` labeled **Vault key**, button **Unlock**.

## Driving it with verify-foundation

Preconditions:

- `verify-foundation.sh doctor` reports health green (or you are proving only the fallback HTML on `:8788` while health is up).
- The key this vault accepted is in `verify-foundation.sh key-file` (or `FOUNDATION_API_KEY`). Do not print it.
- No `foundation_key` cookie in this browser, or use a fresh profile.

- **Open door.** Go to `http://127.0.0.1:8788/view`. The heading reads `Unlock.` The field label is `Vault key`.
- **Reject.** Type a wrong key and choose **Unlock**. The door stays. Error copy: `That key did not unlock.`
- **Accept.** Type the real key and choose **Unlock**. Home appears (`[data-surface="home"]`) with Today, Recents, and Open tasks. The rail shows Home and Search.
- **HTTP reject.** `curl -sS -o /tmp/unlock-bad.json -w "%{http_code}" http://127.0.0.1:8788/view/unlock -H "content-type: application/json" -H "accept: application/json" -d '{"api_key":"wrong"}'`. Status `401`. Body `{"error":"That key did not unlock."}`.
- **HTTP accept.** `KEY_FILE="$(.cursor/skills/verify-foundation/scripts/verify-foundation.sh key-file)"`. `curl -sS -D - http://127.0.0.1:8788/view/unlock -H "content-type: application/json" -H "accept: application/json" -d "{\"api_key\":\"$(cat "${KEY_FILE}")\"}"`. Status `200`. Body `{"ok":true}`. `Set-Cookie` includes `foundation_key=` and `Path=/view` and `HttpOnly`. Redact the cookie value in evidence.
- **Session.** `curl -sS http://127.0.0.1:8788/view/api/session -H "Authorization: ApiKey $(cat "${KEY_FILE}")"`. Status `200`. Body `{"ok":true}`.
- **Cookie scope.** Use the `Set-Cookie` name=value pair from HTTP accept (first `;` segment; redact it in evidence). `curl -sS -o /tmp/mcp-cookie.json -w "%{http_code}" -X POST http://127.0.0.1:8787/mcp -H "content-type: application/json" -H "Cookie: foundation_key=<from-accept>" -d '{}'`. Status `401`. `GET http://127.0.0.1:8787/blobs/<id>` with only that cookie is also `401`. MCP still needs `Authorization: ApiKey ...`. Do not use `GET /mcp` — that is never a tools call (405 even with a good header).
- **Proof.** Save the reject status/body and the accept status/headers (redacted) under `evidence/<run-id>/unlock/`. If a browser drove the door, also save a screenshot that shows the heading, then Home after accept.

## Gotchas

- MCP bind is `127.0.0.1:8787`. Viewer bind is `0.0.0.0:8788`. Unlock on `:8787/view` is the wrong door.
- Without `apps/viewer/dist`, `:8788/view` still shows the unlock fallback HTML. That is enough to prove `unlock-door` and the form POST. It is not a React Home proof.
- `Authorization: Bearer <key>` is accepted as an equivalent of `ApiKey`. The cookie is Viewer-only.
- Do not write the key into evidence, git, or chat.
- A 401 on `/view/api/session` without a key is expected. It is the gate, not a down vault. Confirm `/health` separately.
