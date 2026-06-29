import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

// Dev-server glue for the Tonality engine. A browser SPA can't spawn a process
// or hand the engine a filesystem path, but the Vite dev server runs in Node and
// can do both. Two middlewares, same-origin:
//
//   /__tonality/{start,stop,status}  — launch / stop the OFFICIAL Tonality HTTP
//        bridge (`python -m mts.mcp.bridge`, loopback :8012). The UI's Start
//        button hits this; useBridge's probe then flips to "connected".
//   /__tonality/analyze_midi         — the bytes→path adapter. The official
//        bridge's `midi_file_analysis` takes a *path*, but the browser only has
//        the uploaded bytes; this writes a temp file the loopback bridge can
//        read, calls it (with the coalesce window), and returns the result.
//        Live chord naming (name_pcs) and the probe go straight to the bridge.
//
// Paths default to the maintainer's machine (see HANDOFF.md), env-overridable:
// TONALITY_DIR, TONALITY_PYTHON, TONALITY_PORT. The .venv has a stale installed
// `mts`, so PYTHONPATH must point at the working tree — `-m mts.mcp.bridge` then
// resolves the engine from there.
function tonalityBridge(env: Record<string, string>): Plugin {
  // The optional engine. `env` is the merged .env*/.env.local + shell environment
  // (via loadEnv), so a machine can point at its own Tonality checkout in `.env.local`
  // (TONALITY_DIR / TONALITY_PYTHON / TONALITY_PORT) without editing committed code.
  // Default to a sibling checkout (clone Audiology and Tonality next to each other) so a
  // fresh clone needs no config; the app runs fully without the engine either way.
  const TONALITY_DIR = env.TONALITY_DIR || join(process.cwd(), "..", "Tonality");
  const PYTHON = env.TONALITY_PYTHON || `${TONALITY_DIR}/.venv/bin/python`;
  const PORT = env.TONALITY_PORT || "8012";
  const BRIDGE_URL = `http://127.0.0.1:${PORT}`;

  let child: ChildProcess | null = null;
  let lastError: string | null = null;
  let log = "";

  const running = () => !!child && child.exitCode === null && !child.killed;
  const json = (res: ServerResponse, code: number, obj: unknown) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };
  const readBody = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

  return {
    name: "tonality-bridge-launcher",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__tonality/status", (_req, res) => {
        json(res, 200, { running: running(), pid: child?.pid ?? null, error: lastError, log: log.slice(-2000) });
      });

      server.middlewares.use("/__tonality/start", (req, res) => {
        if (req.method !== "POST") return json(res, 405, { error: "POST only" });
        if (running()) return json(res, 200, { running: true, pid: child!.pid, alreadyRunning: true });

        lastError = null;
        log = "";
        try {
          // The official bridge (ROADMAP gap 9): stdlib-only, loopback HTTP.
          child = spawn(PYTHON, ["-m", "mts.mcp.bridge", "--port", PORT], {
            cwd: server.config.root,
            env: { ...process.env, PYTHONPATH: TONALITY_DIR },
          });
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          child = null;
          return json(res, 500, { running: false, error: lastError });
        }
        child.stdout?.on("data", (d) => { log += d.toString(); });
        child.stderr?.on("data", (d) => { log += d.toString(); });
        child.on("error", (e) => { lastError = e.message; child = null; });
        child.on("exit", (code) => {
          if (code && code !== 0) lastError = `engine exited (code ${code})` + (log ? `: ${log.slice(-400).trim()}` : "");
          child = null;
        });
        // Brief grace so an immediate spawn failure surfaces in the response.
        setTimeout(() => json(res, 200, { running: running(), pid: child?.pid ?? null, error: lastError }), 400);
      });

      server.middlewares.use("/__tonality/stop", (req, res) => {
        if (req.method !== "POST") return json(res, 405, { error: "POST only" });
        child?.kill("SIGTERM");
        child = null;
        json(res, 200, { running: false });
      });

      // Bytes→path adapter for file analysis. Body = raw .mid bytes; query
      // `?coalesce=<beats|off>` sets the performed-timing coalesce window.
      server.middlewares.use("/__tonality/analyze_midi", async (req, res) => {
        if (req.method !== "POST") return json(res, 405, { error: "POST only" });
        const qs = new URL(req.url ?? "", "http://x").searchParams;
        const q = qs.get("coalesce");
        const coalesce = q && q !== "off" ? Number(q) : null;
        const tmp = join(tmpdir(), `audiology-${Date.now()}-${process.pid}.mid`);
        try {
          await writeFile(tmp, await readBody(req));
          const r = await fetch(`${BRIDGE_URL}/call/midi_file_analysis`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: tmp,
              coalesce_window_beats: coalesce,
              disambiguate_relative_keys: qs.get("disambiguate") === "1",
              smooth_key_regions: qs.get("smooth") === "1",
            }),
          });
          const env = await r.json();
          if (!env?.ok) return json(res, 502, { error: env?.error || "engine error", error_type: env?.error_type });
          json(res, 200, env.result);
        } catch (e) {
          json(res, 502, { error: e instanceof Error ? e.message : String(e) });
        } finally {
          unlink(tmp).catch(() => {});
        }
      });

      // Don't leave an orphaned engine behind when the dev server stops.
      const cleanup = () => { child?.kill("SIGTERM"); child = null; };
      server.httpServer?.on("close", cleanup);
      process.once("exit", cleanup);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load .env, .env.local, etc. (all keys, no VITE_ prefix filter) so the engine
  // launcher can read machine-specific TONALITY_* without committing a personal path.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tonalityBridge(env)],
    server: { open: true },
  };
});
