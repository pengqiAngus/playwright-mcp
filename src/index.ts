#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./mcp-server.js";
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("UI Test MCP Server running on stdio");
}   

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
