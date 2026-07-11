# Audiology MCP + HTTP API (v1)

Audiology's analysis capabilities exposed over the pure, React-free core — so other
agents/apps can call Audiology as the *face* (distinct from the Tonality bridge,
where Audiology is the *consumer*). **One tool registry, two transports**: MCP over
stdio (for agent hosts) and a loopback HTTP API (the direct path for apps like the
education tool). Design + roadmap: [`docs/proposals/audiology-mcp.md`](proposals/audiology-mcp.md).

**v1 scope:** analysis tools over `lib/theory`. Representation-as-SVG (`render_*`) and
file/session tools are v2/v3 (they need the headless-renderer extraction).

## Run

```bash
npm run mcp        # tsx src/mcp/server.ts — stdio JSON-RPC (MCP)
npm run api        # tsx src/mcp/http.ts  — loopback HTTP on 127.0.0.1:8013 (PORT=… overrides)
```

### The HTTP API

Deliberately mirrors Tonality's bridge conventions (we consume that bridge, so our
consumers get identical ergonomics):

```
GET  /                 → { service, version, tools }        (the probe)
GET  /tools            → { tools: [{name, description, inputSchema}] }
POST /call/<tool>      → JSON arguments body
                       → 200 { ok:true, audiology_mcp_version, tool, result }
                       → 400 bad arguments · 404 unknown tool · 403 foreign Origin
```

```bash
curl -s -X POST http://127.0.0.1:8013/call/set_class_info \
  -H "Content-Type: application/json" -d '{"pcs":[0,4,7]}'
```

CORS is hardened the way Tonality's landed: **loopback web origins at any port** are
allowed (echoed specifically, `Vary: Origin`, never `*`); **no-Origin callers**
(curl, Node, native apps) pass; **foreign origins get 403**, not just a missing header.

It runs in plain Node (no DOM). To wire it into an MCP client (Claude Desktop, an
agent host, etc.), point the client at it as an stdio server:

```json
{
  "mcpServers": {
    "audiology": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/Audiology"
    }
  }
}
```

## Tools

Every result is wrapped in a versioned envelope
`{ audiology_mcp_version, tool, result }` (`MCP_MODEL_VERSION`, bumped on any shape
change — the versioned-contract discipline).

| Tool | Input | Returns |
|---|---|---|
| `identify_chord` | `{ midis: int[] }` | Ranked chord candidates (name / inversion / bass), the pcs, and the realized voicing description. |
| `set_class_info` | `{ pcs: int[] }` | Set-class identity — prime form, normal order, interval vector, mask, set-class steps, transpositional + inversional symmetry, chirality, `|f5|` consonance, complement, and the two **somatic colours** (Audiology's derivation layer, which Tonality doesn't serve). |
| `scales_containing` | `{ pcs: int[] }` | Catalog scales/chords the set **is** (exact, Push-3 flagged), the scales it **sits inside**, and its **modes**. Local catalog (a later version proxies Tonality's `scale_names` for full breadth). |

## Architecture

- `src/mcp/tools.ts` — **pure, transport-agnostic handlers** + the tool registry +
  the versioned envelope. Node-testable without a client; a future HTTP transport
  reuses them unchanged.
- `src/mcp/server.ts` — a thin stdio wrapper (MCP SDK) that registers the handlers.
- The MCP is a **Node subproject**: it has its own `tsconfig.mcp.json` (Node types,
  TS-extension imports), and `src/mcp` is excluded from the browser `tsconfig.json`.
  `npm run typecheck` runs both configs.

## Boundary

Tools expose Audiology's **analysis/derivation** layer (chord ID, somatic colours,
chirality, set-class identity, the local catalog) — not a re-serving of Tonality's
theory. Where Tonality owns the deeper answer, later versions proxy the engine. The
numeric identity (pcs / prime form) is the boundary; naming/spelling is the display
edge, per the shared-engine rules.
