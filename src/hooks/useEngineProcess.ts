// Drives the Tonality bridge launcher (the Vite dev-server middleware in
// vite.config.ts). start()/stop() POST to /__tonality/*; the real "connected"
// truth still comes from useBridge's probe, so this hook only tracks the
// in-between state: `starting` stays true from the click until the bridge
// actually connects (the engine can take a moment to import `mts`), and surfaces
// a server-side error if the process crashes (e.g. a bad PYTHONPATH).

import { useCallback, useEffect, useState } from "react";

export interface EngineProcess {
  start: () => void;
  stop: () => void;
  starting: boolean;
  error: string | null;
}

const START_TIMEOUT_MS = 15000;

export function useEngineProcess(connected: boolean): EngineProcess {
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setRequested(true);
    try {
      const res = await fetch("/__tonality/start", { method: "POST" });
      const j = await res.json();
      if (j.error) {
        setError(j.error);
        setRequested(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the dev-server launcher");
      setRequested(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setError(null);
    setRequested(false);
    try {
      await fetch("/__tonality/stop", { method: "POST" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the dev-server launcher");
    }
  }, []);

  // Once the bridge connects, the spawn succeeded — clear the pending state.
  useEffect(() => {
    if (connected) setRequested(false);
  }, [connected]);

  // While waiting to connect, poll the launcher's status so a process that
  // spawned but then crashed (stale `mts`, import error) surfaces its message
  // instead of spinning forever.
  useEffect(() => {
    if (!requested || connected) return;
    let alive = true;
    const t0 = Date.now();
    const tick = async () => {
      if (!alive) return;
      try {
        const j = await (await fetch("/__tonality/status")).json();
        if (!alive) return;
        if (!j.running && j.error) {
          setError(j.error);
          setRequested(false);
          return;
        }
        if (!j.running && Date.now() - t0 > 3000) {
          setError("Engine process exited before connecting — check the terminal.");
          setRequested(false);
          return;
        }
      } catch {
        /* dev server momentarily unreachable; keep waiting */
      }
      if (Date.now() - t0 > START_TIMEOUT_MS) {
        setError("Engine started but the bridge isn't responding — check PYTHONPATH / the venv.");
        setRequested(false);
        return;
      }
      if (alive) setTimeout(tick, 2000);
    };
    const id = setTimeout(tick, 1500);
    return () => { alive = false; clearTimeout(id); };
  }, [requested, connected]);

  return { start, stop, starting: requested && !connected, error };
}
