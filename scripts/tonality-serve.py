#!/usr/bin/env python3
"""Local HTTP bridge to Tonality — the "web door" for Audiology's Live analyzer.

Audiology is a browser app and can't spawn the stdio MCP, so this is the
sanctioned interim per Tonality's triage (their gap 9): a thin local HTTP server
over `mts.mcp.tools`, which are pure, SDK-free functions returning JSON-ready
dicts. The tool signatures + result shapes are the contract, so a later swap to
the official bridge is ~a base-URL change on the client.

Run (needs the Tonality engine importable as `mts` — install it or set PYTHONPATH):

    PYTHONPATH=/path/to/Tonality python3 scripts/tonality-serve.py        # port 8765
    PYTHONPATH=/path/to/Tonality python3 scripts/tonality-serve.py 9000   # custom port

CORS is open (localhost dev tool). Endpoints:
    GET  /health        -> {ok: true}                  (auto-detect probe)
    POST /name_pcs      {pcs, tonic?, key_name?, realization_midi?} -> name_pcs() dict
    POST /analyze_midi  (raw .mid bytes in the body)    -> midi_file_analysis() dict
"""

import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 8765


def _tools():
    from mts.mcp import tools  # imported lazily so --help works without mts
    return tools


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send(self, code, obj):
        body = json.dumps(obj, default=str).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # CORS preflight
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"ok": True, "service": "tonality-bridge"})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)

        # Analyze a whole MIDI file: the body is raw .mid bytes (the browser can't
        # hand us a path, so we round-trip through a temp file).
        if self.path == "/analyze_midi":
            tmp = None
            try:
                with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as f:
                    f.write(body)
                    tmp = f.name
                res = _tools().midi_file_analysis(tmp)
                return self._send(200, res)
            except Exception as e:  # noqa: BLE001 — engine raises are signals; relay them
                return self._send(400, {"error": str(e)})
            finally:
                if tmp and os.path.exists(tmp):
                    os.unlink(tmp)

        try:
            args = json.loads(body or b"{}")
        except Exception as e:  # noqa: BLE001
            return self._send(400, {"error": f"bad json: {e}"})

        if self.path == "/name_pcs":
            try:
                res = _tools().name_pcs(
                    pcs=args["pcs"],
                    tonic=args.get("tonic"),
                    key_name=args.get("key_name"),
                    realization_midi=args.get("realization_midi"),
                )
                return self._send(200, res)
            except Exception as e:  # noqa: BLE001 — engine raises are signals; relay them
                return self._send(400, {"error": str(e)})

        return self._send(404, {"error": "unknown endpoint"})

    def log_message(self, *args):  # keep the console quiet
        pass


def main(argv):
    port = int(argv[1]) if len(argv) > 1 else DEFAULT_PORT
    try:
        _tools()
    except ModuleNotFoundError:
        print(
            "error: the Tonality engine (`mts`) is not importable.\n"
            "       pip install mts, or run with PYTHONPATH=/path/to/Tonality",
            file=sys.stderr,
        )
        return 1
    print(f"Tonality bridge on http://localhost:{port}  (Ctrl-C to stop)")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
