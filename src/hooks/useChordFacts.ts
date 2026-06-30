// Consume-when-connected: when the Tonality bridge is up, fetch the engine's
// set-class determinations for the current chord (debounced) so views can prefer
// them over the local recompute; returns null when offline/loading/errored, and the
// caller falls back to the local pure-theory core. First concrete step toward making
// Tonality the source of truth (README Roadmap — "Tonality at the core"). No hard
// dependency: null is a normal, fully-supported state.

import { useEffect, useState } from "react";
import { setClassInfo, type SetClassInfo } from "../lib/tonality/bridge";

export function useChordFacts(baseUrl: string, connected: boolean, pcs: number[]): SetClassInfo | null {
  const [facts, setFacts] = useState<SetClassInfo | null>(null);
  const key = pcs.join(",");

  useEffect(() => {
    if (!connected || pcs.length < 2) {
      setFacts(null);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setClassInfo(baseUrl, pcs, ctrl.signal)
        .then((f) => {
          if (!cancelled) setFacts(f);
        })
        .catch(() => {
          if (!cancelled) setFacts(null); // graceful fallback to local
        });
    }, 120);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(t);
    };
    // key captures pcs content; baseUrl/connected gate the call
  }, [baseUrl, connected, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return facts;
}
