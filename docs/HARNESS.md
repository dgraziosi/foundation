# Attach the vault MCP

After Compose is up, the operator (the human who runs Compose) attaches a named harness on the same machine as Compose.

## Shared pattern

1. **MCP URL:** `http://127.0.0.1:8787/mcp`
2. **API key:** send `Authorization: ApiKey YOUR_KEY`. Replace `YOUR_KEY` with `FOUNDATION_API_KEY` from `.env`. `Authorization: Bearer YOUR_KEY` is accepted. Do not commit the key.
3. **Confirm it works:** in the harness, call `bootstrap`, or a simple `search` (for example `{ "type": "area" }`). `bootstrap` returns the starter spine. A connected harness can reach the twelve tools already on the server.

Health: `GET http://127.0.0.1:8787/health`. Window: `http://127.0.0.1:8787/view`.

Put the URL and header in the harness config file (or the command that writes that file). Snippets below are only where the file shape differs.

Starter recipes still paste from [`AGENTS.md`](./AGENTS.md).

## Cursor

Put this JSON in the MCP config (`mcpServers` with `url` + `headers`). Same URL and key as the shared pattern. Then call `bootstrap` or a simple `search`.

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

Add a remote HTTP MCP server named `foundation` on the computer that runs Compose. Set the URL to `http://127.0.0.1:8787/mcp`. Pass the API key as `Authorization: ApiKey YOUR_KEY`. Then call `bootstrap` or a simple `search`.

## Hermes

Open `~/.hermes/config.yaml` and add a `foundation` server. Set `url` and `headers.Authorization` from the shared pattern. Then call `bootstrap` or a simple `search`.

```yaml
mcp_servers:
  foundation:
    url: "http://127.0.0.1:8787/mcp"
    headers:
      Authorization: "ApiKey YOUR_KEY"
```

## OpenClaw

Add an `mcp.servers` entry named `foundation` with `url`, `transport: "streamable-http"`, and `headers.Authorization`. Same URL and key as the shared pattern. Then call `bootstrap` or a simple `search`.

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

Run the command, or write `.mcp.json` (`type: "http"`, `url`, `headers`). Same URL and key as the shared pattern. Then call `bootstrap` or a simple `search`.

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

Open `~/.codex/config.toml` (or project `.codex/config.toml`) and add `mcp_servers.foundation`. Set `url` and `http_headers.Authorization` from the shared pattern. Then call `bootstrap` or a simple `search`.

```toml
[mcp_servers.foundation]
url = "http://127.0.0.1:8787/mcp"

[mcp_servers.foundation.http_headers]
Authorization = "ApiKey YOUR_KEY"
```

`Bearer` via `bearer_token_env_var` also works because the server accepts Bearer. The ApiKey header matches the other snippets.
