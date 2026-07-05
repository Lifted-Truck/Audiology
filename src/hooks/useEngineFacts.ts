// The generic consume-when-connected seam: fetch an engine determination for the
// current inputs (debounced, aborted on change), return null when offline /
// disabled / errored so the caller falls back to the local pure-theory core.
// Every engine consumer (set-class facts, live naming, structural keys, …) is an
// instance of this shape — one hook instead of a bespoke effect per consumer.
// null is a normal, fully-supported state, never an error (README Roadmap —
// "Tonality at the core": consume → package → delete the local duplicate).

import { useEffect, useRef, useState } from "react";

export interface EngineFactsOptions<T> {
  /** Gate: bridge connected AND the inputs are worth asking about. */
  enabled: boolean;
  /** Identity of the inputs — a change refetches. Compared with Object.is, so
   *  pass a stable primitive (e.g. `pcs.join(",")`) or a stable object reference
   *  (e.g. the `Song`), not a fresh literal each render. */
  key: unknown;
  /** The engine call. Read current inputs from the enclosing scope — the latest
   *  render's closure is used (a ref underneath), so no stale captures. */
  fetch: (signal: AbortSignal) => Promise<T>;
  /** Debounce before calling (coalesces rapid input changes). Default 120ms. */
  debounceMs?: number;
  /** Drop the previous result the moment the key changes (e.g. a new song must
   *  not show the old song's analysis). Default false: keep the previous result
   *  until the new one lands, so fast-changing inputs don't flicker to local. */
  clearOnKeyChange?: boolean;
}

export function useEngineFacts<T>({ enabled, key, fetch, debounceMs = 120, clearOnKeyChange = false }: EngineFactsOptions<T>): T | null {
  const [facts, setFacts] = useState<T | null>(null);
  // Always call the latest fetch closure (it captures this render's inputs; the
  // effect below re-runs on `key`, which is those inputs' identity).
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;
  const clearRef = useRef(clearOnKeyChange);
  clearRef.current = clearOnKeyChange;

  useEffect(() => {
    if (!enabled) {
      setFacts(null);
      return;
    }
    if (clearRef.current) setFacts(null);
    let cancelled = false;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetchRef
        .current(ctrl.signal)
        .then((f) => {
          if (!cancelled) setFacts(f);
        })
        .catch(() => {
          if (!cancelled) setFacts(null); // graceful fallback to local
        });
    }, debounceMs);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(t);
    };
    // `key` stands in for the fetch closure's inputs; debounceMs is constant per call site.
  }, [enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return facts;
}
