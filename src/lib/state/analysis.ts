// Pure selectors deriving the roll's analysis strips (key bands, pivot lane,
// chord regions) and the follow-the-key signals from engine analysis data.
// Extracted verbatim from App.tsx so the logic is React-free and unit-testable;
// App just wires state into these. No React imports (CLAUDE.md invariant).

import { spellInKey, chordRoman, keyRoman, scaleDegreeLabel, isDominantRoman } from "../theory";
import { qualitySymbol } from "../tonality";
import type { FileAnalysis, StructuralArea, Tonicization } from "../tonality";
import type { Song } from "../midi/types";

/** A labelled key-area band on the roll's key strip (seconds, song-time). */
export interface KeyBand {
  startSec: number;
  endSec: number;
  tonicPc: number;
  mode: string;
  label: string;
}

/** A labelled span for the chord strip / pivot lane. */
export interface LabelSpan {
  startSec: number;
  endSec: number;
  label: string;
}

/** A tonicization span carrying its local key + roman relative to the parent. */
export interface TonicizationSpan {
  startSec: number;
  endSec: number;
  tonicPc: number;
  mode: string;
  parentRoman: string;
}

const keyModeWord = (m: string) => (m === "major" ? " maj" : m === "minor" ? " min" : " " + m);

/**
 * Tonality's windowed local-key regions → a key-band strip (modulations become
 * visible). Low-confidence regions (tiny margin — the engine flagging
 * near-ambiguity) are absorbed into the prevailing key so the strip reads simply;
 * the full, every-region view is the planned "deeper analysis" mode. Each band is
 * spelled in its OWN key (a Bb-major region reads "Bb maj", not "A# maj",
 * regardless of the root the user has selected) and carries tonicPc/mode so the
 * chord strip below can match its spelling.
 */
export function windowedKeyBands(analysis: FileAnalysis | null): KeyBand[] {
  if (!analysis) return [];
  const MIN_MARGIN = 0.03; // below this, treat as "no real key change here"
  const merged: typeof analysis.keyRegions = [];
  for (const r of analysis.keyRegions) {
    if (merged.length && r.meanMargin < MIN_MARGIN) {
      merged[merged.length - 1] = { ...merged[merged.length - 1], endSec: r.endSec };
    } else {
      merged.push({ ...r });
    }
  }
  return merged.map((r) => ({
    startSec: r.startSec,
    endSec: r.endSec,
    tonicPc: r.tonicPc,
    mode: r.mode,
    label: spellInKey(r.tonicPc, r.tonicPc, r.mode) + keyModeWord(r.mode),
  }));
}

/**
 * structural_keys areas → key bands (beats → seconds via the song's exact map).
 * The structural reduction absorbs tonicizations, so this strip is the clean
 * key-area view (harness-validated); adjacent same-key areas collapse to one.
 * Consumer-side gate: absorb very short areas — brief tonicizations that just
 * cleared the engine's 8-beat floor (a real modulation worth showing lasts a few
 * bars) — into the surrounding key. So the strip shows structural modulations,
 * not flickers. (The engine-side principled version is the `min_area_beats`
 * re-anchoring — Tonality response-7, Finding 3b; this is the interim display gate.)
 */
export function structuralKeyBandsOf(song: Song | null, structuralAreas: StructuralArea[] | null): KeyBand[] {
  if (!song || !structuralAreas) return [];
  const MIN_AREA_BEATS = 24;
  const bands: KeyBand[] = [];
  for (const a of structuralAreas) {
    const endSec = song.beatsToSeconds(a.endBeats);
    if (endSec <= 0) continue; // area lies entirely in the trimmed-away leading silence
    // Clamp the start to 0 — the trim unshift can push the FIRST area negative (the
    // engine's window grid begins before the trimmed first note), which would draw its
    // label at a negative x, off the static canvas, losing the first section's key.
    const startSec = Math.max(0, song.beatsToSeconds(a.startBeats));
    const label = spellInKey(a.tonicPc, a.tonicPc, a.mode) + keyModeWord(a.mode);
    const prev = bands[bands.length - 1];
    const tooShort = a.endBeats - a.startBeats < MIN_AREA_BEATS;
    if (prev && (prev.label === label || tooShort)) prev.endSec = endSec;
    else bands.push({ startSec, endSec, tonicPc: a.tonicPc, mode: a.mode, label });
  }
  return bands;
}

/** The local key under the playhead (from the displayed key bands). */
export function segmentKeyAt(keyBands: KeyBand[], t: number): { tonicPc: number; mode: string } | null {
  const b = keyBands.find((band) => t >= band.startSec && t < band.endSec);
  return b && b.tonicPc != null && b.mode ? { tonicPc: b.tonicPc, mode: b.mode } : null;
}

/** The distinct keys the piece visits, in order (for the circle's journey trace). */
export function visitedKeysOf(keyBands: KeyBand[]): { tonicPc: number; mode: string }[] {
  const out: { tonicPc: number; mode: string }[] = [];
  for (const b of keyBands) {
    if (b.tonicPc == null || !b.mode) continue;
    const last = out[out.length - 1];
    if (!last || last.tonicPc !== b.tonicPc || last.mode !== b.mode) out.push({ tonicPc: b.tonicPc, mode: b.mode });
  }
  return out;
}

