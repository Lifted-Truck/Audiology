// Audiology HTTP API — the same tool registry as the MCP server, served over
// loopback HTTP. Deliberately mirrors Tonality's bridge conventions (we consume
// that bridge, so consumers of ours get the identical ergonomics):
//   GET  /            → service info (the probe)
//   GET  /tools       → tool descriptors
//   POST /call/<tool> → JSON kwargs body → { ok, result } | { ok:false, error }
// Plus CORS hardened the way Tonality's RE-4e landed it: loopback web origins at
// any port are allowed and echoed specifically; no-Origin callers (curl, Node)
// pass; foreign origins are rejected with 403, not just denied the header.
// Run with `npm run api` (default port 8013; PORT=… overrides). Node stdlib only.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { TOOLS, envelope, MCP_MODEL_VERSION } from "./tools.ts";

const PORT = Number(process.env.PORT || 8013);

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function corsCheck(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // curl / Node / native callers
  if (LOOPBACK_ORIGIN.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin); // echo specifically, never *
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return true;
  }
  json(res, 403, { ok: false, error: `OriginNotAllowed: ${origin} (loopback web origins only)` });
  return false;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(s) });
  res.end(s);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (!corsCheck(req, res)) return;
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url ?? "/", "http://x");

  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, {
      service: "audiology-http-api",
      version: MCP_MODEL_VERSION,
      tools: TOOLS.length,
      endpoints: {
        "GET /tools": "descriptors for every tool",
        "POST /call/<name>": "invoke a tool with a JSON object of arguments",
      },
    });
  }

  if (req.method === "GET" && url.pathname === "/tools") {
    return json(res, 200, {
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  }

  const call = url.pathname.match(/^\/call\/([a-z_]+)$/);
  if (call) {
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "POST only" });
    const tool = TOOLS.find((t) => t.name === call[1]);
    if (!tool) return json(res, 404, { ok: false, error: `unknown tool: ${call[1]}` });
    try {
      const raw = await readBody(req);
      let args: unknown = {};
      if (raw.trim()) {
        try {
          args = JSON.parse(raw);
        } catch {
          return json(res, 400, { ok: false, error: "body must be a JSON object of arguments" });
        }
      }
      // Client mistakes (bad args) → 400 with the handler's message; anything the
      // handler throws on valid-shaped input would also land here, so keep handler
      // validation errors descriptive (Tonality's 400/500 split needs an error
      // taxonomy we don't have yet — v1 reports all handler throws as 400).
      try {
        const result = tool.handler(args);
        return json(res, 200, { ok: true, ...envelope(tool.name, result) });
      } catch (e) {
        return json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    } catch (e) {
      return json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  json(res, 404, { ok: false, error: `no route: ${req.method} ${url.pathname}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`audiology-http-api ${MCP_MODEL_VERSION} — ${TOOLS.length} tools on http://127.0.0.1:${PORT}`);
});
