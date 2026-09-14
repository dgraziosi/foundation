import {
  applyGeneratedMcpDocsToFiles,
  generatedMcpDocsDrift,
  schemaPackageRepoRoot,
} from "./mcp-inventory.js";

const check = process.argv.includes("--check");
const repoRoot = schemaPackageRepoRoot();

if (check) {
  const drift = generatedMcpDocsDrift(repoRoot);
  if (drift.length > 0) {
    const lines = drift.map((item) => `${item.path} (${item.region})`);
    console.error(`MCP docs drifted from the advertised inventory:\n${lines.join("\n")}`);
    console.error("Run: pnpm --filter @foundation/schema generate-mcp-docs");
    process.exit(1);
  }
  console.log("generate-mcp-docs: ok");
  process.exit(0);
}

applyGeneratedMcpDocsToFiles(repoRoot);
console.log("generate-mcp-docs: wrote docs/MCP_TOOLS.md and .agents/skills/foundation-mcp/SKILL.md");
