// Shared UI vocabulary for the app shell (App / ControlPanels / Grid / Piano).
// The pure music-theory types live in lib/theory; these are presentation-layer.

export type Interaction = "build" | "analyze" | "live";
export type GridMode = "inkey" | "chromatic";
export type Layout = "4ths" | "3rds" | "seq";
export type Orient = "vert" | "horiz";
export type LabelMode = "note" | "degree";
export type NoteNotation = "auto" | "sharp" | "flat";
export type DegNotation = "number" | "roman" | "solfege";
export type DegRef = "tonic" | "root";
export type ChordDisplay = "tones" | "voicing";

/**
 * One highlightable position on the Push grid or Piano. `padStyle`, `keyAccent`,
 * and `padMain` read only these fields; Grid cells add row/col, black piano keys
 * add the index of the white key they sit after.
 */
export interface Cell {
  midi: number;
  pc: number;
  inScale: boolean;
  isRoot: boolean;
  isTone: boolean;
  isCRoot: boolean;
  isVoice: boolean;
  voiceNum: number | null;
  isSel: boolean;
  isSelPc: boolean;
  /** Sounding right now from MIDI-file playback. */
  isLit: boolean;
}

export type GridCell = Cell & { r: number; c: number };
export type WhiteKey = Cell;
export type BlackKey = Cell & { after: number };

/** Piano-key accent derived from a cell's highlight flags. */
export interface KeyAccent {
  c: string;
  strong?: boolean;
  dashed?: boolean;
  badge?: number | null;
}

/** The built chord shown in Build mode. */
export interface BuiltChord {
  closePcs: number[];
  voicing: number[];
  symbol: string;
}
