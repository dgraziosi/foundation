import {
  ADVERTISED_MCP_PROMPTS,
  ADVERTISED_MCP_RESOURCES,
  advertisedMcpPromptBody,
  schemaPackageRepoRoot,
} from "@foundation/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerGuidanceSurfaces(
  server: McpServer,
  repoRoot = schemaPackageRepoRoot(),
): void {
  for (const resource of ADVERTISED_MCP_RESOURCES) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: resource.description,
        mimeType: resource.mimeType,
      },
      async () => ({
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: resource.text,
          },
        ],
      }),
    );
  }
  for (const prompt of ADVERTISED_MCP_PROMPTS) {
    const text = advertisedMcpPromptBody(prompt, repoRoot);
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
      },
      async () => ({
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
      }),
    );
  }
}
