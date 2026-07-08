// The instrument voice bank — oscillator-based melodic presets + a synthesized
// drum kit, all built on the shared Web Audio graph (no samples, no network,
// fully deterministic). `synth.ts` routes each note here by its assigned preset
// (or the GM percussion map for drums). Extend PRESETS to add timbres; the
// per-channel picker offers the whole bank for any channel.

const freqOf = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

// ----- melodic presets ---------------------------------------------------------

export type PresetKey =
  | "piano" | "epiano" | "organ" | "pluck" | "bass"
  | "strings" | "brass" | "flute" | "lead" | "pad";

interface OscSpec {
  type: OscillatorType;
  /** Frequency multiple of the note (1 = fundamental, 2 = octave up). */
  ratio: number;
  /** Mix level of this oscillator into the voice. */
  gain: number;
  /** Detune in cents (for fatness / chorusing). */
  detune?: number;
}

export interface Preset {
  key: PresetKey;
  label: string;
  oscs: OscSpec[];
  /** attack/decay/release in seconds; sustain 0..1 of peak. */
  env: { attack: number; decay: number; sustain: number; release: number };
  /** false = percussive (one decay over the note's length, ignores sustain — piano,
   *  pluck, bass); true = the note holds at the sustain level until it ends. */
  sustained: boolean;
  /** Optional tone-shaping lowpass. */
  filter?: { type: BiquadFilterType; freq: number; q: number };
  /** Overall level (folds in with the per-note velocity gain). */
  gain: number;
}

export const PRESETS: Record<PresetKey, Preset> = {
  piano: { key: "piano", label: "Piano", oscs: [{ type: "triangle", ratio: 1, gain: 1 }, { type: "sine", ratio: 2, gain: 0.28 }], env: { attack: 0.004, decay: 0.9, sustain: 0, release: 0.12 }, sustained: false, gain: 0.17 },
  epiano: { key: "epiano", label: "E-Piano", oscs: [{ type: "sine", ratio: 1, gain: 1 }, { type: "sine", ratio: 4, gain: 0.15 }], env: { attack: 0.004, decay: 1.1, sustain: 0, release: 0.18 }, sustained: false, filter: { type: "lowpass", freq: 3200, q: 0.6 }, gain: 0.18 },
  organ: { key: "organ", label: "Organ", oscs: [{ type: "sine", ratio: 1, gain: 1 }, { type: "sine", ratio: 2, gain: 0.5 }, { type: "sine", ratio: 3, gain: 0.3 }], env: { attack: 0.01, decay: 0.05, sustain: 1, release: 0.06 }, sustained: true, gain: 0.13 },
  pluck: { key: "pluck", label: "Pluck", oscs: [{ type: "triangle", ratio: 1, gain: 1 }, { type: "sawtooth", ratio: 1, gain: 0.2 }], env: { attack: 0.003, decay: 0.35, sustain: 0, release: 0.08 }, sustained: false, filter: { type: "lowpass", freq: 2600, q: 0.7 }, gain: 0.16 },
  bass: { key: "bass", label: "Bass", oscs: [{ type: "sine", ratio: 1, gain: 1 }, { type: "triangle", ratio: 2, gain: 0.25 }], env: { attack: 0.006, decay: 0.5, sustain: 0.15, release: 0.1 }, sustained: false, filter: { type: "lowpass", freq: 1400, q: 0.8 }, gain: 0.2 },
  strings: { key: "strings", label: "Strings", oscs: [{ type: "sawtooth", ratio: 1, gain: 1 }, { type: "sawtooth", ratio: 1, gain: 0.7, detune: 8 }, { type: "sawtooth", ratio: 1, gain: 0.7, detune: -8 }], env: { attack: 0.14, decay: 0.2, sustain: 0.8, release: 0.35 }, sustained: true, filter: { type: "lowpass", freq: 2600, q: 0.5 }, gain: 0.09 },
  brass: { key: "brass", label: "Brass", oscs: [{ type: "sawtooth", ratio: 1, gain: 1 }, { type: "square", ratio: 1, gain: 0.2 }], env: { attack: 0.05, decay: 0.15, sustain: 0.75, release: 0.16 }, sustained: true, filter: { type: "lowpass", freq: 3200, q: 0.9 }, gain: 0.12 },
  flute: { key: "flute", label: "Flute", oscs: [{ type: "sine", ratio: 1, gain: 1 }, { type: "triangle", ratio: 2, gain: 0.08 }], env: { attack: 0.06, decay: 0.1, sustain: 0.85, release: 0.14 }, sustained: true, gain: 0.15 },
  lead: { key: "lead", label: "Synth Lead", oscs: [{ type: "sawtooth", ratio: 1, gain: 1 }, { type: "square", ratio: 1, gain: 0.3, detune: 6 }], env: { attack: 0.008, decay: 0.1, sustain: 0.7, release: 0.12 }, sustained: true, filter: { type: "lowpass", freq: 4200, q: 1.1 }, gain: 0.12 },
  pad: { key: "pad", label: "Synth Pad", oscs: [{ type: "sawtooth", ratio: 1, gain: 1, detune: 6 }, { type: "sawtooth", ratio: 1, gain: 1, detune: -6 }, { type: "sine", ratio: 2, gain: 0.2 }], env: { attack: 0.35, decay: 0.4, sustain: 0.8, release: 0.6 }, sustained: true, filter: { type: "lowpass", freq: 2200, q: 0.5 }, gain: 0.08 },
};

