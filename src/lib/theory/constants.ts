// Pure data: note names, scales, chord qualities, degree labels, and the
// interval-set -> chord-suffix lookup used by the analyzer. No React, no logic.

import type { Quality } from "./types";

export const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export const FLAT_KEYS = [5, 10, 3, 8, 1, 6]; // F Bb Eb Ab Db Gb

// Whether a given key's signature is flat-side — so a label can be spelled in
// its *own* key (Tonality's Bb-major region reads "Bb maj", not "A# maj"),
// independent of whatever root the user currently has selected.
const FLAT_MAJOR_TONICS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb
const FLAT_MINOR_TONICS = new Set([0, 2, 3, 5, 7, 10]); // Cm Dm Ebm Fm Gm Bbm
export function keyUsesFlats(tonicPc: number, mode: string): boolean {
  return mode === "minor" ? FLAT_MINOR_TONICS.has(tonicPc) : FLAT_MAJOR_TONICS.has(tonicPc);
}
/** Spell a pitch class in a key context (flats for flat keys, else sharps). */
export function spellInKey(pc: number, tonicPc: number, mode: string): string {
  return (keyUsesFlats(tonicPc, mode) ? FLAT : SHARP)[pc];
}

export const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  "Melodic Minor": [0, 2, 3, 5, 7, 9, 11],
  "Major Pentatonic": [0, 2, 4, 7, 9],
  "Minor Pentatonic": [0, 3, 5, 7, 10],
  "Minor Blues": [0, 3, 5, 6, 7, 10],
  "Major Blues": [0, 2, 3, 4, 7, 9],
  "Whole Tone": [0, 2, 4, 6, 8, 10],
  "Half-Whole Dim": [0, 1, 3, 4, 6, 7, 9, 10],
  "Whole-Half Dim": [0, 2, 3, 5, 6, 8, 9, 11],
  "Super Locrian": [0, 1, 3, 4, 6, 8, 10],
  "Spanish (Phr. Dom.)": [0, 1, 4, 5, 7, 8, 10],
  "Hungarian Minor": [0, 2, 3, 6, 7, 8, 11],
  Bhairav: [0, 1, 4, 5, 7, 8, 11],
  Hirajoshi: [0, 2, 3, 7, 8],
  "In-Sen": [0, 1, 5, 7, 10],
  Iwato: [0, 1, 5, 6, 10],
  Kumoi: [0, 2, 3, 7, 9],
  Pelog: [0, 1, 3, 7, 8],
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} satisfies Record<string, number[]>;

export type ScaleName = keyof typeof SCALES;

// row interval (vertical step) in semitones / scale-steps for each layout
export const CHROMA_INT = { "4ths": 5, "3rds": 4, seq: 8 } satisfies Record<string, number>;
export const INKEY_INT = { "4ths": 3, "3rds": 2, seq: 8 } satisfies Record<string, number>;

// chord qualities defined by REAL intervals (semitones from root)
export const QUALITIES = {
  maj:   { l: "maj",  iv: [0, 4, 7],         cat: "Triads" },
  min:   { l: "min",  iv: [0, 3, 7],         cat: "Triads" },
  dim:   { l: "dim",  iv: [0, 3, 6],         cat: "Triads" },
  aug:   { l: "aug",  iv: [0, 4, 8],         cat: "Triads" },
  sus2:  { l: "sus2", iv: [0, 2, 7],         cat: "Triads" },
  sus4:  { l: "sus4", iv: [0, 5, 7],         cat: "Triads" },
  maj6:  { l: "6",    iv: [0, 4, 7, 9],      cat: "Sixths & Sevenths" },
  min6:  { l: "m6",   iv: [0, 3, 7, 9],      cat: "Sixths & Sevenths" },
  maj7:  { l: "maj7", iv: [0, 4, 7, 11],     cat: "Sixths & Sevenths" },
  dom7:  { l: "7",    iv: [0, 4, 7, 10],     cat: "Sixths & Sevenths" },
  min7:  { l: "m7",   iv: [0, 3, 7, 10],     cat: "Sixths & Sevenths" },
  m7b5:  { l: "m7♭5", iv: [0, 3, 6, 10], cat: "Sixths & Sevenths" },
  dim7:  { l: "°7",  iv: [0, 3, 6, 9],  cat: "Sixths & Sevenths" },
  mMaj7: { l: "mM7",  iv: [0, 3, 7, 11],     cat: "Sixths & Sevenths" },
  add9:  { l: "add9", iv: [0, 4, 7, 14],     cat: "Extended" },
  dom9:  { l: "9",    iv: [0, 4, 7, 10, 14], cat: "Extended" },
  maj9:  { l: "maj9", iv: [0, 4, 7, 11, 14], cat: "Extended" },
  min9:  { l: "m9",   iv: [0, 3, 7, 10, 14], cat: "Extended" },
  six9:  { l: "6/9",  iv: [0, 4, 7, 9, 14],  cat: "Extended" },
} satisfies Record<string, Quality>;

export type QualityKey = keyof typeof QUALITIES;

export const QUAL_CATS = ["Triads", "Sixths & Sevenths", "Extended"];

export const SYM = {
  maj: "", min: "m", dim: "dim", aug: "+", sus2: "sus2", sus4: "sus4",
  maj6: "6", min6: "m6", maj7: "maj7", dom7: "7", min7: "m7",
  m7b5: "m7♭5", dim7: "°7", mMaj7: "m(maj7)",
  add9: "add9", dom9: "9", maj9: "maj9", min9: "m9", six9: "6/9",
} satisfies Record<QualityKey, string>;

export const DEG_NUM = ["1", "♭2", "2", "♭3", "3", "4", "♭5", "5", "♭6", "6", "♭7", "7"];
export const DEG_ROM = ["I", "♭II", "II", "♭III", "III", "IV", "♭V", "V", "♭VI", "VI", "♭VII", "VII"];
export const DEG_SOL = ["Do", "Ra", "Re", "Me", "Mi", "Fa", "Se", "Sol", "Le", "La", "Te", "Ti"];

export const INTERVAL_NAMES: Record<number, string> = {
  1: "minor 2nd", 2: "major 2nd", 3: "minor 3rd", 4: "major 3rd",
  5: "perfect 4th", 6: "tritone", 7: "perfect 5th", 8: "minor 6th",
  9: "major 6th", 10: "minor 7th", 11: "major 7th",
};

// interval-set (sorted, from candidate root) -> chord suffix
export const FORMULAS: Record<string, string> = {
  "0,4,7": "", "0,3,7": "m", "0,3,6": "dim", "0,4,8": "aug",
  "0,2,7": "sus2", "0,5,7": "sus4",
  "0,4,7,9": "6", "0,3,7,9": "m6",
  "0,4,7,11": "maj7", "0,4,7,10": "7", "0,3,7,10": "m7",
  "0,3,6,10": "m7♭5", "0,3,6,9": "°7", "0,3,7,11": "m(maj7)",
  "0,4,8,10": "7♯5", "0,4,8,11": "maj7♯5",
  "0,2,4,7": "add9", "0,2,3,7": "m(add9)",
  "0,5,7,10": "7sus4",
  "0,2,4,7,11": "maj9", "0,2,4,7,10": "9", "0,2,3,7,10": "m9", "0,2,4,7,9": "6/9",
};
