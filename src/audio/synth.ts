// One synth, created against a single AudioContext (see CLAUDE.md: "one synth,
// one clock"). It serves two callers:
//   - playMidi(): fire-and-forget one-shot taps (pads, "play chord", playback).
//   - noteOn()/noteOff(): sustained voices held for as long as a key/MIDI note
//     is down — the basis of Live play.
// The fixed envelope of the original inline playMidi lives here unchanged so
// taps sound identical to before.

export interface Synth {
  /** One-shot note with a fixed decay envelope. `when` is an offset in seconds. */
  playMidi(midi: number, dur?: number, when?: number, gMul?: number): void;
  /** Start a sustained voice; retriggers if the note is already sounding. */
  noteOn(midi: number, velocity?: number): void;
  /** Release a sustained voice (no-op if not sounding). */
  noteOff(midi: number): void;
  /** Release every sustained voice. */
  allOff(): void;
  /** Resume the context if a browser started it suspended. */
  resume(): void;
}

interface Voice {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
}

const freqOf = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

export function createSynth(ctx: AudioContext): Synth {
  // One sustained voice per MIDI note. A note can only sound once at a time.
  const voices = new Map<number, Voice>();

  const resume = (): void => {
    if (ctx.state === "suspended") void ctx.resume();
  };

  const playMidi: Synth["playMidi"] = (midi, dur = 0.55, when = 0, gMul = 1) => {
    resume();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const gO2 = ctx.createGain();
    o.type = "triangle";
    o2.type = "sine";
    const f = freqOf(midi);
    o.frequency.value = f;
    o2.frequency.value = f * 2;
    gO2.gain.value = 0.25;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * gMul, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o2.connect(gO2).connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  };

  const noteOff: Synth["noteOff"] = (midi) => {
    const v = voices.get(midi);
    if (!v) return;
    voices.delete(midi);
    const t = ctx.currentTime;
    const REL = 0.18; // release tail, seconds
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, t + REL);
      v.osc.stop(t + REL + 0.03);
      v.osc2.stop(t + REL + 0.03);
    } catch {
      /* node may already be stopped */
    }
  };

  const noteOn: Synth["noteOn"] = (midi, velocity = 100) => {
    resume();
    if (voices.has(midi)) noteOff(midi); // retrigger
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const gO2 = ctx.createGain();
    o.type = "triangle";
    o2.type = "sine";
    const f = freqOf(midi);
    o.frequency.value = f;
    o2.frequency.value = f * 2;
    gO2.gain.value = 0.22;
    // velocity-sensitive peak, then a light decay down to a held sustain level
    const peak = 0.05 + 0.13 * Math.min(1, velocity / 127);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(peak * 0.7, t + 0.18);
    o.connect(g);
    o2.connect(gO2).connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o2.start(t);
    voices.set(midi, { osc: o, osc2: o2, gain: g });
  };

  const allOff: Synth["allOff"] = () => {
    [...voices.keys()].forEach(noteOff);
  };

  return { playMidi, noteOn, noteOff, allOff, resume };
}
