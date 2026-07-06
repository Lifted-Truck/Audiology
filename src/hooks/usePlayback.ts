// React wrapper around the Transport. Owns the playback-position state (driven
// by the transport's rAF tick) and exposes a small command API. Shares the
// app's single synth/clock via the AudioHandle, so playback, taps, and live
// play never spin up competing AudioContexts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseMidi } from "../lib/midi/parse";
import type { Song } from "../lib/midi/types";
import { createTransport, type Transport } from "../audio/transport";
import type { AudioHandle } from "./useAudioContext";

export interface Playback {
  song: Song | null;
  isPlaying: boolean;
  /** Current position, seconds (song-time). */
  currentTime: number;
  duration: number;
  /** Tempo multiplier (1 = as authored). */
  tempoScale: number;
  /** Whether playback loops back to the start at the end. */
  loop: boolean;
  /** MIDI numbers sounding right now — feeds Grid/Piano/Analyzer highlighting. */
  activeNotes: number[];
  /** Parse + load a MIDI file from an ArrayBuffer. */
  load(data: ArrayBuffer, name?: string): void;
  /** Eject the loaded file: stop playback and return to the no-song state. */
  unload(): void;
  play(): void;
  pause(): void;
  seek(t: number): void;
  stepForward(): void;
  stepBack(): void;
  setTempoScale(s: number): void;
  setLoop(on: boolean): void;
}

export function usePlayback(audio: AudioHandle): Playback {
  const transportRef = useRef<Transport | null>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tempoScale, setTempoScaleState] = useState(1);
  const [loop, setLoopState] = useState(false);

  const getTransport = useCallback((): Transport => {
    if (!transportRef.current) {
      const t = createTransport(audio.getCtx(), audio.getSynth());
      // The transport may also stop itself (end of song), so mirror its play
      // state here on every tick rather than only in the command handlers.
      t.setOnTick((time) => {
        setCurrentTime(time);
        setIsPlaying(t.isPlaying());
      });
      transportRef.current = t;
    }
    return transportRef.current;
  }, [audio]);

  useEffect(() => () => transportRef.current?.dispose(), []);

  const load = useCallback(
    (data: ArrayBuffer, name?: string) => {
      const parsed = parseMidi(data, name);
      getTransport().load(parsed);
      setSong(parsed);
      setDuration(parsed.duration);
      setTempoScaleState(1);
      setIsPlaying(false);
      setCurrentTime(0);
    },
    [getTransport]
  );

  const unload = useCallback(() => {
    getTransport().unload();
    setSong(null);
    setDuration(0);
    setTempoScaleState(1);
    setIsPlaying(false);
    setCurrentTime(0);
  }, [getTransport]);

  const play = useCallback(() => {
    getTransport().play();
    setIsPlaying(true);
  }, [getTransport]);

  const pause = useCallback(() => {
    getTransport().pause();
    setIsPlaying(false);
  }, [getTransport]);

  const seek = useCallback((t: number) => getTransport().seek(t), [getTransport]);
  const stepForward = useCallback(() => getTransport().stepForward(), [getTransport]);
  const stepBack = useCallback(() => getTransport().stepBack(), [getTransport]);

  const setTempoScale = useCallback(
    (s: number) => {
      const t = getTransport();
      t.setTempoScale(s);
      setTempoScaleState(t.tempoScale());
    },
    [getTransport]
  );

  const setLoop = useCallback(
    (on: boolean) => {
      getTransport().setLoop(on);
      setLoopState(on);
    },
    [getTransport]
  );

  // Sounding notes, recomputed as the position advances. Read from the transport
  // (live ctx.currentTime) so highlighting stays in sync with what's audible.
  const activeNotes = useMemo(() => {
    const t = transportRef.current;
    if (!t || !song) return [];
    return t.activeNotes().map((n) => n.midi);
    // currentTime drives the recompute cadence; song bounds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, song]);

  return {
    song,
    isPlaying,
    currentTime,
    duration,
    tempoScale,
    loop,
    activeNotes,
    load,
    unload,
    play,
    pause,
    seek,
    stepForward,
    stepBack,
    setTempoScale,
    setLoop,
  };
}
