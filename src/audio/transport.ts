// Transport: schedules a parsed Song through the synth and tracks playback
// position. See CLAUDE.md "Phase 2 transport design" — this is that design.
//
// Two clocks, bridged by an anchor pair so tempo changes never jump:
//   song-time  s = Note.time, seconds (as authored)
//   audio-time a = ctx.currentTime
//     a = anchorAudio + (s - anchorSong) / tempoScale
//     s = anchorSong  + (a - anchorAudio) * tempoScale
// tempoScale is a multiplier (1 = as authored). Position is always DERIVED from
// ctx.currentTime — wall-clock is never accumulated, so a throttled background
// tab just does a bounded catch-up on the next tick.

import type { Song } from "../lib/midi/types";
import { activeNotesAt, nextOnset, prevOnset } from "../lib/midi/query";
import type { Synth } from "./synth";

const SCHED_INTERVAL_MS = 25; // how often the lookahead loop runs
const LOOKAHEAD = 0.1; // schedule this many audio-seconds ahead
const LATE = 0.02; // skip notes already >20ms late

export interface Transport {
  load(song: Song): void;
  play(): void;
  pause(): void;
  seek(songTime: number): void;
  stepForward(): void;
  stepBack(): void;
  setTempoScale(scale: number): void;
  setLoop(on: boolean): void;
  isLooping(): boolean;
  /** Current song-time position in seconds. */
  currentTime(): number;
  duration(): number;
  isPlaying(): boolean;
  tempoScale(): number;
  /** Notes sounding right now (derived from currentTime). */
  activeNotes(): ReturnType<typeof activeNotesAt>;
  /** Register a callback fired (rAF cadence while playing, once on transport ops) with the song-time. */
  setOnTick(cb: (t: number) => void): void;
  dispose(): void;
}

const velToGain = (v: number): number => 0.3 + 0.7 * Math.max(0, Math.min(1, v));

/** First index i with notes[i].time >= s (lower bound). */
function lowerBound(song: Song, s: number): number {
  const notes = song.notes;
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function createTransport(ctx: AudioContext, synth: Synth): Transport {
  let song: Song | null = null;
  let playing = false;
  let scale = 1;
  let loop = false;

  let anchorSong = 0;
  let anchorAudio = 0;
  // Cursor when paused; also the position playback resumes from.
  let pauseSong = 0;
  // Index of the next note to consider for scheduling.
  let scheduleIdx = 0;

  let schedTimer: ReturnType<typeof setInterval> | null = null;
  let rafId: number | null = null;
  let onTick: (t: number) => void = () => {};

  const songToAudio = (s: number): number => anchorAudio + (s - anchorSong) / scale;
  const audioToSong = (a: number): number => anchorSong + (a - anchorAudio) * scale;

  const currentTime = (): number => (playing ? audioToSong(ctx.currentTime) : pauseSong);
  const duration = (): number => song?.duration ?? 0;

  const anchorAt = (s: number): void => {
    anchorSong = s;
    anchorAudio = ctx.currentTime;
  };

  const resetSchedule = (fromSong: number): void => {
    scheduleIdx = song ? lowerBound(song, fromSong) : 0;
  };

  const tick = (): void => {
    if (!song || !playing) return;
    let now = currentTime();

    // Reached the end: loop back to the start, or stop and park the cursor.
    if (now >= song.duration) {
      if (loop) {
        anchorAt(0);
        resetSchedule(0);
        now = currentTime(); // ~0 after re-anchor
      } else {
        pauseSong = song.duration;
        stopLoops();
        playing = false;
        onTick(pauseSong);
        return;
      }
    }

    const horizon = now + LOOKAHEAD * scale; // song-time window edge
    const notes = song.notes;
    while (scheduleIdx < notes.length && notes[scheduleIdx].time <= horizon) {
      const n = notes[scheduleIdx];
      const delay = songToAudio(n.time) - ctx.currentTime;
      if (delay >= -LATE) {
        synth.playMidi(n.midi, n.duration / scale, Math.max(0, delay), velToGain(n.velocity));
      }
      scheduleIdx++;
    }
  };

  const frame = (): void => {
    if (!playing) return;
    onTick(currentTime());
    rafId = requestAnimationFrame(frame);
  };

  const startLoops = (): void => {
    if (!schedTimer) schedTimer = setInterval(tick, SCHED_INTERVAL_MS);
    if (rafId == null) rafId = requestAnimationFrame(frame);
    tick(); // schedule the first window immediately
  };

  const stopLoops = (): void => {
    if (schedTimer) {
      clearInterval(schedTimer);
      schedTimer = null;
    }
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const clamp = (s: number): number => Math.max(0, Math.min(duration(), s));

  return {
    load(s) {
      stopLoops();
      playing = false;
      song = s;
      pauseSong = 0;
      scale = 1;
      resetSchedule(0);
      onTick(0);
    },
    play() {
      if (!song || playing) return;
      synth.resume();
      // If parked at the end, start over from the beginning.
      if (pauseSong >= song.duration - 1e-6) pauseSong = 0;
      playing = true;
      anchorAt(pauseSong);
      resetSchedule(pauseSong);
      startLoops();
    },
    pause() {
      if (!playing) return;
      pauseSong = currentTime();
      playing = false;
      stopLoops();
      onTick(pauseSong);
    },
    seek(s) {
      const t = clamp(s);
      pauseSong = t;
      if (playing) {
        anchorAt(t);
        resetSchedule(t);
      }
      onTick(t);
    },
    stepForward() {
      if (!song) return;
      const t = nextOnset(song, currentTime());
      if (t != null) this.seek(t);
    },
    stepBack() {
      if (!song) return;
      const t = prevOnset(song, currentTime());
      this.seek(t ?? 0);
    },
    setTempoScale(s) {
      const next = Math.max(0.1, s);
      if (playing) {
        // Re-anchor at the current song position BEFORE changing the scale so
        // the position is continuous across the tempo change.
        anchorAt(currentTime());
      }
      scale = next;
    },
    setLoop(on) {
      loop = on;
    },
    isLooping: () => loop,
    currentTime,
    duration,
    isPlaying: () => playing,
    tempoScale: () => scale,
    activeNotes: () => (song ? activeNotesAt(song, currentTime()) : []),
    setOnTick(cb) {
      onTick = cb;
    },
    dispose() {
      stopLoops();
      playing = false;
    },
  };
}
