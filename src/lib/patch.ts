// Patch / preset serialization — a saved snapshot of every mutable *setting* in
// Audiology (scale/chord/label config, which views are shown, engine flags, and
// the per-channel instrument assignment), NOT the loaded MIDI content (a file is
// loaded separately). Pure + React-free + Node-tested: `sanitizePatch` coerces any
// parsed JSON into a complete, valid PatchState (defaults for missing/invalid
// fields — so an old or hand-edited patch never crashes the app). App reads its
// state into a PatchState and applies a loaded one back.

import { SCALES, QUALITIES } from "./theory/constants";
import { PRESET_ORDER, type PresetKey } from "../audio/instruments";

/** Bump when the shape changes incompatibly (sanitize stays tolerant of older). */
export const PATCH_VERSION = 1;

// View keys the app knows — kept in sync with App's ViewKey. Unknown keys in a
// loaded patch are dropped; missing ones fall to the default.
export const VIEW_KEYS = [
  "transport", "grid", "pianoRoll", "score", "piano", "bracelet", "tonnetz",
  "circle", "anatomy", "console", "interpret", "pcset", "instruments",
] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];

export interface PatchState {
  root: number;
  scaleName: string;
  mode: "inkey" | "chromatic";
  fixed: boolean;
  layout: "4ths" | "3rds" | "seq";
  orient: "vert" | "horiz";
  labelMode: "note" | "degree";
  noteNot: "auto" | "sharp" | "flat";
  degNot: "number" | "roman" | "solfege";
  degRef: "tonic" | "root";
  sound: boolean;
  interaction: "build" | "analyze" | "live";
  chordOn: boolean;
  tapChord: boolean;
  adaptToScale: boolean;
  chordRootPc: number;
  chordQuality: string;
  inversion: number;
  voicing: "close" | "drop2" | "drop3" | "spread" | "wide";
  chordDisplay: "tones" | "voicing";
  selected: number[];
  coalesceWindow: number | null;
  disambigRelKeys: boolean;
  smoothRegions: boolean;
  keyStripMode: "structural" | "windowed";
  chordLabelMode: "names" | "roman" | "both";
  views: Record<ViewKey, boolean>;
  followKey: boolean;
  showScaleColors: boolean;
  channelPresets: Record<number, PresetKey>;
  drumChannels: number[];
  livePreset: PresetKey;
}

/** The serialized file: the state plus a version stamp + a name. */
export interface Patch extends PatchState {
  patchVersion: number;
  name?: string;
}

export const DEFAULT_VIEWS: Record<ViewKey, boolean> = {
  transport: true, grid: true, pianoRoll: true, score: false, piano: true,
  bracelet: true, tonnetz: true, circle: false, anatomy: false, console: false,
  interpret: false, pcset: false, instruments: false,
};

export const DEFAULT_PATCH: PatchState = {
  root: 0, scaleName: "Major", mode: "chromatic", fixed: true, layout: "4ths",
  orient: "vert", labelMode: "note", noteNot: "auto", degNot: "number", degRef: "tonic",
  sound: true, interaction: "build", chordOn: true, tapChord: false, adaptToScale: false,
  chordRootPc: 0, chordQuality: "maj7", inversion: 0, voicing: "close", chordDisplay: "tones",
  selected: [], coalesceWindow: 0.5, disambigRelKeys: false, smoothRegions: false,
  keyStripMode: "structural", chordLabelMode: "names", views: { ...DEFAULT_VIEWS },
  followKey: false, showScaleColors: true, channelPresets: {}, drumChannels: [], livePreset: "piano",
};

// ----- validators --------------------------------------------------------------

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const int = (v: unknown, d: number, lo: number, hi: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d;
const intArr = (v: unknown, d: number[], lo: number, hi: number): number[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "number" && x >= lo && x <= hi).map((x) => Math.round(x)) : d;

const SCALE_NAMES = Object.keys(SCALES);
const QUALITY_KEYS = Object.keys(QUALITIES);

function sanitizePresets(v: unknown): Record<number, PresetKey> {
  const out: Record<number, PresetKey> = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const ch = Number(k);
      if (Number.isInteger(ch) && typeof val === "string" && (PRESET_ORDER as readonly string[]).includes(val)) {
        out[ch] = val as PresetKey;
      }
    }
  }
  return out;
}

