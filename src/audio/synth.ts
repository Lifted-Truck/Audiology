// One synth, created against a single AudioContext (see CLAUDE.md: "one synth,
// one clock"). It serves two callers:
//   - playMidi(): fire-and-forget one-shot taps (pads, "play chord", playback).
//   - noteOn()/noteOff(): sustained voices held for as long as a key/MIDI note
//     is down — the basis of Live play.
// Timbre comes from the instrument bank (audio/instruments.ts): each MIDI channel
// is routed to an assigned melodic preset, or to the synth drum kit when the
// channel is a drum channel. Taps and Live play use the `livePreset`. With no
// routing configured (nothing loaded), everything uses the default preset, so
// pads/taps sound the same as before a file is loaded.

import {
  PRESETS, triggerMelodic, startMelodic, triggerDrum, drumFor,
  type PresetKey, type VoiceHandle,
} from "./instruments";

export interface Synth {
  /** One-shot note. `when` is an offset in seconds. `channel`/`drum` route the
   *  timbre (from the per-channel routing); omit them for taps → the live preset. */
  playMidi(midi: number, dur?: number, when?: number, gMul?: number, channel?: number, drum?: boolean): void;
  /** Start a sustained voice (Live play), using the live preset; retriggers. */
  noteOn(midi: number, velocity?: number): void;
  /** Release a sustained voice (no-op if not sounding). */
  noteOff(midi: number): void;
  /** Release every sustained voice. */
  allOff(): void;
  /** Replace the per-channel routing: channel → preset, and the set of drum channels. */
  setRouting(presets: Record<number, PresetKey>, drumChannels: number[]): void;
  /** Preset used for taps / "play chord" / Live play. */
  setLivePreset(key: PresetKey): void;
  /** Audition a specific preset (for the instrument picker), bypassing routing. */
  previewPreset(key: PresetKey, midi?: number): void;
  /** Resume the context if a browser started it suspended. */
  resume(): void;
}

const DEFAULT_PRESET: PresetKey = "piano";

export function createSynth(ctx: AudioContext): Synth {
  const voices = new Map<number, VoiceHandle>();
  let channelPresets: Record<number, PresetKey> = {};
  let drumChannels = new Set<number>();
  let livePreset: PresetKey = DEFAULT_PRESET;

  const resume = (): void => {
    if (ctx.state === "suspended") void ctx.resume();
  };

  const presetForChannel = (channel?: number): PresetKey =>
    (channel != null && channelPresets[channel]) || livePreset;

  const playMidi: Synth["playMidi"] = (midi, dur = 0.55, when = 0, gMul = 1, channel, drum) => {
    resume();
    const isDrum = drum === true || (channel != null && drumChannels.has(channel));
    if (isDrum) {
      triggerDrum(ctx, ctx.destination, drumFor(midi), when, gMul);
      return;
    }
    triggerMelodic(ctx, ctx.destination, PRESETS[presetForChannel(channel)], midi, when, dur, gMul);
  };

  const noteOff: Synth["noteOff"] = (midi) => {
    const v = voices.get(midi);
    if (!v) return;
    voices.delete(midi);
    v.release(ctx.currentTime);
  };

  const noteOn: Synth["noteOn"] = (midi, velocity = 100) => {
    resume();
    if (voices.has(midi)) noteOff(midi); // retrigger
    voices.set(midi, startMelodic(ctx, ctx.destination, PRESETS[livePreset], midi, velocity));
  };

  const allOff: Synth["allOff"] = () => {
    [...voices.keys()].forEach(noteOff);
  };

  return {
    playMidi,
    noteOn,
    noteOff,
    allOff,
    setRouting(presets, drums) {
      channelPresets = presets;
      drumChannels = new Set(drums);
    },
    setLivePreset(key) {
      livePreset = key;
    },
    previewPreset(key, midi = 60) {
      resume();
      triggerMelodic(ctx, ctx.destination, PRESETS[key], midi, 0, 0.6, 1);
    },
    resume,
  };
}
