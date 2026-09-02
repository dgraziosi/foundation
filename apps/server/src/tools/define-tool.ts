import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isToolError } from "@foundation/schema";
import { z, type ZodRawShape } from "zod";

type ToolSpec<I extends ZodRawShape, O extends z.ZodTypeAny> = {
  name: string;
  description: string;
  input: I;
  /**
   * `tools/list` shape when it must differ from `input`.
   * Search lists `{ system, id }` only — a string union invites the refused call.
   */
  listed?: ZodRawShape;
  /**
   * SDK `tools/call` parse. The SDK validates this before the callback.
   * Must accept misses that `input` maps to `{ error, suggestion }`.
   */
  wire?: z.ZodTypeAny;
  output: O;
  handler: (
    input: z.infer<z.ZodObject<I>>,
  ) => Promise<z.infer<O> | { error: string; suggestion?: string }>;
};

/**
 * List and SDK parse share one registered schema. List reads `_def` / `.shape`.
 * SDK `safeParseAsync` must use `wire` so a mapped miss reaches defineTool.
 */
export function mcpListedWithWireParse(listed: z.ZodTypeAny, wire: z.ZodTypeAny): z.ZodTypeAny {
  return new Proxy(listed, {
    get(target, prop, receiver) {
      if (
        prop === "safeParse" ||
        prop === "safeParseAsync" ||
        prop === "parse" ||
        prop === "parseAsync"
      ) {
        const fn = Reflect.get(wire, prop, wire);
        return typeof fn === "function" ? (fn as (...args: unknown[]) => unknown).bind(wire) : fn;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Zod in / Zod out as the single source of truth for MCP tools. */
export function defineTool<I extends ZodRawShape, O extends z.ZodTypeAny>(
  server: McpServer,
  spec: ToolSpec<I, O>,
): void {
  const inputSchema = z.object(spec.input);
  const listed = spec.listed ? z.object(spec.listed) : inputSchema;
  const registered = spec.wire ? mcpListedWithWireParse(listed, spec.wire) : spec.listed ? listed : spec.input;
  const callback = (async (args: unknown): Promise<CallToolResult> => {
    const parsed = inputSchema.safeParse(args ?? {});
    if (!parsed.success) {
      const suggestion = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; ");
      const failure = { error: "Invalid input", suggestion };
      // Text only: SDK clients validate structuredContent against the success schema.
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify(failure, null, 2) }],
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
      inputSchema: registered as I,
      outputSchema: spec.output,
    },
    callback,
  );
}
