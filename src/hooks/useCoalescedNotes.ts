// Coalesce a rapidly-changing set of MIDI notes. A note stays in the result for
// up to `holdMs` after it disappears, so a chord whose notes start or stop a few
// milliseconds apart reads as one stable set instead of flickering through
// transient 1- and 2-note states. Used to feed MIDI-file playback into the
// chord analyzer (CLAUDE.md Phase 4: "coalesce ~60ms").

import { useEffect, useRef, useState } from "react";

const sameSet = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function useCoalescedNotes(active: number[], holdMs = 60): number[] {
  const [out, setOut] = useState<number[]>([]);
  // midi note -> timestamp last seen active
  const seen = useRef<Map<number, number>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const recompute = (): void => {
      const t = performance.now();
      // Re-stamp every currently-active note. Crucial when paused/scrubbing: the
      // `active` array is then a stable reference (so this effect doesn't re-run),
      // and without re-stamping the timer would expire notes that are still
      // sounding at the held position.
      for (const m of active) seen.current.set(m, t);

      const next: number[] = [];
      seen.current.forEach((ts, m) => {
        if (t - ts <= holdMs) next.push(m);
        else seen.current.delete(m);
      });
      next.sort((a, b) => a - b);
      setOut((prev) => (sameSet(prev, next) ? prev : next));

      // Keep the timer alive only while some note is aging out (in `seen` but no
      // longer active). If everything in `seen` is active, nothing will expire,
      // so no timer is needed — the next `active` change re-runs this effect.
      if (timer.current) clearTimeout(timer.current);
      const activeSet = new Set(active);
      const pendingExpiry = [...seen.current.keys()].some((m) => !activeSet.has(m));
      timer.current = pendingExpiry ? setTimeout(recompute, holdMs) : null;
    };
    recompute();
  }, [active, holdMs]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return out;
}
