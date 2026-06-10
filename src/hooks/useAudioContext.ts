// One AudioContext, one synth (CLAUDE.md: "one synth, one clock"), created
// lazily on first use inside a user gesture. Every caller in a component tree
// shares the same instances via this hook's stable getters, so live play,
// pad taps, and transport playback all run through the same synth/clock.

import { useRef } from "react";
import { createSynth, type Synth } from "../audio/synth";

export interface AudioHandle {
  /** Lazily create (once) and return the shared AudioContext. */
  getCtx(): AudioContext;
  /** Lazily create (once) and return the shared synth. */
  getSynth(): Synth;
}

export function useAudioContext(): AudioHandle {
  const ctxRef = useRef<AudioContext | null>(null);
  const synthRef = useRef<Synth | null>(null);
  const handleRef = useRef<AudioHandle | null>(null);

  if (!handleRef.current) {
    handleRef.current = {
      getCtx() {
        if (!ctxRef.current) {
          const Ctor =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          ctxRef.current = new Ctor();
        }
        return ctxRef.current;
      },
      getSynth() {
        if (!synthRef.current) synthRef.current = createSynth(this.getCtx());
        return synthRef.current;
      },
    };
  }

  return handleRef.current;
}
