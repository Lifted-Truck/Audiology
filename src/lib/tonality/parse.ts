// Normalize a Tonality `midi_file_analysis` JSON into app-facing types. Pure;
// imports no React. Errors over guesses: a missing/mismatched schema or absent
// essentials throw, matching the engine's own "reduce, never invent" stance.

import {
  TONALITY_SCHEMA_VERSION,
  type RawAnalysis,
  type RawSegmentRecord,
} from "./types";

export interface KeyCandidate {
  tonicPc: number;
  mode: string;
  score: number;
}

export interface KeyResult {
  /** Top candidate. */
  tonicPc: number;
  mode: string;
  score: number;
  /** Difference between the top two candidates' scores (confidence signal). */
  margin: number;
  profileVersion: string;
  /** All ranked candidates, best first. */
  candidates: KeyCandidate[];
}

export interface ChordSegment {
  startSec: number;
  endSec: number;
  pcs: number[];
  cardinality: number;
  /** Primary (root, quality) reading, or null for single notes / un-nameable sets. */
  rootPc: number | null;
  quality: string | null;
  /** Every ranked (root, quality) reading the engine returned. */
  interpretations: { rootPc: number; quality: string }[];
}

export interface KeyRegion {
  startSec: number;
  endSec: number;
  tonicPc: number;
  mode: string;
  meanScore: number;
  meanMargin: number;
}

export interface FileAnalysis {
  key: KeyResult;
  segments: ChordSegment[];
  keyRegions: KeyRegion[];
  /** Itemized MIDI-read losses (RE-3, additive; [] when clean or pre-RE-3):
   *  re-strike truncations, dropped dangling note-ons / zero-length pairs —
   *  "a rectangle that never appears is explained". Surfaced in the console. */
  readLosses: unknown[];
}

export class TonalityParseError extends Error {}

/** Shift every time-extent in an analysis by `dt` seconds (clamped at 0). Used to
 *  re-align engine *file* analysis — which runs on the original bytes — onto a
 *  Song whose leading silence was trimmed (`dt = -song.trimSec`). */
export function shiftAnalysis(fa: FileAnalysis, dt: number): FileAnalysis {
  if (!dt) return fa;
  const s = (t: number) => Math.max(0, t + dt);
  return {
    key: fa.key,
    segments: fa.segments.map((g) => ({ ...g, startSec: s(g.startSec), endSec: s(g.endSec) })),
    keyRegions: fa.keyRegions.map((r) => ({ ...r, startSec: s(r.startSec), endSec: s(r.endSec) })),
    readLosses: fa.readLosses,
  };
}

function req<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new TonalityParseError(`Tonality analysis: missing ${what}`);
  return v;
}

/** Parse a `midi_file_analysis` result (already JSON-decoded) into a FileAnalysis. */
export function parseTonalityAnalysis(raw: unknown): FileAnalysis {
  if (typeof raw !== "object" || raw === null) {
    throw new TonalityParseError("Tonality analysis: expected an object");
  }
  const a = raw as RawAnalysis;

  const dataset = req(a.dataset, "dataset");
  if (dataset.schema_version !== TONALITY_SCHEMA_VERSION) {
    throw new TonalityParseError(
      `Tonality analysis: schema_version ${dataset.schema_version} != expected ${TONALITY_SCHEMA_VERSION}`
    );
  }

  const rawKey = req(a.key, "key");
  const cands = req(rawKey.candidates, "key.candidates");
  if (cands.length === 0) throw new TonalityParseError("Tonality analysis: empty key.candidates");
  const candidates: KeyCandidate[] = cands.map((c) => ({ tonicPc: c.tonic_pc, mode: c.mode, score: c.score }));
  const key: KeyResult = {
    tonicPc: candidates[0].tonicPc,
    mode: candidates[0].mode,
    score: candidates[0].score,
    margin: rawKey.margin,
    profileVersion: rawKey.profile_version,
    candidates,
  };

  const segments: ChordSegment[] = req(dataset.records, "dataset.records").map(segmentOf);

  const keyRegions: KeyRegion[] = (a.key_regions?.regions ?? []).map((r) => ({
    startSec: r.start_seconds,
    endSec: r.end_seconds,
    tonicPc: r.tonic_pc,
    mode: r.mode,
    meanScore: r.mean_score,
    meanMargin: r.mean_margin,
  }));

  return { key, segments, keyRegions, readLosses: Array.isArray(a.midi_read_losses) ? a.midi_read_losses : [] };
}

function segmentOf(rec: RawSegmentRecord): ChordSegment {
  const pl = req(rec.placement, "record.placement");
  const interps = (rec.analysis?.interpretations?.interpretations ?? []).map((i) => ({
    rootPc: i.root_pc,
    quality: i.quality,
  }));
  return {
    startSec: pl.onset_seconds,
    endSec: pl.onset_seconds + pl.duration_seconds,
    pcs: rec.identity.pcs,
    cardinality: rec.identity.cardinality,
    rootPc: interps.length ? interps[0].rootPc : null,
    quality: interps.length ? interps[0].quality : null,
    interpretations: interps,
  };
}

/** Engine quality string → a compact chord-symbol suffix. Spelling/symbol style
 * is a display concern (kept app-side per the contract); unknown qualities fall
 * back to the raw engine string. */
const QUALITY_SYMBOL: Record<string, string> = {
  maj: "", major: "", M: "",
  min: "m", minor: "m", m: "m",
  dim: "°", diminished: "°",
  aug: "+", augmented: "+",
  dom7: "7", "7": "7",
  maj7: "maj7", min7: "m7", m7: "m7",
  m7b5: "m7♭5", dim7: "°7",
  sus2: "sus2", sus4: "sus4",
  maj6: "6", "6": "6", min6: "m6", m6: "m6",
};

export function qualitySymbol(quality: string): string {
  return quality in QUALITY_SYMBOL ? QUALITY_SYMBOL[quality] : quality;
}

/** Whether the inferred-key mode maps onto a scale Audiology can select. */
export function modeToScaleName(mode: string): "Major" | "Minor" | null {
  if (mode === "major") return "Major";
  if (mode === "minor") return "Minor";
  return null;
}
