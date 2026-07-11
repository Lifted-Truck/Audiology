// Score layout — the pure maths behind the Score view (traditional notation on a
// grand staff). React-free and Node-testable. This is a PROPORTIONAL score: pitch
// is engraved conventionally (staff position + accidental + ledger lines + stem),
// but x IS time (seconds × pxPerSec), the same axis as the PianoRoll — that's what
// makes the shared playhead/scrub natural. No rhythmic glyphs/rests in v1.
//
// Spelling: sharps or flats (the app's `useFlats`), which CHANGES staff position
// (A#4 sits on the A space; Bb4 on the B line). Numeric pitch stays the identity;
// spelling is the display edge, consistent with the rest of the app.

import type { Note } from "../midi/types";

/** Diatonic letter index within the octave: C=0 D=1 E=2 F=3 G=4 A=5 B=6. */
interface Spelled {
  letter: number;
  /** -1 flat, 0 natural, +1 sharp. */
  accidental: -1 | 0 | 1;
}

// pc → spelling under each convention. Sharps spell black keys as (letter below)+♯;
// flats as (letter above)+♭.
const SHARP_SPELL: Spelled[] = [
  { letter: 0, accidental: 0 }, { letter: 0, accidental: 1 }, { letter: 1, accidental: 0 },
  { letter: 1, accidental: 1 }, { letter: 2, accidental: 0 }, { letter: 3, accidental: 0 },
  { letter: 3, accidental: 1 }, { letter: 4, accidental: 0 }, { letter: 4, accidental: 1 },
  { letter: 5, accidental: 0 }, { letter: 5, accidental: 1 }, { letter: 6, accidental: 0 },
];
const FLAT_SPELL: Spelled[] = [
  { letter: 0, accidental: 0 }, { letter: 1, accidental: -1 }, { letter: 1, accidental: 0 },
  { letter: 2, accidental: -1 }, { letter: 2, accidental: 0 }, { letter: 3, accidental: 0 },
  { letter: 4, accidental: -1 }, { letter: 4, accidental: 0 }, { letter: 5, accidental: -1 },
  { letter: 5, accidental: 0 }, { letter: 6, accidental: -1 }, { letter: 6, accidental: 0 },
];

/** Absolute diatonic step of a midi note under a spelling: octave*7 + letter.
 *  (Octave from the SPELLED letter, so B#-type edge cases would carry — our two
 *  tables never produce them, but the formula stays correct.) */
export function diatonicStep(midi: number, useFlats: boolean): { step: number; accidental: -1 | 0 | 1 } {
  const pc = ((midi % 12) + 12) % 12;
  const s = (useFlats ? FLAT_SPELL : SHARP_SPELL)[pc];
  const octave = Math.floor(midi / 12) - 1; // MIDI octave convention (C-1 = 0)
  return { step: octave * 7 + s.letter, accidental: s.accidental };
}

// Staff reference steps (absolute diatonic): treble bottom line E4, bass top line A3.
// MIDI 64 (E4) → octave 4... with our octave = floor(64/12)-1 = 4, letter E=2 → 4*7+2 = 30.
export const TREBLE_BOTTOM_LINE_STEP = 30; // E4
export const BASS_TOP_LINE_STEP = 26; // A3 = 3*7+5

export type Staff = "treble" | "bass";

export interface GlyphNote {
  /** The source note (for seek/inspection). */
  note: Note;
  x: number;
  /** y in px from the layout top (notehead centre). */
  y: number;
  staff: Staff;
  accidental: -1 | 0 | 1;
  /** y of each ledger line this note needs. */
  ledgerYs: number[];
  /** +1 stem up, -1 stem down. */
  stemDir: 1 | -1;
  /** Horizontal offset applied to resolve a second-cluster collision (px). */
  xOffset: number;
}

export interface ScoreLayout {
  glyphs: GlyphNote[];
  /** y of the 5 treble lines then the 5 bass lines (top→bottom each). */
  trebleLines: number[];
  bassLines: number[];
  height: number;
  /** Middle-C guide y (between the staves), for reference. */
  middleCY: number;
}

export interface LayoutOptions {
  pxPerSec: number;
  useFlats: boolean;
  /** px between adjacent staff LINES (a step = half of this). */
  lineGap?: number;
  /** y of the treble staff's top line. */
  top?: number;
  /** Gap between the staves (bass top line below treble bottom line). */
  staffGap?: number;
  /** Notehead horizontal radius (collision offset unit). */
  noteheadW?: number;
}

