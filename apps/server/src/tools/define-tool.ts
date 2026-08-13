import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";

type ToolSpec<I extends ZodRawShape, O extends z.ZodTypeAny> = {
  name: string;
  description: string;
  input: I;
  output: O;
  handler: (input: z.infer<z.ZodObject<I>>) => Promise<z.infer<O>>;
};

/** Zod in / Zod out as the single source of truth for MCP tools. */
export function defineTool<I extends ZodRawShape, O extends z.ZodTypeAny>(
  server: McpServer,
  spec: ToolSpec<I, O>,
): void {
  const inputSchema = z.object(spec.input);
  const callback = (async (args: unknown): Promise<CallToolResult> => {
    const input = inputSchema.parse(args ?? {});
    const output = spec.output.parse(await spec.handler(input));
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output as Record<string, unknown>,
    };
  }) as unknown as ToolCallback<I>;
  server.registerTool(
    spec.name,
    {
      description: spec.description,
      inputSchema: spec.input,
      outputSchema: spec.output,
    },
    callback,
  );
}
