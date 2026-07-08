// Pitch-class-set set-theory: the analysis behind the pc-set / custom-scale lab.
// React-free and unit-testable. Identity maths (interval vector, DFT, colour,
// chirality) is reused from chord-anatomy.ts; this module adds the set-class
// operations a scale/pc-set editor needs — normal order, prime form (inversion-
// reduced), transpositional + inversional symmetry, complement, modes, and the
// catalog matches (which named scales/chords this set IS, or sits inside).

import { mod } from "./pitch";
import { SCALES, QUALITIES } from "./constants";
import type { ScaleName, QualityKey } from "./constants";

/** Dedupe + fold to pitch classes 0..11, ascending. */
export function normalize(pcs: number[]): number[] {
  return [...new Set(pcs.map((p) => mod(p, 12)))].sort((a, b) => a - b);
}

const setEq = (a: Set<number>, b: Set<number>): boolean => a.size === b.size && [...a].every((x) => b.has(x));

/** Intervals from the first element of a rotation, ascending with wrap (starts at 0). */
function packVec(rot: number[]): number[] {
  return rot.map((x) => mod(x - rot[0], 12));
}

/** All n rotations of a sorted pc-set (each an n-length pc sequence, wrapping). */
function rotations(u: number[]): number[][] {
  const n = u.length;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, i) => u[(r + i) % n]));
}

/** Straus "more compact" test: smaller span first, then packed from the outside
 *  in; final tie → lower starting pc. */
function compactLess(a: number[], b: number[]): boolean {
  const pa = packVec(a);
  const pb = packVec(b);
  for (let i = pa.length - 1; i >= 1; i--) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i];
  }
  return a[0] < b[0];
}

/** Normal order (Straus): the most compact rotation, as actual pitch classes. */
export function normalOrder(pcs: number[]): number[] {
  const u = normalize(pcs);
  if (u.length <= 1) return u;
  let best = rotations(u)[0];
  for (const rot of rotations(u)) if (compactLess(rot, best)) best = rot;
  return best;
}

const lexLess = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i];
  return a.length < b.length;
};

/**
 * Prime form (inversion-reduced, transposed to start at 0): the more left-packed
 * of the set's normal order and its inversion's normal order. Local fallback for
 * the engine's authoritative Rahn `prime_form` — the two agree on the whole
 * musical vocabulary; a handful of exotic set classes can tie-break differently,
 * so prefer the engine's when connected.
 */
export function primeFormLocal(pcs: number[]): number[] {
  const u = normalize(pcs);
  if (!u.length) return [];
  const noSet = packVec(normalOrder(u));
  const noInv = packVec(normalOrder(u.map((p) => mod(-p, 12))));
  return lexLess(noInv, noSet) ? noInv : noSet;
}

/**
 * Transpositional symmetry: how many transpositions (including T0) map the set to
 * itself, and the smallest nonzero period. Whole-tone → {degree 6, period 2};
 * aug → {3, 4}; dim7 → {4, 3}; an asymmetric set → {1, null}.
 */
export function transpositionalSymmetry(pcs: number[]): { degree: number; period: number | null } {
  const u = normalize(pcs);
  const s = new Set(u);
  let degree = 0;
  let period: number | null = null;
  for (let t = 0; t < 12; t++) {
    if (u.every((p) => s.has(mod(p + t, 12)))) {
      degree++;
      if (t > 0 && period === null) period = t;
    }
  }
  return { degree, period };
}

/**
 * Inversional symmetry: the number of reflection axes (inversions x → n − x that
 * map the set to itself), 0..cardinality. 0 = chiral (no mirror symmetry); ≥1 =
 * the set equals its own mirror about that many axes.
 */
export function inversionalAxes(pcs: number[]): number {
  const u = normalize(pcs);
  const s = new Set(u);
  let axes = 0;
  for (let n = 0; n < 12; n++) if (u.every((p) => s.has(mod(n - p, 12)))) axes++;
  return axes;
}

/** The pitch classes NOT in the set (its complement within the 12). */
export function complement(pcs: number[]): number[] {
  const s = new Set(normalize(pcs));
  const out: number[] = [];
  for (let p = 0; p < 12; p++) if (!s.has(p)) out.push(p);
  return out;
}

/** Invert the set about an axis pc (default 0): each p → axis − p. */
export function invert(pcs: number[], axis = 0): number[] {
  return normalize(pcs.map((p) => mod(axis - p, 12)));
}

/** Transpose the set by t semitones. */
export function transpose(pcs: number[], t: number): number[] {
  return normalize(pcs.map((p) => mod(p + t, 12)));
}

export interface NameMatch {
  kind: "scale" | "chord";
  name: string;
  rootPc: number;
  /** Scales in the catalog are the Push-3-available set; chords aren't scales. */
  pushAvailable: boolean;
  /** The catalog key, so the caller can apply a scale match to the explorer. */
  scaleKey?: ScaleName;
}

/**
 * Which named scales / chords this set IS, up to transposition (exact set
 * equality). Scale matches carry `scaleKey` + `pushAvailable` (our scale catalog
 * = the Push-3-available scales). Chord matches are the plain triad/seventh
 * catalog. Sorted scales-first, then by root.
 */
export function exactNames(pcs: number[]): NameMatch[] {
  const target = new Set(normalize(pcs));
  const size = target.size;
  const out: NameMatch[] = [];
  if (size === 0) return out;
  for (const scale of Object.keys(SCALES) as ScaleName[]) {
    if (SCALES[scale].length !== size) continue;
    for (let root = 0; root < 12; root++) {
      if (setEq(new Set(SCALES[scale].map((i) => mod(root + i, 12))), target))
        out.push({ kind: "scale", name: scale, rootPc: root, pushAvailable: true, scaleKey: scale });
    }
  }
  for (const q of Object.keys(QUALITIES) as QualityKey[]) {
    const distinct = new Set(QUALITIES[q].iv.map((i) => mod(i, 12)));
    if (distinct.size !== size) continue;
    for (let root = 0; root < 12; root++) {
      if (setEq(new Set([...distinct].map((i) => mod(root + i, 12))), target))
        out.push({ kind: "chord", name: QUALITIES[q].l, rootPc: root, pushAvailable: false });
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.rootPc - b.rootPc : a.kind === "scale" ? -1 : 1));
}

export interface ModeInfo {
  /** 1-based degree of the parent set this mode starts on. */
  degree: number;
  rootPc: number;
  /** Intervals from this mode's root (starts at 0). */
  intervals: number[];
  /** The named scale with exactly these intervals, if any. */
  name: ScaleName | null;
}

const scaleByIntervals = (intervals: number[]): ScaleName | null => {
  const key = intervals.join(",");
  for (const s of Object.keys(SCALES) as ScaleName[]) if (SCALES[s].join(",") === key) return s;
  return null;
};

/** The rotational modes of the set — each degree taken as the root, with the
 *  interval pattern from there, named where it matches a catalog scale. */
export function modesOf(pcs: number[]): ModeInfo[] {
  const u = normalize(pcs);
  const n = u.length;
  return Array.from({ length: n }, (_, r) => {
    const rootPc = u[r];
    const intervals = Array.from({ length: n }, (_, i) => mod(u[(r + i) % n] - rootPc, 12));
    return { degree: r + 1, rootPc, intervals, name: scaleByIntervals(intervals) };
  });
}
