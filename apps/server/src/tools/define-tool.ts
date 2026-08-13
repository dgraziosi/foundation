import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isToolError } from "@foundation/schema";
import { z, type ZodRawShape } from "zod";

type ToolSpec<I extends ZodRawShape, O extends z.ZodTypeAny> = {
  name: string;
  description: string;
  input: I;
  output: O;
  handler: (
    input: z.infer<z.ZodObject<I>>,
  ) => Promise<z.infer<O> | { error: string; suggestion?: string }>;
};

/** Zod in / Zod out as the single source of truth for MCP tools. */
export function defineTool<I extends ZodRawShape, O extends z.ZodTypeAny>(
  server: McpServer,
  spec: ToolSpec<I, O>,
): void {
  const inputSchema = z.object(spec.input);
  const callback = (async (args: unknown): Promise<CallToolResult> => {
    const parsed = inputSchema.safeParse(args ?? {});
    if (!parsed.success) {
      const suggestion = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; ");
      const failure = { error: "Invalid input", suggestion };
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify(failure, null, 2) }],
        structuredContent: failure,
      };
    }
    const output = await spec.handler(parsed.data);
    if (isToolError(output)) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
    const success = spec.output.parse(output);
    return {
      content: [{ type: "text", text: JSON.stringify(success, null, 2) }],
      structuredContent: success as Record<string, unknown>,
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
