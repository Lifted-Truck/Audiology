// Consume-when-connected: when the Tonality bridge is up, fetch the engine's
// set-class determinations for the current chord so views can prefer them over
// the local recompute; null when offline/loading/errored → the caller falls back
// to the local pure-theory core. An instance of the generic useEngineFacts seam.

import { setClassInfo, type SetClassInfo } from "../lib/tonality/bridge";
import { useEngineFacts } from "./useEngineFacts";

export function useChordFacts(baseUrl: string, connected: boolean, pcs: number[]): SetClassInfo | null {
  return useEngineFacts<SetClassInfo>({
    enabled: connected && pcs.length >= 2,
    key: baseUrl + "|" + pcs.join(","),
    fetch: (signal) => setClassInfo(baseUrl, pcs, signal),
  });
}
