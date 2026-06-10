// Scale detection: given a set of MIDI notes (e.g. every note in a MIDI file),
// decide whether they fit a chosen scale and find every root+scale they fit
// into. Pure; imports no React.

import { SCALES } from "./constants";
import type { ScaleName } from "./constants";
import { mod } from "./pitch";

export interface ScaleMatch {
  /** Root pitch class, 0..11. */
  root: number;
  scale: ScaleName;
  /** Number of notes in the scale. */
  size: number;
  /** scale.size − distinct pitch classes used (0 = a perfect, exact fit). */
  extra: number;
  /** Whether the scale's pitch classes are exactly the input set. */
  exact: boolean;
}

/** Distinct pitch classes (0..11) present in a set of MIDI notes, ascending. */
export function pitchClassesOf(midis: number[]): number[] {
  return Array.from(new Set(midis.map((m) => mod(m, 12)))).sort((a, b) => a - b);
}

/** The pitch-class set of `scale` rooted at `root`. */
export function scalePitchClasses(root: number, scale: ScaleName): number[] {
  return SCALES[scale].map((i) => mod(root + i, 12));
}

/** Whether every pitch class in `pcs` lies within root+scale. */
export function pcsFitScale(pcs: number[], root: number, scale: ScaleName): boolean {
  const set = new Set(scalePitchClasses(root, scale));
  return pcs.every((pc) => set.has(pc));
}

/** The pitch classes in `pcs` that fall OUTSIDE root+scale. */
export function outOfScale(pcs: number[], root: number, scale: ScaleName): number[] {
  const set = new Set(scalePitchClasses(root, scale));
  return pcs.filter((pc) => !set.has(pc));
}

export interface DetectOptions {
  /** Include the all-12 Chromatic scale, which trivially fits everything. Default false. */
  includeChromatic?: boolean;
}

/**
 * Every root+scale combination whose pitch classes fully contain `pcs`,
 * ordered tightest-first (fewest extra notes), then by root, then by name.
 * A diatonic input legitimately matches all of its relative modes.
 */
export function scalesContaining(pcs: number[], opts: DetectOptions = {}): ScaleMatch[] {
  if (pcs.length === 0) return [];
  const out: ScaleMatch[] = [];
  for (const scale of Object.keys(SCALES) as ScaleName[]) {
    if (scale === "Chromatic" && !opts.includeChromatic) continue;
    const size = SCALES[scale].length;
    if (size < pcs.length) continue; // can't contain more distinct notes than it has
    for (let root = 0; root < 12; root++) {
      if (pcsFitScale(pcs, root, scale)) {
        out.push({ root, scale, size, extra: size - pcs.length, exact: size === pcs.length });
      }
    }
  }
  out.sort((a, b) => a.extra - b.extra || a.root - b.root || a.scale.localeCompare(b.scale));
  return out;
}
