// Audiology MCP server (v1) — a thin stdio wrapper that registers the pure tool
// handlers from tools.ts. Transport-agnostic handlers live there; this file only
// wires them to the MCP SDK over stdio. Run with `npm run mcp` (tsx). A future
// version can add an HTTP transport (parity with Tonality's bridge) by reusing the
// same TOOLS registry — no handler changes.
//
// The server imports only the React-free core (lib/theory via tools.ts), so it runs
// in plain Node with no DOM. See docs/proposals/audiology-mcp.md.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, envelope, MCP_MODEL_VERSION } from "./tools.ts";

const server = new Server(
  { name: "audiology", version: MCP_MODEL_VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return { content: [{ type: "text", text: `unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const result = tool.handler(req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(envelope(tool.name, result), null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr, not stdout — stdout is the MCP JSON-RPC channel.
  console.error(`audiology-mcp ${MCP_MODEL_VERSION} — ${TOOLS.length} tools on stdio`);
}

main().catch((e) => {
  console.error("audiology-mcp failed to start:", e);
  process.exit(1);
});
