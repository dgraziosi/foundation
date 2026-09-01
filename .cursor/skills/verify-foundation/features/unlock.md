# Unlock

Unlock is the door to the Viewer. The user types the same API key as MCP. A good key sets an HttpOnly cookie `Path=/view` and shows Home. A bad key stays on the door with **API key required**. The window is read-only. That cookie does not unlock MCP or agent blobs.

## Sub-features

- `unlock-door` shows **Unlock the vault window** when the session is missing or 401.
- `unlock-reject` keeps the door and shows **API key required** for a wrong key.
- `unlock-accept` accepts the key, sets `foundation_key` (`Path=/view`; HttpOnly; SameSite=Strict), and proceeds to Home.
- `unlock-cookie-scope` proves the cookie does not unlock `/mcp` or `/blobs/:id`.

## How to get to it (user POV)

- Open `http://127.0.0.1:8788/view` (or `http://<this-host>:8788/view` from another machine on this vault) with no session cookie.
- Open any `/view/...` route while the session is missing; the gate is the same door.
- Submit the form labeled by the heading **Unlock the vault window**, password field `name="api_key"`, button **Unlock**.

## Driving it with verify-foundation

Preconditions:

- `verify-foundation.sh doctor` reports health green (or you are proving only the fallback HTML on `:8788` while health is up).
- The key this vault accepted is in `verify-foundation.sh key-file` (or `FOUNDATION_API_KEY`). Do not print it.
- No `foundation_key` cookie in this browser, or use a fresh profile.

- **Open door.** Go to `http://127.0.0.1:8788/view`. The heading reads `Unlock the vault window`. Quiet copy: `Same key as MCP. This window is read-only.`
- **Reject.** Type a wrong key and choose **Unlock**. The door stays. Error copy: `API key required`.
- **Accept.** Type the real key and choose **Unlock**. Home appears (`[data-surface="home"]`) with Recents and Open tasks. The rail shows Home and Search.
- **HTTP reject.** `curl -sS -o /tmp/unlock-bad.json -w "%{http_code}" http://127.0.0.1:8788/view/unlock -H "content-type: application/json" -H "accept: application/json" -d '{"api_key":"wrong"}'`. Status `401`. Body `{"error":"API key required"}`.
- **HTTP accept.** `KEY_FILE="$(.cursor/skills/verify-foundation/scripts/verify-foundation.sh key-file)"`. `curl -sS -D - http://127.0.0.1:8788/view/unlock -H "content-type: application/json" -H "accept: application/json" -d "{\"api_key\":\"$(cat "${KEY_FILE}")\"}"`. Status `200`. Body `{"ok":true}`. `Set-Cookie` includes `foundation_key=` and `Path=/view` and `HttpOnly`. Redact the cookie value in evidence.
- **Session.** `curl -sS http://127.0.0.1:8788/view/api/session -H "Authorization: ApiKey $(cat "${KEY_FILE}")"`. Status `200`. Body `{"ok":true}`.
- **Cookie scope.** `curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/mcp -H "Cookie: foundation_key=not-a-write-credential"`. Not a successful tools call. MCP still needs `Authorization: ApiKey ...`.
- **Proof.** Save the reject status/body and the accept status/headers (redacted) under `evidence/<run-id>/unlock/`. If a browser drove the door, also save a screenshot that shows the heading, then Home after accept.

## Gotchas

- MCP bind is `127.0.0.1:8787`. Viewer bind is `0.0.0.0:8788`. Unlock on `:8787/view` is the wrong door.
- Without `apps/viewer/dist`, `:8788/view` still shows the unlock fallback HTML. That is enough to prove `unlock-door` and the form POST. It is not a React Home proof.
- `Authorization: Bearer <key>` is accepted as an equivalent of `ApiKey`. The cookie is Viewer-only.
- Do not write the key into evidence, git, or chat.
- A 401 on `/view/api/session` without a key is expected. It is the gate, not a down vault. Confirm `/health` separately.
