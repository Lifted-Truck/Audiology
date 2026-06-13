// Auto-detect connection to the local Tonality bridge. Probes a default
// localhost port on mount and re-probes periodically, so starting the bridge
// after the app is open still connects (and stopping it flips back to offline).
// The Live analyzer uses engine naming when connected and falls back to the
// local analyzer when not — graceful degradation, no hard dependency.

import { useEffect, useState } from "react";
import { probeBridge } from "../lib/tonality/bridge";

export const DEFAULT_BRIDGE_URL = "http://localhost:8765";
const PROBE_INTERVAL_MS = 5000;

export interface Bridge {
  connected: boolean;
  baseUrl: string;
}

export function useBridge(baseUrl: string = DEFAULT_BRIDGE_URL): Bridge {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let ctrl: AbortController | null = null;
    const probe = async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      const ok = await probeBridge(baseUrl, ctrl.signal);
      if (!cancelled) setConnected(ok);
    };
    probe();
    const id = setInterval(probe, PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      ctrl?.abort();
      clearInterval(id);
    };
  }, [baseUrl]);

  return { connected, baseUrl };
}
