// Client for Tonality's OFFICIAL local HTTP bridge (`python -m mts.mcp.bridge`,
// loopback :8012) — the "web door" for live, engine-backed chord naming. Same
// data-contract boundary idea as parse.ts: this module owns the wire format; the
// app consumes the normalized `ChordNaming`. The bridge is generic glue:
// `GET /` (service info — our probe), `GET /tools` (discovery), `POST /call/<tool>`
// with a JSON kwargs body → `{ok, result}` (or `{ok:false, error, error_type}`).
// File analysis is the exception: `midi_file_analysis` takes a server-side path,
// so an uploaded file's bytes go through our same-origin Vite adapter
// (/__tonality/analyze_midi), which writes a temp file the loopback bridge reads.
// Imports no React.

import type { ScaleName } from "../theory/constants";

/**
 * The key-profile prior, pinned EXPLICITLY (not left to the engine default) per the
 * cross-project key-grain-alignment contract (Wend ↔ Audiology). Margins are
 * calibrated to the profile, so pinning it keeps our reading deterministic and
 * comparable across projects. If this changes, re-check the `meanMargin` region-
 * absorption gate in App (`windowedKeyBands`), whose 0.03 threshold is margin-scaled.
 */
export const TONALITY_PROFILE = "kk-1982.1";

export interface NamingReading {
  rootPc: number;
  quality: string;
  aliases: string[];
  /** Functional role in the key context, e.g. "tonic" / "dominant" (or null). */
  functionalRole: string | null;
  score: number;
}

/**
 * What the engine knows about a set it can NOT name (gap 33). Present only when
 * `chosen` is null — the engine's point being that it can never truly have "no
 * identity" for a pc set, only no registered *chord quality*. Two distinct kinds
 * of reading live here and shouldn't be conflated in the UI:
 *   quality_subsets — partial readings of what WAS played ("an F dim, plus a C")
 *   near_qualities  — what it ALMOST is, one pc swap away (an actionable diff)
 * Lists are capped but carry true totals, per the engine's no-silent-caps rule.
 */
export interface UnmatchedInfo {
  primeForm: number[];
  normalOrder: number[];
  intervalVector: number[];
  qualitySubsets: { rootPc: number; quality: string; pcs: number[]; addedPcs: number[] }[];
  nearQualities: { rootPc: number; quality: string; pcs: number[]; swapFromPc: number; swapToPc: number }[];
  nearQualityCount: number;
  containingScales: { name: string; rootPc: number; cardinality: number; isExact: boolean }[];
  containingScaleCount: number;
}

export interface ChordNaming {
  chosen: NamingReading | null;
  alternatives: NamingReading[];
  isAmbiguous: boolean;
  /** Populated only when `chosen` is null; null for every named chord. */
  unmatched: UnmatchedInfo | null;
}

interface RawReading {
  interpretation: { root_pc: number; quality: string; aliases?: string[] };
  functional_role?: string | null;
  score: number;
}

const readingOf = (c: RawReading): NamingReading => ({
  rootPc: c.interpretation.root_pc,
  quality: c.interpretation.quality,
  aliases: c.interpretation.aliases ?? [],
  functionalRole: c.functional_role ?? null,
  score: c.score,
});

interface RawUnmatched {
  prime_form?: number[];
  normal_order?: number[];
  interval_vector?: number[];
  quality_subsets?: { root_pc: number; quality: string; pcs: number[]; added_pcs: number[] }[];
  near_qualities?: { root_pc: number; quality: string; pcs: number[]; swap_from_pc: number; swap_to_pc: number }[];
  near_quality_count?: number;
  containing_scales?: { name: string; root_pc: number; cardinality: number; is_exact: boolean }[];
  containing_scale_count?: number;
}

const unmatchedOf = (u: RawUnmatched): UnmatchedInfo => ({
  primeForm: u.prime_form ?? [],
  normalOrder: u.normal_order ?? [],
  intervalVector: u.interval_vector ?? [],
  qualitySubsets: (u.quality_subsets ?? []).map((q) => ({
    rootPc: q.root_pc, quality: q.quality, pcs: q.pcs ?? [], addedPcs: q.added_pcs ?? [],
  })),
  nearQualities: (u.near_qualities ?? []).map((n) => ({
    rootPc: n.root_pc, quality: n.quality, pcs: n.pcs ?? [], swapFromPc: n.swap_from_pc, swapToPc: n.swap_to_pc,
  })),
  nearQualityCount: u.near_quality_count ?? (u.near_qualities ?? []).length,
  containingScales: (u.containing_scales ?? []).map((c) => ({
    name: c.name, rootPc: c.root_pc, cardinality: c.cardinality, isExact: c.is_exact === true,
  })),
  containingScaleCount: u.containing_scale_count ?? (u.containing_scales ?? []).length,
});