export const PRESET_ORDER: PresetKey[] = ["piano", "epiano", "organ", "pluck", "bass", "strings", "brass", "flute", "lead", "pad"];

/** Map a General MIDI program number (0..127) to a preset. Families follow the
 *  standard GM instrument groups; unknown/out-of-range falls back to piano. */
export function gmProgramToPreset(program: number | undefined): PresetKey {
  if (program == null || program < 0) return "piano";
  if (program <= 7) return "piano";        // 0-7 pianos
  if (program <= 15) return "pluck";       // 8-15 chromatic percussion (bells/mallets)
  if (program <= 23) return "organ";       // 16-23 organs / accordion
  if (program <= 31) return "pluck";       // 24-31 guitars
  if (program <= 39) return "bass";        // 32-39 basses
  if (program <= 51) return "strings";     // 40-51 strings + ensemble
  if (program <= 55) return "pad";         // 52-55 voices / orchestra hit
  if (program <= 63) return "brass";       // 56-63 brass
  if (program <= 71) return "brass";       // 64-71 reeds → brass-ish
  if (program <= 79) return "flute";       // 72-79 pipes / flutes
  if (program <= 87) return "lead";        // 80-87 synth leads
  if (program <= 95) return "pad";         // 88-95 synth pads
  if (program <= 103) return "pad";        // 96-103 synth effects
  if (program <= 111) return "pluck";      // 104-111 ethnic (plucked)
  return "pluck";                          // 112-127 percussive / sfx
}

// A voice handle a sustained note can release. `release(t)` fades + stops.
export interface VoiceHandle {
  release(atSec: number): void;
}

/** Build the oscillator→amp(→filter)→dest graph for a melodic note, oscillators
 *  started at `t`. The caller schedules the amplitude envelope on `amp.gain`. */
function melodicGraph(ctx: AudioContext, dest: AudioNode, preset: Preset, midi: number, t: number): { amp: GainNode; oscs: OscillatorNode[] } {
  const freq = freqOf(midi);
  const amp = ctx.createGain();
  amp.gain.value = 0.0001;
  if (preset.filter) {
    const filt = ctx.createBiquadFilter();
    filt.type = preset.filter.type;
    filt.frequency.value = preset.filter.freq;
    filt.Q.value = preset.filter.q;
    amp.connect(filt).connect(dest);
  } else {
    amp.connect(dest);
  }
  const oscs: OscillatorNode[] = [];
  for (const spec of preset.oscs) {
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.value = freq * spec.ratio;
    if (spec.detune) osc.detune.value = spec.detune;
    const og = ctx.createGain();
    og.gain.value = spec.gain;
    osc.connect(og).connect(amp);
    osc.start(t);
    oscs.push(osc);
  }
  return { amp, oscs };
}

/** One-shot melodic note (pads, playback, taps). Fire-and-forget. */
export function triggerMelodic(ctx: AudioContext, dest: AudioNode, preset: Preset, midi: number, when: number, dur: number, gMul: number): void {
  const t = ctx.currentTime + Math.max(0, when);
  const { amp, oscs } = melodicGraph(ctx, dest, preset, midi, t);
  const g = amp.gain;
  const peak = preset.gain * gMul;
  const env = preset.env;
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + env.attack);
  let stopT: number;
  if (!preset.sustained) {
    // Percussive: one decay across the note, sustain ignored.
    const end = Math.max(t + env.attack + 0.02, t + dur);
    g.exponentialRampToValueAtTime(0.0001, end);
    stopT = end + 0.05;
  } else {
    const susLevel = Math.max(0.0001, peak * env.sustain);
    g.exponentialRampToValueAtTime(susLevel, t + env.attack + env.decay);
    const relStart = Math.max(t + env.attack + env.decay, t + dur);
    g.setValueAtTime(susLevel, relStart);
    g.exponentialRampToValueAtTime(0.0001, relStart + env.release);
    stopT = relStart + env.release + 0.05;
  }
  oscs.forEach((o) => o.stop(stopT));
}

/** Sustained melodic voice (Live play). Holds until `release()`. Uses a floor on
 *  sustain so even percussive presets stay audible while a key is held. */
