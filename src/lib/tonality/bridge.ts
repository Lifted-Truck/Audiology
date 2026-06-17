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

export interface NamingReading {
  rootPc: number;
  quality: string;
  aliases: string[];
  /** Functional role in the key context, e.g. "tonic" / "dominant" (or null). */
  functionalRole: string | null;
  score: number;
}

export interface ChordNaming {
  chosen: NamingReading | null;
  alternatives: NamingReading[];
  isAmbiguous: boolean;
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
  )) as { chosen?: RawReading; alternatives?: RawReading[]; is_ambiguous?: boolean };
  return {
    chosen: res.chosen ? readingOf(res.chosen) : null,
    alternatives: Array.isArray(res.alternatives) ? res.alternatives.map(readingOf) : [],
    isAmbiguous: res.is_ambiguous === true,
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
      disambiguate_relative: opts.disambiguateRelative ?? false,
      smoothing: opts.smoothing ?? false,
    },
    signal
  )) as { areas?: RawArea[] };
  const raw = res.areas ?? [];
  return {
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