/**
 * Tonicizations (brief pivots the structural reduction absorbed) → spans in
 * seconds, carrying the tonicized key + its roman relative to the parent. Used
 * for the pivot-lane markers AND to tag applied/secondary dominants ("V7/vi")
 * in the chord strip. Only meaningful alongside the structural key bands.
 */
export function tonicizationSpansOf(song: Song | null, tonicizations: Tonicization[], structuralStrip: boolean): TonicizationSpan[] {
  if (!song || !structuralStrip || !tonicizations.length) return [];
  return tonicizations.map((t) => ({
    startSec: song.beatsToSeconds(t.startBeats),
    endSec: song.beatsToSeconds(t.endBeats),
    tonicPc: t.tonicPc,
    mode: t.mode,
    parentRoman: keyRoman(t.degree, t.parentMode, t.mode), // e.g. "vi" / "V"
  }));
}

/** Pivot-lane markers: the tonicized key's roman ("what it leans toward"). */
export function pivotBandsOf(spans: TonicizationSpan[]): LabelSpan[] {
  return spans.map((t) => ({ startSec: t.startSec, endSec: t.endSec, label: t.parentRoman }));
}

export type ChordLabelMode = "names" | "roman" | "both";

/**
 * Tonality's per-segment chord readings → time-aligned labels for the roll, each
 * spelled in the local key region it falls under (chords in an Eb section read
 * with flats, chords in an A-major section with sharps), with roman/applied-
 * dominant readings per the label mode. Fragments (blank, very short, or a
 * re-strike of the same chord) are absorbed into the surrounding band so only
 * genuine chord *changes* start a new region — the chord strip is a harmonic
 * summary, and at a low/off coalesce a held chord's release tails otherwise show
 * as spurious one-note "chords" (e.g. an "F" between two Gm7 strikes).
 */
export function chordRegionsOf(
  analysis: FileAnalysis | null,
  keyBands: KeyBand[],
  tonicizationSpans: TonicizationSpan[],
  chordLabelMode: ChordLabelMode,
  noteName: (pc: number) => string
): LabelSpan[] {
  if (!analysis) return [];
  // Use the *displayed* key bands (structural or windowed) for both spelling and
  // roman function, so the chord strip agrees with the key strip above it.
  const bandAt = (t: number) => keyBands.find((b) => t >= b.startSec && t < b.endSec);
  const spell = (pc: number, t: number) => {
    const b = bandAt(t);
    return b ? spellInKey(pc, b.tonicPc, b.mode) : noteName(pc);
  };
  const roman = (rootPc: number, quality: string, t: number) => {
    const b = bandAt(t);
    return b ? chordRoman(rootPc, quality, b.tonicPc, b.mode) : "";
  };
  const degree = (pc: number, t: number) => {
    const b = bandAt(t);
    return b ? scaleDegreeLabel(pc, b.tonicPc, b.mode) : "";
  };
  // Applied / secondary dominant: inside a tonicization span, a chord that's the
  // dominant of the tonicized key reads "V7/vi" etc. (its function in the target
  // key + the target's roman in the parent). null when it isn't an applied chord.
  const applied = (rootPc: number, quality: string, t: number) => {
    const ton = tonicizationSpans.find((s) => t >= s.startSec && t < s.endSec);
    if (!ton) return null;
    const inKey = chordRoman(rootPc, quality, ton.tonicPc, ton.mode);
    return isDominantRoman(inKey) ? inKey + "/" + ton.parentRoman : null;
  };
  const MIN_SEG_SEC = 0.12;
  const out: LabelSpan[] = [];
  for (const s of analysis.segments) {
    const mid = (s.startSec + s.endSec) / 2;
    const isChord = s.rootPc != null && s.quality != null;
    const single = !isChord && s.pcs.length === 1;
    const name = isChord ? spell(s.rootPc!, mid) + qualitySymbol(s.quality!) : single ? spell(s.pcs[0], mid) : "";
    // roman view: chord → applied-dominant tag if any, else its roman numeral;
    // single melodic note → its scale degree (arabic) so the strip reads cleanly.
    const rn = isChord
      ? applied(s.rootPc!, s.quality!, mid) || roman(s.rootPc!, s.quality!, mid)
      : single
        ? degree(s.pcs[0], mid)
        : "";
    const label = chordLabelMode === "roman" ? rn || name : chordLabelMode === "both" && rn ? name + " · " + rn : name;
    const prev = out[out.length - 1];
    if (prev && (!label || s.endSec - s.startSec < MIN_SEG_SEC || prev.label === label)) {
      prev.endSec = s.endSec; // extend the surrounding chord over the fragment / re-strike
    } else {
      out.push({ startSec: s.startSec, endSec: s.endSec, label });
    }
  }
  return out;
}