/**
 * Lay out a note list (time-sorted, as in `Song.notes`) on a grand staff.
 * Split: midi >= 60 → treble, < 60 → bass (middle C sits on its ledger line in
 * either staff). Chord seconds (adjacent diatonic steps at one onset) offset
 * alternately to the right, per engraving practice. Drums are EXCLUDED — they are
 * unpitched; a percussion staff is a later refinement.
 */
export function layoutScore(notes: Note[], opts: LayoutOptions): ScoreLayout {
  const lineGap = opts.lineGap ?? 8;
  const top = opts.top ?? 24;
  const staffGap = opts.staffGap ?? 40;
  const half = lineGap / 2;
  const noteheadW = opts.noteheadW ?? 4.6;

  const trebleTopStep = TREBLE_BOTTOM_LINE_STEP + 8; // F5 (top line) = E4 + 8 steps
  const trebleLines = Array.from({ length: 5 }, (_, i) => top + i * lineGap);
  const trebleBottomY = trebleLines[4];
  const bassTop = trebleBottomY + staffGap;
  const bassLines = Array.from({ length: 5 }, (_, i) => bassTop + i * lineGap);
  const bassTopStep = BASS_TOP_LINE_STEP;

  // y for an absolute diatonic step on each staff (each step = half a lineGap).
  const yTreble = (step: number) => top + (trebleTopStep - step) * half;
  const yBass = (step: number) => bassTop + (bassTopStep - step) * half;

  const glyphs: GlyphNote[] = [];
  // Track the previous glyph per onset-cluster for second-collision offsets.
  let clusterT = -1;
  let prevStepInCluster = Number.NaN;
  let prevOffset = 0;

  for (const n of notes) {
    if (n.drum) continue;
    const { step, accidental } = diatonicStep(n.midi, opts.useFlats);
    const staff: Staff = n.midi >= 60 ? "treble" : "bass";
    const y = staff === "treble" ? yTreble(step) : yBass(step);
    const x = n.time * opts.pxPerSec;

    // Ledger lines sit on LINE steps (same parity as the staff lines) outside the
    // staff, from the staff edge out to the note: every line L with |L| between
    // the first outside line and the note's step (inclusive — a note ON a ledger
    // line or on the space just beyond it takes that line).
    const ledgerYs: number[] = [];
    if (staff === "treble") {
      for (let L = TREBLE_BOTTOM_LINE_STEP - 2; L >= step; L -= 2) ledgerYs.push(yTreble(L)); // below (C4, A3, …)
      for (let L = trebleTopStep + 2; L <= step; L += 2) ledgerYs.push(yTreble(L)); // above (A5, C6, …)
    } else {
      for (let L = bassTopStep + 2; L <= step; L += 2) ledgerYs.push(yBass(L)); // above (C4, E4 — between the staves)
      for (let L = bassTopStep - 10; L >= step; L -= 2) ledgerYs.push(yBass(L)); // below (E2, C2, …)
    }

    // Second-cluster collision: same onset (within 1ms) and adjacent step → offset.
    const sameCluster = Math.abs(n.time - clusterT) < 0.001;
    let xOffset = 0;
    if (sameCluster && Math.abs(step - prevStepInCluster) === 1 && prevOffset === 0) {
      xOffset = noteheadW * 2;
    }
    if (!sameCluster) {
      clusterT = n.time;
      prevStepInCluster = Number.NaN;
      prevOffset = 0;
    }
    prevStepInCluster = step;
    prevOffset = xOffset;

    // Stem up when below the staff's middle line, down at/above it.
    const middleStep = staff === "treble" ? TREBLE_BOTTOM_LINE_STEP + 4 : bassTopStep - 4;
    const stemDir: 1 | -1 = step < middleStep ? 1 : -1;

    glyphs.push({ note: n, x, y, staff, accidental, ledgerYs, stemDir, xOffset });
  }

  return {
    glyphs,
    trebleLines,
    bassLines,
    height: bassLines[4] + 40,
    middleCY: yTreble(TREBLE_BOTTOM_LINE_STEP - 2), // C4's ledger position (treble side)
  };
}
