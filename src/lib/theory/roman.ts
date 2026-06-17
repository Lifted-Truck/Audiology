// Roman-numeral analysis (pure, React-free). Renders a chord's function relative
// to a key — scale-degree numeral + accidental, case + symbol from the chord
// quality. Explicit per-mode chromatic→degree tables (no modular-wrap surprises),
// plus the common minor-key leading-tone (vii°) convention. A display aid, not a
// voice-leading-aware analysis: applied-dominant ("V/V") notation would need the
// engine's functional context and is a deeper follow-on.

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

// chromatic degree (0–11 from tonic) → [arabic degree 1–7, accidental].
// Major: diatonic 1 2 3 4 5 6 7; chromatic ♭2 ♭3 ♯4 ♭6 ♭7.
const MAJOR: [number, string][] = [
  [1, ""], [2, "♭"], [2, ""], [3, "♭"], [3, ""], [4, ""],
  [4, "♯"], [5, ""], [6, "♭"], [6, ""], [7, "♭"], [7, ""],
];
// Natural minor: diatonic 1 2 ♭3 4 5 ♭6 ♭7 (shown 1 2 3 4 5 6 7 in the minor
// frame); chromatic ♭2, ♯3, ♯4, ♯6, ♯7 (raised 7 = the leading tone).
const MINOR: [number, string][] = [
  [1, ""], [2, "♭"], [2, ""], [3, ""], [3, "♯"], [4, ""],
  [4, "♯"], [5, ""], [6, ""], [6, "♯"], [7, ""], [7, "♯"],
];

const degreeOf = (rootPc: number, tonicPc: number, mode: string): [number, string] =>
  (mode === "minor" ? MINOR : MAJOR)[((rootPc - tonicPc) % 12 + 12) % 12];

// Engine quality string → { lower-case the numeral?, roman suffix }.
const ROMAN_QUALITY: Record<string, { lower?: boolean; suffix?: string }> = {
  maj: {}, major: {}, M: {}, "": {},
  min: { lower: true }, minor: { lower: true }, m: { lower: true },
  dim: { lower: true, suffix: "°" }, diminished: { lower: true, suffix: "°" },
  aug: { suffix: "+" }, augmented: { suffix: "+" },
  dom7: { suffix: "7" }, "7": { suffix: "7" },
  maj7: { suffix: "maj7" },
  min7: { lower: true, suffix: "7" }, m7: { lower: true, suffix: "7" },
  m7b5: { lower: true, suffix: "ø7" }, dim7: { lower: true, suffix: "°7" },
  sus2: { suffix: "sus2" }, sus4: { suffix: "sus4" },
  maj6: { suffix: "6" }, "6": { suffix: "6" }, min6: { lower: true, suffix: "6" }, m6: { lower: true, suffix: "6" },
};

const isDiminished = (q: string): boolean => q === "dim" || q === "diminished" || q === "dim7" || q === "m7b5";

/** A chord's Roman numeral in a key, e.g. (D, min7) in C major → "ii7". */
export function chordRoman(rootPc: number, quality: string, keyTonicPc: number, keyMode: string): string {
  const [arabic, accidental] = degreeOf(rootPc, keyTonicPc, keyMode);
  const q = ROMAN_QUALITY[quality] ?? { lower: /^(m|min|dim|halfdim)/.test(quality) };
  // Minor-key leading-tone convention: a diminished chord on the raised 7th is
  // "vii°", not "♯vii°" — the raised 7 is implied by the minor context.
  const acc = keyMode === "minor" && arabic === 7 && accidental === "♯" && isDiminished(quality) ? "" : accidental;
  const numeral = q.lower ? ROMAN[arabic - 1].toLowerCase() : ROMAN[arabic - 1];
  return acc + numeral + (q.suffix ?? "");
}

/** A tonicized key's Roman numeral relative to its parent key — `degree` is the
 *  chromatic offset (parent→target tonic); case from the target's mode. */
export function keyRoman(degree: number, parentMode: string, targetMode: string): string {
  const [arabic, accidental] = (parentMode === "minor" ? MINOR : MAJOR)[((degree % 12) + 12) % 12];
  const numeral = targetMode === "minor" ? ROMAN[arabic - 1].toLowerCase() : ROMAN[arabic - 1];
  return accidental + numeral;
}

/** Whether a roman numeral is dominant-class (a V/V7 or a leading-tone vii°/viiø)
 *  — i.e. the kind of chord that, inside a tonicization, becomes an applied chord
 *  ("V7/vi"). Used to tag secondary dominants relative to a tonicized key. */
export function isDominantRoman(roman: string): boolean {
  return roman === "V" || roman === "V7" || /^vii[°ø]/.test(roman);
}

/** A single note's scale degree in a key as an arabic numeral, e.g. "5", "♭7" —
 *  for melodic (non-chord) segments in roman mode, so they read consistently. */
export function scaleDegreeLabel(pc: number, keyTonicPc: number, keyMode: string): string {
  const [arabic, accidental] = degreeOf(pc, keyTonicPc, keyMode);
  return accidental + arabic;
}
