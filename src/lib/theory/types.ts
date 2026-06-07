// Core music-theory types. This module imports nothing — it's the vocabulary
// the rest of the theory layer (and the UI) speaks.

export type PitchClass = number; // 0..11
export type Midi = number; // MIDI note number; Ableton convention C3 = 60

export type Voicing = "close" | "drop2" | "drop3" | "spread" | "wide";

export interface Quality {
  /** short label shown on quality chips, e.g. "maj7" */
  l: string;
  /** intervals in semitones from the root, e.g. [0,4,7,11] */
  iv: number[];
  /** grouping category for the UI */
  cat: string;
}

export interface ChordCandidate {
  name: string;
  sub: string;
  primary: boolean;
}

/** Tagged union returned by `analyzeSelection`. */
export type AnalysisResult =
  | { empty: true }
  | { single: true; text: string }
  | { none: true; pcs: PitchClass[]; bassPc: PitchClass; intervals: number[] }
  | { candidates: ChordCandidate[]; pcs: PitchClass[]; bassPc: PitchClass };