/** GET / — true if the official bridge is up. Never throws. */
export async function probeBridge(baseUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const r = await fetch(baseUrl + "/", { signal });
    if (!r.ok) return false;
    const j = await r.json();
    return j?.service === "tonality-http-bridge";
  } catch {
    return false;
  }
}

export interface NameChordInput {
  pcs: number[];
  /** Tonic as a note name ("C", "F#", "Bb"). */
  tonic?: string;
  /** Engine scale name ("Ionian", "Aeolian", …) — see scaleToEngineKey. */
  keyName?: string;
  /** Actual sounding MIDI notes, for bass/register-aware disambiguation. */
  realizationMidi?: number[];
}

/** Unwrap the bridge's `{ok, result}` envelope; throw the engine's message on failure. */
async function callTool(baseUrl: string, tool: string, kwargs: unknown, signal?: AbortSignal): Promise<unknown> {
  const r = await fetch(baseUrl + "/call/" + tool, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(kwargs),
  });
  const env = await r.json().catch(() => null);
  if (!env || env.ok !== true) throw new Error(env?.error || "bridge /call/" + tool + " " + r.status);
  return env.result;
}

/** POST /call/name_pcs — exhaustive, context-aware chord naming. Throws on HTTP/engine error. */
export async function nameChord(baseUrl: string, input: NameChordInput, signal?: AbortSignal): Promise<ChordNaming> {
  const res = (await callTool(
    baseUrl,
    "name_pcs",
    { pcs: input.pcs, tonic: input.tonic, key_name: input.keyName, realization_midi: input.realizationMidi },
    signal
  )) as {
    chosen?: RawReading; alternatives?: RawReading[]; is_ambiguous?: boolean;
    unmatched?: RawUnmatched | null;
  };
  return {
    chosen: res.chosen ? readingOf(res.chosen) : null,
    alternatives: Array.isArray(res.alternatives) ? res.alternatives.map(readingOf) : [],
    isAmbiguous: res.is_ambiguous === true,
    // Additive field: absent on engines predating gap 33, so tolerate its absence.
    unmatched: res.unmatched ? unmatchedOf(res.unmatched) : null,
  };
}

/** Normalized `set_class_info` — the engine's set-class determinations Audiology can
 *  consume instead of recomputing locally (Tonality brief-15/-16, response-15/-16).
 *  `dftMagnitudes`/`dftPhases` are |f1..f6| / arg(f1..f6); `consonanceF5` = |f5|;
 *  `chiralitySign` is the COMPLETE handedness (-1/0/+1, 0 iff achiral). */
export interface SetClassInfo {
  primeForm: number[];
  mask: number;
  dftMagnitudes: number[];
  dftPhases: number[];
  consonanceF5: number;
  generalChirality: number;
  chiralitySign: number;
  trichordChirality: number | null;
  source: "engine";
}

/** POST /call/set_class_info — set-class identity + DFT + chirality for a pc set.
 *  Throws on HTTP/engine error (caller falls back to local computation). */
export async function setClassInfo(baseUrl: string, pcs: number[], signal?: AbortSignal): Promise<SetClassInfo> {
  const r = (await callTool(baseUrl, "set_class_info", { pcs }, signal)) as {
    prime_form?: number[];
    mask?: number;
    dft_magnitudes?: number[];
    dft_phases?: number[];
    general_chirality?: number;
    chirality_sign?: number;
    trichord_chirality?: number | null;
  };
  const mags = Array.isArray(r.dft_magnitudes) ? r.dft_magnitudes : [];
  return {
    primeForm: Array.isArray(r.prime_form) ? r.prime_form : [],
    mask: r.mask ?? 0,
    dftMagnitudes: mags,
    dftPhases: Array.isArray(r.dft_phases) ? r.dft_phases : [],
    consonanceF5: mags[4] ?? 0,
    generalChirality: r.general_chirality ?? 0,
    chiralitySign: r.chirality_sign ?? 0,
    trichordChirality: r.trichord_chirality ?? null,
    source: "engine",
  };
}

/**
 * Analyze a whole MIDI file (raw bytes) via the engine. The bridge's
 * `midi_file_analysis` takes a server-side *path*, so this posts the bytes to
 * our same-origin Vite adapter (/__tonality/analyze_midi), which writes a temp
 * file and calls the bridge. `coalesceWindowBeats` (null = exact, else e.g. 0.5)
 * heals performed-timing micro-segmentation. Returns the raw `midi_file_analysis`
 * dict for `parseTonalityAnalysis`. Throws on HTTP/engine error.
 */
export interface AnalyzeOptions {
  /** Apply the relative-major/minor tie-breaker to the global + per-window keys. */
  disambiguateRelativeKeys?: boolean;
  /** Absorb short, low-confidence key-region blips (versioned hysteresis). */
  smoothKeyRegions?: boolean;
}

