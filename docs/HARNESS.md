# Attach the vault MCP

After Compose is up, the operator (the human who runs Compose) points a harness at the vault. Same localhost URL and API key on every named harness. The harness runs on the same machine as Compose.

- URL: `http://127.0.0.1:8787/mcp`
- Header: `Authorization: ApiKey YOUR_KEY` (`Bearer` is accepted)
- Health: `GET http://127.0.0.1:8787/health`
- Window: `http://127.0.0.1:8787/view`

Replace `YOUR_KEY` with `FOUNDATION_API_KEY` from `.env`. Do not commit the key.

The twelve tools stay on the server. This page is how to attach, not a new tool. Starter recipes still paste from [`AGENTS.md`](./AGENTS.md).

## Cursor

Generic JSON (`mcpServers` with `url` + `headers`):

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

Add a remote HTTP MCP server named `foundation` on the computer that runs Compose. Use that URL and the Authorization header.

## Hermes

`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  foundation:
    url: "http://127.0.0.1:8787/mcp"
    headers:
      Authorization: "ApiKey YOUR_KEY"
```

## OpenClaw

`mcp.servers` entry with `url`, `transport: "streamable-http"`, and `headers.Authorization`:

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

```bash
claude mcp add --transport http foundation http://127.0.0.1:8787/mcp --header "Authorization: ApiKey YOUR_KEY"
```

`.mcp.json` / `claude mcp add-json` uses `type: "http"`, `url`, and `headers`:

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

`~/.codex/config.toml` (or project `.codex/config.toml`):

```toml
[mcp_servers.foundation]
url = "http://127.0.0.1:8787/mcp"

[mcp_servers.foundation.http_headers]
Authorization = "ApiKey YOUR_KEY"
```

`Bearer` via `bearer_token_env_var` also works because the server accepts Bearer. The ApiKey header matches the other snippets.