/**
 * Coerce any parsed JSON into a complete, valid PatchState. Missing or invalid
 * fields take the default — so a partial, old, or hand-edited patch loads cleanly
 * (setting the app to that config; anything it omits becomes the default).
 */
export function sanitizePatch(raw: unknown): PatchState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PATCH;
  const views = { ...DEFAULT_VIEWS };
  if (r.views && typeof r.views === "object") {
    for (const k of VIEW_KEYS) {
      const val = (r.views as Record<string, unknown>)[k];
      if (typeof val === "boolean") views[k] = val;
    }
  }
  return {
    root: int(r.root, d.root, 0, 11),
    scaleName: oneOf(r.scaleName, SCALE_NAMES, d.scaleName),
    mode: oneOf(r.mode, ["inkey", "chromatic"], d.mode),
    fixed: bool(r.fixed, d.fixed),
    layout: oneOf(r.layout, ["4ths", "3rds", "seq"], d.layout),
    orient: oneOf(r.orient, ["vert", "horiz"], d.orient),
    labelMode: oneOf(r.labelMode, ["note", "degree"], d.labelMode),
    noteNot: oneOf(r.noteNot, ["auto", "sharp", "flat"], d.noteNot),
    degNot: oneOf(r.degNot, ["number", "roman", "solfege"], d.degNot),
    degRef: oneOf(r.degRef, ["tonic", "root"], d.degRef),
    sound: bool(r.sound, d.sound),
    interaction: oneOf(r.interaction, ["build", "analyze", "live"], d.interaction),
    chordOn: bool(r.chordOn, d.chordOn),
    tapChord: bool(r.tapChord, d.tapChord),
    adaptToScale: bool(r.adaptToScale, d.adaptToScale),
    chordRootPc: int(r.chordRootPc, d.chordRootPc, 0, 11),
    chordQuality: oneOf(r.chordQuality, QUALITY_KEYS, d.chordQuality),
    inversion: int(r.inversion, d.inversion, 0, 6),
    voicing: oneOf(r.voicing, ["close", "drop2", "drop3", "spread"], d.voicing),
    chordDisplay: oneOf(r.chordDisplay, ["tones", "voicing"], d.chordDisplay),
    selected: intArr(r.selected, d.selected, 0, 127),
    // null = "off / exact"; else a beats window (0..8). Anything else → default.
    coalesceWindow:
      r.coalesceWindow === null
        ? null
        : typeof r.coalesceWindow === "number" && Number.isFinite(r.coalesceWindow) && r.coalesceWindow >= 0 && r.coalesceWindow <= 8
          ? r.coalesceWindow
          : d.coalesceWindow,
    disambigRelKeys: bool(r.disambigRelKeys, d.disambigRelKeys),
    smoothRegions: bool(r.smoothRegions, d.smoothRegions),
    keyStripMode: oneOf(r.keyStripMode, ["structural", "windowed"], d.keyStripMode),
    chordLabelMode: oneOf(r.chordLabelMode, ["names", "roman", "both"], d.chordLabelMode),
    views,
    followKey: bool(r.followKey, d.followKey),
    showScaleColors: bool(r.showScaleColors, d.showScaleColors),
    channelPresets: sanitizePresets(r.channelPresets),
    drumChannels: intArr(r.drumChannels, d.drumChannels, -1, 15),
    livePreset: oneOf(r.livePreset, PRESET_ORDER, d.livePreset),
  };
}

/** Wrap a state snapshot as a saveable Patch (adds version + optional name). */
export function toPatch(state: PatchState, name?: string): Patch {
  return { patchVersion: PATCH_VERSION, ...(name ? { name } : {}), ...state };
}
