# Attach the vault MCP

After `/health` is green, the user (the human who runs this vault on this machine) attaches a named harness on the same machine.

## Shared pattern

1. **MCP URL:** `http://127.0.0.1:8787/mcp`
2. **API key:** send `Authorization: ApiKey YOUR_KEY`. Give each bot its own key. The bootstrap root is `FOUNDATION_API_KEY` in `.env`. Mint another with `scripts/mint-api-key.sh --name chief` (prints the secret once; stores a hash under `FOUNDATION_DATA`). `Authorization: Bearer YOUR_KEY` is accepted. Do not commit keys.
3. **Confirm it works:** in the harness, call `bootstrap`, or a simple `search` (for example `{ "type": "area" }`). `bootstrap` returns the starter spine. A connected harness can reach the tools already on the server.

Health: `GET http://127.0.0.1:8787/health` (no key: `{ ok, service, db }`). Window: `http://127.0.0.1:8788/view` (same API key; unlock, then Home, search, recents, type views). After unlock the window can write today’s journal. Other types stay read-only. The cookie still does not open MCP. Off-box: set `VIEW_HOST=0.0.0.0`, then `http://<this-host>:8788/view`.

Put the URL and header in the harness config file (or the command that writes that file). Snippets below are only where the file shape differs.

Starter recipes still paste from [`AGENTS.md`](./AGENTS.md). Named skill folders live in [`.agents/skills/`](../.agents/skills/). Import or point the harness at that folder so every named harness sees the same skills. One tree. Do not copy the folders into `.cursor/skills/` or a second library.

## Cursor

Cursor loads [`.agents/skills/`](../.agents/skills/) from the clone. Put this JSON in the MCP config (`mcpServers` with `url` + `headers`). Same URL and key as the shared pattern. Then call `bootstrap` or a simple `search`.

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

## Grok Bot

Grok Bot’s skill library is not this git tree. Import [`.agents/skills/`](../.agents/skills/) from the clone once so the bot sees the same folders. Point `[skills] paths` at that folder; do not copy the skills and do not add a skills MCP tool.

```toml
[skills]
paths = ["/absolute/path/to/the/clone/.agents/skills"]
```

Add a remote HTTP MCP connector named `foundation` on the machine that runs this vault. Put this in the connector config. Then call `bootstrap` or a simple `search`.

```json
{
  "name": "foundation",
  "url": "http://127.0.0.1:8787/mcp",
  "headers": {
    "Authorization": "ApiKey YOUR_KEY"
  }
}
```

## Hermes

Import or point Hermes at [`.agents/skills/`](../.agents/skills/) from the clone. Open `~/.hermes/config.yaml` and add a `foundation` server. Set `url` and `headers.Authorization` from the shared pattern. Then call `bootstrap` or a simple `search`.

```yaml
mcp_servers:
  foundation:
    url: "http://127.0.0.1:8787/mcp"
    headers:
      Authorization: "ApiKey YOUR_KEY"
```

## OpenClaw

Import or point OpenClaw at [`.agents/skills/`](../.agents/skills/) from the clone. Add an `mcp.servers` entry named `foundation` with `url`, `transport: "streamable-http"`, and `headers.Authorization`. Same URL and key as the shared pattern. Then call `bootstrap` or a simple `search`.

```json
{
  "mcp": {
    "servers": {
      "foundation": {
        "url": "http://127.0.0.1:8787/mcp",
        "transport": "streamable-http",
        "headers": {
          "Authorization": "ApiKey YOUR_KEY"
        }
      }
    }
  }
}
```

Control UI: Settings → MCP → Add server (Streamable HTTP).

## Claude Code

Import or point Claude Code at [`.agents/skills/`](../.agents/skills/) from the clone. Do not copy the folders into `.claude/skills/`. Run the command, or write `.mcp.json` (`type: "http"`, `url`, `headers`). Same URL and key as the shared pattern. Then call `bootstrap` or a simple `search`.

```bash
claude mcp add --transport http foundation http://127.0.0.1:8787/mcp --header "Authorization: ApiKey YOUR_KEY"
```

`.mcp.json` / `claude mcp add-json`:

```json
{
  "mcpServers": {
    "foundation": {
      "type": "http",
      "url": "http://127.0.0.1:8787/mcp",
      "headers": {
        "Authorization": "ApiKey YOUR_KEY"
      }
    }
  }
}
```

## Codex

Codex loads [`.agents/skills/`](../.agents/skills/) from the clone. Open `~/.codex/config.toml` (or project `.codex/config.toml`) and add `mcp_servers.foundation`. Set `url` and `http_headers.Authorization` from the shared pattern. Then call `bootstrap` or a simple `search`.

```toml
[mcp_servers.foundation]
url = "http://127.0.0.1:8787/mcp"

[mcp_servers.foundation.http_headers]
Authorization = "ApiKey YOUR_KEY"
```

`Bearer` via `bearer_token_env_var` also works because the server accepts Bearer. The ApiKey header matches the other snippets.
