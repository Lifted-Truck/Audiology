// Pure chord-anatomy math: the representations behind the Chord Anatomy view.
// React-free and unit-testable. Everything here is derived from a pitch-class set
// (and, where voicing matters, the sounding MIDI notes). The same mathematics is
// documented for the engine in Tonality's integrations/audiology/brief-15.md so
// other systems can compute these surfaces too.
//
// Two families:
//   * "Identity" — inversion-invariant: interval vector, DFT magnitudes, the
//     interval-content colour, set-class bitmask.
//   * "Realization" — voicing-sensitive: stacked intervals, register → brightness,
//     the root-aware (circle-of-fifths) colour's hue.

const TAU = Math.PI * 2;

/** Dedupe + fold any int array to pitch classes 0..11. */
function toPcs(pcs: number[]): number[] {
  return [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ----- interval vector ---------------------------------------------------------

export type IntervalVector = [number, number, number, number, number, number];

/** Counts of each interval class (ic1=m2/M7 … ic6=tritone). Inversion-invariant. */
export function intervalVector(pcs: number[]): IntervalVector {
  const u = toPcs(pcs);
  const v: IntervalVector = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < u.length; i++) {
    for (let j = i + 1; j < u.length; j++) {
      let d = Math.abs(u[i] - u[j]) % 12;
      d = Math.min(d, 12 - d);
      if (d >= 1) v[d - 1]++;
    }
  }
  return v;
}

/** The five inversion-paired interval classes (ic1..ic5); ic6 is the self-paired tritone. */
export const IC_PAIR_LABELS = ["m2·M7", "M2·m7", "m3·M6", "M3·m6", "P4·P5", "TT"] as const;

// ----- discrete Fourier transform (Quinn / Amiot / Tymoczko / Yust) ------------

export interface DftComponent {
  re: number;
  im: number;
  /** |f_k| — transposition- AND inversion-invariant "harmonic quality" weight. */
  mag: number;
  /** arg(f_k) — rotates under transposition, negates under inversion. */
  phase: number;
}

/** f_k = Σ_{p∈set} e^(-2πi k p/12) for k=0..6. f0 = cardinality. */
export function dft(pcs: number[]): DftComponent[] {
  const u = toPcs(pcs);
  const out: DftComponent[] = [];
  for (let k = 0; k <= 6; k++) {
    let re = 0,
      im = 0;
    for (const p of u) {
      const th = (TAU * k * p) / 12;
      re += Math.cos(th);
      im += -Math.sin(th);
    }
    out.push({ re, im, mag: Math.hypot(re, im), phase: Math.atan2(im, re) });
  }
  return out;
}

// ----- somatic colour ----------------------------------------------------------

export interface ChordColor {
  hue: number; // 0..360
  chroma: number; // oklch chroma
  lightness: number; // oklch L, 0..1
  /** Resultant length 0..1 — "how pure / concentrated" the colour is. */
  focus: number;
  css: string; // oklch(...) string
}

// Decompress the crowded grey centre: most chords have balanced content and cluster
// near focus 0, so a sub-linear stretch spreads them out perceptually (see the
// reachable-domain finding in README's Chord interval-content view entry).
const stretch = (f: number) => Math.pow(clamp(f, 0, 1), 0.6);

const cofPos = (pc: number) => ((pc * 7) % 12 + 12) % 12;

/** Register → perceptually-uniform OKLCH lightness (mean MIDI pitch, clamped). */
function lightnessFromRealization(realizationMidi?: number[]): number {
  if (!realizationMidi || !realizationMidi.length) return 0.62;
  const avg = realizationMidi.reduce((a, b) => a + b, 0) / realizationMidi.length;
  return clamp(0.4 + ((avg - 48) / (84 - 48)) * 0.4, 0.34, 0.82);
}

/**
 * Build the root-aware colour from an already-computed hue (deg) + focus (0..1) —
 * the shared tail of `tonalColor` and the engine-consume path (hue = arg f5,
 * focus = |f5|/cardinality, both from `set_class_info`'s DFT). Register → lightness.
 */
export function tonalColorFrom(hue: number, focus: number, realizationMidi?: number[]): ChordColor {
  const h = ((hue % 360) + 360) % 360;
  const L = lightnessFromRealization(realizationMidi);
  const chroma = stretch(focus) * 0.16;
  return { hue: h, chroma, lightness: L, focus, css: `oklch(${L.toFixed(3)} ${chroma.toFixed(3)} ${Math.round(h)})` };
}

/**
 * Root-aware colour: each pitch class is a hue on the circle of fifths, the chord
 * colour is their resultant (circular mean) — hue = arg(f5), focus = |f5|/n. Hue =
 * which way the chord points, focus = saturation. Register → perceptually-uniform
 * OKLCH lightness (not HSL L). Transposition rotates the hue; symmetric chords cancel
 * to grey. The engine's `dft_phases[4]`/`dft_magnitudes[4]` are the same arg f5 / |f5|.
 */
export function tonalColor(pcs: number[], realizationMidi?: number[]): ChordColor {
  const u = toPcs(pcs);
  if (!u.length) return { hue: 0, chroma: 0, lightness: 0.6, focus: 0, css: "oklch(0.6 0 0)" };
  let sx = 0,
    sy = 0;
  for (const pc of u) {
    const a = (cofPos(pc) * TAU) / 12;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  let hue = (Math.atan2(sy, sx) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  const focus = Math.hypot(sx, sy) / u.length;
  return tonalColorFrom(hue, focus, realizationMidi);
}

const icAng = (k: number) => ((-90 + k * 72) * Math.PI) / 180; // k=0..4 on the rim

/**
 * Build the root-blind colour from an interval vector — the shared tail of
 * `intervalColor` and the engine-consume path (the vector recovered from the
 * engine's DFT magnitudes via `intervalVectorFromMagnitudes`). Rim = the five
 * inversion-paired interval classes; the tritone (self-inverse) pulls toward grey.
 */
export function intervalColorFromVector(v: IntervalVector): ChordColor {
  const tot = v.reduce((a, b) => a + b, 0);
  if (!tot) return { hue: 0, chroma: 0, lightness: 0.62, focus: 0, css: "oklch(0.62 0 0)" };
  let ux = 0,
    uy = 0;
  for (let k = 0; k < 5; k++) {
    ux += v[k] * Math.cos(icAng(k));
    uy += v[k] * Math.sin(icAng(k));
  }
  const nx = ux / tot,
    ny = uy / tot,
    focus = Math.hypot(nx, ny);
  let hue = ((Math.atan2(ny, nx) * 180) / Math.PI + 90) % 360;
  if (hue < 0) hue += 360;
  const chroma = stretch(focus) * 0.19;
  return { hue, chroma, lightness: 0.63, focus, css: `oklch(0.63 ${chroma.toFixed(3)} ${Math.round(hue)})` };
}

/**
 * Root-blind colour: transposition-invariant — inversional pairs (maj=min) share a
 * colour. See `intervalColorFromVector`.
 */
export function intervalColor(pcs: number[]): ChordColor {
  return intervalColorFromVector(intervalVector(pcs));
}

/**
 * Recover the interval-class vector from the DFT magnitudes |f_1..f_6| + cardinality —
 * exact (verified over all 4096 pc-sets; worst rounding residual ~5e-15). Lets the
 * interval content come straight from the engine's `set_class_info` (which returns the
 * DFT magnitudes but NOT the vector). Inverse of |f_k|² = Σ_m IFUNC(m)·e^(−2πikm/12):
 * rebuild the full 12-pt |f|² spectrum (|f_0| = N, |f_{12−k}| = |f_k|), inverse-DFT to
 * the real interval function IFUNC, then icv[d] = IFUNC(d) for d=1..5 and
 * icv[6] = IFUNC(6)/2 (the tritone is self-paired, so it's double-counted).
 */
export function intervalVectorFromMagnitudes(mags: number[], cardinality: number): IntervalVector {
  const P = new Array<number>(12);
  P[0] = cardinality * cardinality;
  for (let k = 1; k <= 6; k++) P[k] = (mags[k - 1] ?? 0) ** 2;
  for (let k = 7; k <= 11; k++) P[k] = P[12 - k];
  const v: IntervalVector = [0, 0, 0, 0, 0, 0];
  for (let m = 1; m <= 6; m++) {
    let s = 0;
    for (let k = 0; k < 12; k++) s += P[k] * Math.cos((TAU * k * m) / 12);
    const ifunc = s / 12;
    v[m - 1] = Math.round(m === 6 ? ifunc / 2 : ifunc);
  }
  return v;
}

/** The hue of each interval-class rim node, for legends/wheels. */
export const IC_HUES = [0, 72, 144, 216, 288];
/** Angle (radians) of interval class k (0..4) on the interval-content wheel rim. */
export function icRimAngle(k: number): number {
  return icAng(k);
}

// ----- stacked intervals (voicing-sensitive) -----------------------------------

const STEP: Record<number, string> = {
  1: "m2", 2: "M2", 3: "m3", 4: "M3", 5: "P4", 6: "TT",
  7: "P5", 8: "m6", 9: "M6", 10: "m7", 11: "M7", 12: "P8",
};

export interface StackedInterval {
  semitones: number;
  name: string;
}

/** Adjacent intervals up a sorted voicing — the "ladder" that rotates under inversion. */
export function stackedIntervals(midis: number[]): StackedInterval[] {
  const s = [...midis].sort((a, b) => a - b);
  const out: StackedInterval[] = [];
  for (let i = 1; i < s.length; i++) {
    const d = s[i] - s[i - 1];
    let name: string;
    if (d <= 12) name = STEP[d] ?? `${d}st`;
    else {
      const r = d % 12;
      name = (STEP[r === 0 ? 12 : r] ?? `${r}st`) + `+${Math.floor(d / 12)}8ve`;
    }
    out.push({ semitones: d, name });
  }
  return out;
}

/** Pitch classes as semitone heights above the root (root → 0), sorted ascending.
 *  Root = `rootPc` if given (and folded into 0..11), else the lowest pitch class. */
export function stackAboveRoot(pcs: number[], rootPc: number | null): number[] {
  const u = [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))];
  if (!u.length) return [];
  const root = rootPc != null ? ((rootPc % 12) + 12) % 12 : Math.min(...u);
  return u.map((p) => ((p - root) % 12 + 12) % 12).sort((a, b) => a - b);
}

const SHORT_IVL: Record<number, string> = {
  0: "P1", 1: "m2", 2: "M2", 3: "m3", 4: "M3", 5: "P4", 6: "TT",
  7: "P5", 8: "m6", 9: "M6", 10: "m7", 11: "M7", 12: "P8",
};
/** Short interval name for a semitone count (compounds fold to the simple name). */
export function intervalShortName(semitones: number): string {
  const s = ((semitones % 12) + 12) % 12;
  return SHORT_IVL[s === 0 && semitones !== 0 ? 12 : s] ?? `${semitones}`;
}
/** Interval class (1..6) of a semitone count — the inversion-folded distance. */
export function intervalClassOf(semitones: number): number {
  const d = ((semitones % 12) + 12) % 12;
  return Math.min(d, 12 - d);
}

// ----- harmony map: consonance × chirality (Tymoczko trichord geometry) ---------

/** The step-gaps of a chord around the octave (sum = 12). Needs ≥2 distinct pcs. */
export function stepGaps(pcs: number[]): number[] | null {
  const u = toPcs(pcs).sort((a, b) => a - b);
  if (u.length < 2) return null;
  const g: number[] = [];
  for (let i = 1; i < u.length; i++) g.push(u[i] - u[i - 1]);
  g.push(12 - u[u.length - 1] + u[0]);
  return g;
}

/**
 * Exact trichord handedness: (a−b)(b−c)(c−a) on the three step-gaps. Rotation-
 * invariant; flips sign under inversion (major −, minor +); 0 for symmetric chords.
 * Trichord-native (null otherwise) — the elegant special case behind the general
 * `chirality` below, kept for teaching/derivation.
 */
export function stepGapChirality(pcs: number[]): number | null {
  const g = stepGaps(pcs);
  if (!g || g.length !== 3) return null;
  return (g[0] - g[1]) * (g[1] - g[2]) * (g[2] - g[0]);
}

/**
 * General chirality (any cardinality) via the lowest-order **bispectrum** slice
 * `Im(f1·f2·conj(f3))` — the canonical shift-invariant phase descriptor. It is
 * transposition-invariant and inversion-ODD (a chord and its mirror get ±), so it
 * is **0 for every inversionally-symmetric chord** and opposite for mirror pairs;
 * major < 0, minor > 0, matching the trichord convention on triads. It also
 * separates pairs the f3/f5 phase misses (dom7 ↔ m7♭5). This is the harmony map's
 * x-axis — works for all n, not just trichords.
 *
 * Caveat (verified by enumeration): clean over the whole chord vocabulary and all
 * 168 chiral trichords, but a *single* bispectrum slice still false-zeros on 28
 * exotic 5–7-note set classes (none musical). The complete signed invariant — the
 * full bispectrum, not one slice — is Tonality's open problem (see brief-15). It is
 * NOT identical to `stepGapChirality` (they diverge on ~29% of trichords); both are
 * legitimate handedness measures, this one generalizes.
 */
export function chirality(pcs: number[]): number {
  const F = dft(pcs);
  const f1 = F[1],
    f2 = F[2],
    f3 = F[3];
  const re12 = f1.re * f2.re - f1.im * f2.im;
  const im12 = f1.re * f2.im + f1.im * f2.re;
  return im12 * f3.re - re12 * f3.im; // Im((f1·f2)·conj(f3))
}

/** Consonance axis: perfect-fifth content |f5|. High for triads/sus, 0 for aug/whole-tone. */
export function consonanceF5(pcs: number[]): number {
  return dft(pcs)[5].mag;
}

/**
 * Global maxima over **all** pc-sets (by exhaustive enumeration of the 4096 subsets) —
 * fixed bounds for the harmony map so its axes encompass every possible chord and never
 * rescale or clamp. `chirality` peaks at 8.196 (e.g. {0,1,4,5,10,11}, far past the 2.366
 * trichord max); `|f5|` peaks at 3.864 (e.g. {1,3,5,6,8,10}).
 */
export const MAX_CHIRALITY = 8.196;
export const MAX_CONSONANCE_F5 = 3.864;

/** A point on the harmony map. */
export interface HarmonyPoint {
  x: number; // chirality (bispectrum handedness)
  y: number; // consonance |f5|
}
export function harmonyPoint(pcs: number[]): HarmonyPoint {
  return { x: chirality(pcs), y: consonanceF5(pcs) };
}

/**
 * The full trichord landscape (every 3-note set-class, both orientations), as the
 * backdrop for the harmony map. Deduped by (consonance, chirality). Computed once.
 */
export interface TrichordType {
  chirality: number;
  consonance: number;
  intervalCss: string;
  name: string;
}
function nameTrichord(gapsSorted: number[], ch: number): string {
  const a = [...gapsSorted].sort((x, y) => x - y).join(",");
  const achiral: Record<string, string> = {
    "4,4,4": "aug", "3,3,6": "dim", "2,5,5": "sus", "2,2,8": "(0 2 4)", "1,1,10": "cluster",
  };
  if (achiral[a]) return achiral[a];
  const chiral: Record<string, [string, string]> = {
    "3,4,5": ["maj", "min"],
    "2,3,7": ["(0 2 5)", "(0 3 5)"],
    "2,4,6": ["(0 2 6)", "(0 4 6)"],
    "1,5,6": ["(0 1 6)", "(0 5 6)"],
    "1,4,7": ["(0 1 5)", "(0 4 5)"],
    "1,3,8": ["(0 1 4)", "(0 3 4)"],
    "1,2,9": ["(0 1 3)", "(0 2 3)"],
  };
  if (chiral[a]) return ch < 0 ? chiral[a][0] : chiral[a][1];
  return "(" + a.replace(/,/g, " ") + ")"; // never empty — fallback to the gap signature
}
let _landscape: TrichordType[] | null = null;
export function trichordLandscape(): TrichordType[] {
  if (_landscape) return _landscape;
  const seen = new Map<string, TrichordType>();
  for (let a = 0; a < 12; a++) {
    for (let b = a + 1; b < 12; b++) {
      for (let c = b + 1; c < 12; c++) {
        const set = [a, b, c];
        const g = stepGaps(set)!;
        const ch = chirality(set); // general bispectrum handedness (same axis as any chord)
        const cons = consonanceF5(set);
        const key = cons.toFixed(3) + "|" + ch.toFixed(3);
        if (!seen.has(key))
          seen.set(key, { chirality: ch, consonance: cons, intervalCss: intervalColor(set).css, name: nameTrichord(g, ch) });
      }
    }
  }
  _landscape = [...seen.values()];
  return _landscape;
}

// ----- set-class identity ------------------------------------------------------

/** 12-bit pitch-class bitmask (bit p set ⇔ pc p present). */
export function pcBitmask(pcs: number[]): number {
  let m = 0;
  for (const p of toPcs(pcs)) m |= 1 << p;
  return m;
}

/** Normal-ish prime form: the most compact rotation, transposed to start at 0. */
export function primeForm(pcs: number[]): number[] {
  const u = toPcs(pcs).sort((a, b) => a - b);
  if (!u.length) return [];
  let best: number[] | null = null;
  for (let r = 0; r < u.length; r++) {
    const rot = u.map((_, i) => ((u[(r + i) % u.length] - u[r]) % 12 + 12) % 12).sort((a, b) => a - b);
    const span = rot[rot.length - 1];
    if (!best) best = rot;
    else {
      const bestSpan = best[best.length - 1];
      if (span < bestSpan) best = rot;
      else if (span === bestSpan) {
        for (let i = rot.length - 1; i >= 0; i--) {
          if (rot[i] < best[i]) { best = rot; break; }
          if (rot[i] > best[i]) break;
        }
      }
    }
  }
  return best ?? u;
}
