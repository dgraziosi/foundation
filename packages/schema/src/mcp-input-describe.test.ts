import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADVERTISED_MCP_INPUT_SCHEMAS,
  ADVERTISED_MCP_TOOL_NAMES,
  missingAdvertisedInputDescriptions,
} from "./mcp-inventory.js";

test("advertised MCP input schemas are the 16 registered tools", () => {
  assert.deepEqual(Object.keys(ADVERTISED_MCP_INPUT_SCHEMAS), [...ADVERTISED_MCP_TOOL_NAMES]);
});

test("every advertised MCP input field has Zod .describe()", () => {
  const missing = missingAdvertisedInputDescriptions();
  assert.deepEqual(missing, [], `missing .describe() on: ${missing.join(", ")}`);
});
