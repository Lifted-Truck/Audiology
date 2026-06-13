// Client for the local Tonality HTTP bridge (scripts/tonality-serve.py) — the
// "web door" for live, engine-backed chord naming. Same data-contract boundary
// idea as parse.ts: this module owns the wire format; the app consumes the
// normalized `ChordNaming`. When Tonality ships its official bridge, only the
// base URL changes. Imports no React.

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

/** GET /health — true if the bridge is up. Never throws. */
export async function probeBridge(baseUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const r = await fetch(baseUrl + "/health", { signal });
    if (!r.ok) return false;
    const j = await r.json();
    return j?.ok === true;
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

/** POST /name_pcs — exhaustive, context-aware chord naming. Throws on HTTP/engine error. */
export async function nameChord(baseUrl: string, input: NameChordInput, signal?: AbortSignal): Promise<ChordNaming> {
  const r = await fetch(baseUrl + "/name_pcs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      pcs: input.pcs,
      tonic: input.tonic,
      key_name: input.keyName,
      realization_midi: input.realizationMidi,
    }),
  });
  if (!r.ok) throw new Error("bridge /name_pcs " + r.status);
  const res = await r.json();
  return {
    chosen: res.chosen ? readingOf(res.chosen) : null,
    alternatives: Array.isArray(res.alternatives) ? res.alternatives.map(readingOf) : [],
    isAmbiguous: res.is_ambiguous === true,
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