export async function analyzeMidi(
  midi: ArrayBuffer,
  coalesceWindowBeats: number | null,
  opts: AnalyzeOptions = {},
  signal?: AbortSignal
): Promise<unknown> {
  const p = new URLSearchParams();
  p.set("coalesce", coalesceWindowBeats != null ? String(coalesceWindowBeats) : "off");
  p.set("profile", TONALITY_PROFILE); // pin the key-profile prior (contract anchor)
  if (opts.disambiguateRelativeKeys) p.set("disambiguate", "1");
  if (opts.smoothKeyRegions) p.set("smooth", "1");
  const r = await fetch("/__tonality/analyze_midi?" + p.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: midi,
    signal,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => null);
    throw new Error(err?.error || "analyze_midi " + r.status);
  }
  return r.json();
}

/** A structural key-area from `structural_keys` — a home/modulation span with
 *  tonicizations already absorbed. Beat-extents; convert with Song.beatsToSeconds. */
export interface StructuralArea {
  startBeats: number;
  endBeats: number;
  tonicPc: number;
  mode: string;
}

/** A tonicization absorbed into a structural area — a brief pivot/excursion the
 *  engine flags but doesn't treat as a modulation. `degree` = scale degree in the
 *  parent key. Surfaced distinctly so breakouts are acknowledged, not just gated. */
export interface Tonicization {
  startBeats: number;
  endBeats: number;
  tonicPc: number;
  mode: string;
  /** Chromatic offset (semitones) from the parent area's tonic — for the roman. */
  degree: number;
  /** The parent area's mode — the framework the degree's roman is read against. */
  parentMode: string;
}

export interface StructuralResult {
  areas: StructuralArea[];
  tonicizations: Tonicization[];
  /** The structural reduction's overall key — its own whole-file induction, more
   *  reliable for "the song's key" than `midi_file_analysis`'s global (which the
   *  coalesce window can tip on near-ties, e.g. Bohemian's Bb↔Eb coin-flip). NB the
   *  frame-weighted `home_*` anchor is a different thing — it can absorb a divergent
   *  ending (Bohemian's Bb-minor outro), so it's not the right "overall key". */
  homeTonicPc?: number;
  homeMode?: string;
}

/**
 * POST /call/structural_keys — reduce the windowed local-key track to *structural
 * key-areas* (tonicizations absorbed): the clean key-band signal validated in the
 * corpus harness (response-7). Takes note events `[onset_beats, dur_beats, midi]`
 * (build from a `Song`); returns areas in beats. Throws on HTTP/engine error.
 */
export async function structuralKeys(
  baseUrl: string,
  events: number[][],
  opts: { windowBeats?: number; hopBeats?: number; disambiguateRelative?: boolean; smoothing?: boolean } = {},
  signal?: AbortSignal
): Promise<StructuralResult> {
  type RawTon = { start_beats: number; end_beats: number; tonic_pc: number; mode: string; degree: number };
  type RawArea = { start_beats: number; end_beats: number; tonic_pc: number; mode: string; tonicizations?: RawTon[] };
  const res = (await callTool(
    baseUrl,
    "structural_keys",
    {
      events,
      window_beats: opts.windowBeats ?? 8.0,
      hop_beats: opts.hopBeats ?? 2.0,
      profile_version: TONALITY_PROFILE, // pinned per the key-grain-alignment contract
      disambiguate_relative: opts.disambiguateRelative ?? false,
      smoothing: opts.smoothing ?? false,
    },
    signal
  )) as { areas?: RawArea[]; global_tonic_pc?: number; global_mode?: string };
  const raw = res.areas ?? [];
  return {
    homeTonicPc: res.global_tonic_pc,
    homeMode: res.global_mode,
    areas: raw.map((a) => ({ startBeats: a.start_beats, endBeats: a.end_beats, tonicPc: a.tonic_pc, mode: a.mode })),
    tonicizations: raw.flatMap((a) =>
      (a.tonicizations ?? []).map((t) => ({
        startBeats: t.start_beats,
        endBeats: t.end_beats,
        tonicPc: t.tonic_pc,
        mode: t.mode,
        degree: t.degree,
        parentMode: a.mode,
      }))
    ),
  };
}

/**
 * Map Audiology's scale name to a Tonality scale name for the naming key context.
 * Returns undefined for scales without a confident mapping — the bridge then
 * names with tonic-only context (no functional roles) rather than erroring.
 */
const SCALE_TO_ENGINE: Partial<Record<ScaleName, string>> = {
  Major: "Ionian",
  Minor: "Aeolian",
  Dorian: "Dorian",
  Phrygian: "Phrygian",
  Lydian: "Lydian",
  Mixolydian: "Mixolydian",
  Locrian: "Locrian",
  "Harmonic Minor": "Harmonic Minor",
  "Melodic Minor": "Melodic Minor",
};

export function scaleToEngineKey(scale: ScaleName): string | undefined {
  return SCALE_TO_ENGINE[scale];
}
