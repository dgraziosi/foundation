# Unlock

Unlock is the door to the Viewer. The person types the vault key (`FOUNDATION_VIEW_KEY`). MCP keys do not open the window. A good key sets an HttpOnly cookie `Path=/view`. The window then shows the page for that address. `/view` is Home. A bad key stays on the door with **That key did not unlock.** That cookie unlocks Viewer routes (including journal write). It does not unlock MCP or agent blobs.

## Sub-features

- `unlock-door` shows **Unlock.** when the session is missing or 401. The field is **Vault key**.
- `unlock-reject` keeps the door and shows **That key did not unlock.** for a wrong key. JSON `POST /view/unlock` uses the same error.
- `unlock-accept` accepts the key, sets `foundation_key` (`Path=/view`; HttpOnly; SameSite=Strict; Max-Age=2592000). The React door posts JSON and leaves the URL alone. A mapped Viewer path then paints there. `/view/unlock` and any other path paint Home. A non-JSON form POST is `303` to `/view` (Home).
- `unlock-cookie-scope` proves the cookie does not unlock `/mcp` or `/blobs/:id`.

## How to get to it (user POV)

- Open `http://127.0.0.1:8788/view` with no session cookie. Off-box names the tunnel Host as `VIEW_PUBLIC_ORIGIN` (https, or http with `FOUNDATION_ALLOW_CLEARTEXT=1`) and may set `VIEW_HOST=0.0.0.0`.
- Open any `/view/...` route while the session is missing; the gate is the same door.
- Submit the form labeled **Unlock**, password field `name="api_key"` labeled **Vault key**, button **Unlock**.

## Driving it with verify-foundation

Preconditions:

- `verify-foundation.sh doctor` reports health green (or you are proving only the fallback HTML on `:8788` while health is up).
- The vault key this vault accepted is in `verify-foundation.sh view-key-file` (throwaway launch always writes it). Do not print it. Do not fall back to `key-file` or `FOUNDATION_API_KEY`. Without a view key the window stays closed.
- No `foundation_key` cookie in this browser, or use a fresh profile.

- **Open door.** Go to `http://127.0.0.1:8788/view`. The heading reads `Unlock.` The field label is `Vault key`.
- **Reject.** Type a wrong key and choose **Unlock**. The door stays. Error copy: `That key did not unlock.`
- **Accept.** From `/view`, type the real key and choose **Unlock**. Home appears (`[data-surface="home"]`) with Today, Recents, and Open tasks. The rail shows Home, Trash, and Search.
- **Mapped path.** Open `/view/journal/today` with no cookie. Unlock. The address stays `/view/journal/today`. `[data-surface="journal-page"]`.
- **Unlock URL.** Open `/view/unlock` with no cookie. Unlock. Home appears. `/unlock` is not a mapped route.
- **HTTP reject.** `curl -sS -o /tmp/unlock-bad.json -w "%{http_code}" http://127.0.0.1:8788/view/unlock -H "content-type: application/json" -H "accept: application/json" -d '{"api_key":"wrong"}'`. Status `401`. Body `{"error":"That key did not unlock."}`.
- **MCP key does not unlock.** `API_KEY_FILE="$(.cursor/skills/verify-foundation/scripts/verify-foundation.sh key-file)"`. POST `/view/unlock` with that file's secret. Status `401`. Same copy: `That key did not unlock.` The house key never opens the window, including when no view key is set. Do this *before* accept so the peer ledger stays empty for the rate-limit burst.
- **HTTP accept.** `KEY_FILE="$(.cursor/skills/verify-foundation/scripts/verify-foundation.sh view-key-file)"`. If that file is missing, stop — the house key does not open the window. `curl -sS -D - http://127.0.0.1:8788/view/unlock -H "content-type: application/json" -H "accept: application/json" -d "{\"api_key\":\"$(cat "${KEY_FILE}")\"}"`. Status `200`. Body `{"ok":true}`. `Set-Cookie` includes `foundation_key=` (a session id, not the vault key), `Path=/view`, `HttpOnly`, and `Max-Age=2592000`. Localhost omits `Secure`. An https `VIEW_PUBLIC_ORIGIN` Host sets `Secure`. Redact the cookie value in evidence. A successful accept clears that peer's failure bucket.
- **Session.** `curl -sS http://127.0.0.1:8788/view/api/session -H "Authorization: ApiKey $(cat "${KEY_FILE}")"`. Status `200`. Body `{"ok":true}`.
- **Rate limit.** After that accept, six consecutive wrong unlocks with no other `POST /view/unlock` in between: the fifth is `401`, the sixth is `429` with `Retry-After`. Same copy. While that peer is locked, the right key is still `429`. A refused MCP-key unlock after accept is failure 1, so the fifth later wrong is already `429`.
- **Cookie scope.** Use the `Set-Cookie` name=value pair from HTTP accept (first `;` segment; redact it in evidence). `curl -sS -o /tmp/mcp-cookie.json -w "%{http_code}" -X POST http://127.0.0.1:8787/mcp -H "content-type: application/json" -H "Cookie: foundation_key=<from-accept>" -d '{}'`. Status `401`. `GET http://127.0.0.1:8787/blobs/<id>` with only that cookie is also `401`. MCP still needs `Authorization: ApiKey ...` with the API key file. That header still opens `/mcp`. Do not use `GET /mcp` — that is never a tools call (405 even with a good header).
- **Proof.** Save the reject status/body and the accept status/headers (redacted) under `evidence/<run-id>/unlock/`. If a browser drove the door, also save a screenshot that shows the heading, then Home after accept.

## Gotchas

- MCP bind is `127.0.0.1:8787`. Viewer bind is `127.0.0.1:8788` by default. Off-box names the tunnel Host as `VIEW_PUBLIC_ORIGIN` (https, or http with `FOUNDATION_ALLOW_CLEARTEXT=1`) and may set `VIEW_HOST=0.0.0.0`. Unlock on `:8787/view` is the wrong window. Both doors share the unlock ledger, so a lock on `:8788` is also `429` on `:8787`.
- A foreign `Host` is `403` `{"error":"Host not allowed"}` before the key is read. A foreign `Origin` on a `/view` write is `403` `{"error":"Origin not allowed"}`. The React door still shows **That key did not unlock.** for any thrown error.
- Without `apps/viewer/dist`, `:8788/view` still shows the unlock fallback HTML. That is enough to prove `unlock-door` and the form POST. It is not a React Home proof.
- `Authorization: Bearer <key>` is accepted as an equivalent of `ApiKey`. The cookie is Viewer-only.
- Do not write the key into evidence, git, or chat.
- A 401 on `/view/api/session` without a key is expected. It is the gate, not a down vault. Confirm `/health` separately.
- The React door posts JSON and leaves the URL alone. A mapped Viewer path then paints there. `/view/unlock` and any other path paint Home. A non-JSON form POST is `303` to `/view` (Home).
- Without `FOUNDATION_VIEW_KEY` the window stays closed. The house key is not a fallback on `/view/unlock` or `/view/api/*`.
- While a peer is locked, the right key is still `429`. Empty secrets do not count toward the budget.