export function startMelodic(ctx: AudioContext, dest: AudioNode, preset: Preset, midi: number, velocity: number): VoiceHandle {
  const t = ctx.currentTime;
  const { amp, oscs } = melodicGraph(ctx, dest, preset, midi, t);
  const g = amp.gain;
  const peak = preset.gain * (0.4 + 0.6 * Math.min(1, velocity / 127));
  const susLevel = Math.max(0.0001, peak * Math.max(preset.env.sustain, 0.28));
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + preset.env.attack);
  g.exponentialRampToValueAtTime(susLevel, t + preset.env.attack + preset.env.decay + 0.02);
  let stopped = false;
  return {
    release(atSec: number) {
      if (stopped) return;
      stopped = true;
      const rt = Math.max(atSec, ctx.currentTime);
      try {
        g.cancelScheduledValues(rt);
        g.setValueAtTime(g.value, rt);
        g.exponentialRampToValueAtTime(0.0001, rt + preset.env.release);
        oscs.forEach((o) => o.stop(rt + preset.env.release + 0.05));
      } catch {
        /* nodes may already be stopped */
      }
    },
  };
}

// ----- drum kit ----------------------------------------------------------------

export type DrumType =
  | "kick" | "snare" | "clap" | "hatClosed" | "hatOpen"
  | "tomLow" | "tomMid" | "tomHigh" | "crash" | "ride" | "perc";

/** GM percussion note number → a synth-kit voice. Unmapped notes → "perc". */
export const GM_DRUM_MAP: Record<number, DrumType> = {
  35: "kick", 36: "kick", 37: "perc", 38: "snare", 39: "clap", 40: "snare",
  41: "tomLow", 43: "tomLow", 45: "tomMid", 47: "tomMid", 48: "tomHigh", 50: "tomHigh",
  42: "hatClosed", 44: "hatClosed", 46: "hatOpen",
  49: "crash", 55: "crash", 57: "crash", 52: "crash",
  51: "ride", 53: "ride", 59: "ride",
  54: "perc", 56: "perc", 58: "perc", 69: "perc", 70: "perc",
};

export function drumFor(midi: number): DrumType {
  return GM_DRUM_MAP[midi] ?? "perc";
}

// A short white-noise buffer, made once per context.
const noiseCache = new WeakMap<AudioContext, AudioBuffer>();
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1), ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Deterministic pseudo-noise (no Math.random — reproducible): a hashed ramp.
    let s = 1234567;
    for (let i = 0; i < d.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x40000000) - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

function noiseHit(ctx: AudioContext, dest: AudioNode, t: number, level: number, dur: number, filter: { type: BiquadFilterType; freq: number; q?: number }): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter.type;
  f.frequency.value = filter.freq;
  f.Q.value = filter.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(ctx: AudioContext, dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, level: number, dur: number): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** One-shot drum hit synthesized from noise + oscillator bursts. */
export function triggerDrum(ctx: AudioContext, dest: AudioNode, type: DrumType, when: number, gMul: number): void {
  const t = ctx.currentTime + Math.max(0, when);
  const v = 0.5 + 0.5 * Math.min(1, gMul); // gMul already velocity-scaled by the caller
  switch (type) {
    case "kick":
      tone(ctx, dest, t, "sine", 140, 48, 0.9 * v, 0.14);
      noiseHit(ctx, dest, t, 0.12 * v, 0.03, { type: "lowpass", freq: 1200 });
      break;
    case "snare":
      tone(ctx, dest, t, "triangle", 190, 150, 0.28 * v, 0.09);
      noiseHit(ctx, dest, t, 0.5 * v, 0.14, { type: "bandpass", freq: 1900, q: 0.7 });
      break;
    case "clap":
      noiseHit(ctx, dest, t, 0.4 * v, 0.02, { type: "bandpass", freq: 1300, q: 0.8 });
      noiseHit(ctx, dest, t + 0.02, 0.42 * v, 0.12, { type: "bandpass", freq: 1300, q: 0.8 });
      break;
    case "hatClosed":
      noiseHit(ctx, dest, t, 0.3 * v, 0.035, { type: "highpass", freq: 7500 });
      break;
    case "hatOpen":
      noiseHit(ctx, dest, t, 0.3 * v, 0.32, { type: "highpass", freq: 7000 });
      break;
    case "tomLow":
      tone(ctx, dest, t, "sine", 130, 70, 0.7 * v, 0.24);
      break;
    case "tomMid":
      tone(ctx, dest, t, "sine", 200, 110, 0.7 * v, 0.2);
      break;
    case "tomHigh":
      tone(ctx, dest, t, "sine", 300, 170, 0.7 * v, 0.16);
      break;
    case "crash":
      noiseHit(ctx, dest, t, 0.4 * v, 0.9, { type: "highpass", freq: 5000 });
      break;
    case "ride":
      noiseHit(ctx, dest, t, 0.28 * v, 0.4, { type: "highpass", freq: 6500 });
      tone(ctx, dest, t, "square", 520, 480, 0.06 * v, 0.4);
      break;
    default: // perc
      noiseHit(ctx, dest, t, 0.35 * v, 0.06, { type: "bandpass", freq: 2500, q: 0.9 });
  }
}
