// Pure selectors building the Push-grid and Piano cell models and their
// styling from the current scale/chord/selection state. Extracted verbatim
// from App.tsx (the grid/piano useMemos shared their inner flag logic — that
// duplication is now one `cellOf`). React-free (CLAUDE.md invariant): padStyle
// returns a plain style object structurally assignable to React.CSSProperties.

import { mod, pcOf, CHROMA_INT, INKEY_INT } from "../theory";
import { PIANO_LO, PIANO_HI, WHITE_PCS, BLACK_PCS } from "../../geometry/piano";
import type {
  Interaction, GridMode, Layout, Orient, ChordDisplay,
  Cell, GridCell, WhiteKey, BlackKey, KeyAccent, BuiltChord,
} from "../../ui/types";

/** The scale context every surface colours against. */
export interface ScaleContext {
  root: number;
  pattern: number[];
  inScalePc: (pc: number) => boolean;
}

/** The chord/selection state that decides a cell's highlight flags. */
export interface SurfaceSelection {
  interaction: Interaction;
  chordOn: boolean;
  chordDisplay: ChordDisplay;
  chord: BuiltChord;
  chordRootPc: number;
  highlightSel: number[];
  litSet: Set<number>;
}

/** One cell's highlight flags — the logic the grid and piano share. */
function cellOf(
  midi: number,
  scale: ScaleContext,
  sel: SurfaceSelection,
  selSet: Set<number>,
  selPcs: Set<number>
): Cell {
  const pc = pcOf(midi);
  const inScale = scale.inScalePc(pc);
  const isRoot = pc === scale.root;
  let isTone = false, isCRoot = false, isVoice = false;
  let voiceNum: number | null = null;
  let isSel = false, isSelPc = false;
  if (sel.interaction === "build" && sel.chordOn) {
    isTone = sel.chordDisplay === "tones" && sel.chord.closePcs.includes(pc);
    isCRoot = isTone && pc === sel.chordRootPc;
    isVoice = sel.chordDisplay === "voicing" && sel.chord.voicing.includes(midi);
    voiceNum = isVoice ? sel.chord.voicing.indexOf(midi) + 1 : null;
  } else if (sel.interaction === "analyze" || sel.interaction === "live") {
    isSel = selSet.has(midi);
    isSelPc = !isSel && selPcs.has(pc);
  }
  return { midi, pc, inScale, isRoot, isTone, isCRoot, isVoice, voiceNum, isSel, isSelPc, isLit: sel.litSet.has(midi) };
}

/** Layout options for the 8×8 grid. */
export interface GridLayout {
  mode: GridMode;
  fixed: boolean;
  layout: Layout;
  orient: Orient;
}

/** Build the 8×8 Push-grid cell model. */
export function buildGridCells(scale: ScaleContext, sel: SurfaceSelection, g: GridLayout): GridCell[][] {
  const { root, pattern } = scale;
  const len = pattern.length;
  const baseRootMidi = 36 + root;
  const pitchOf = (i: number) => {
    const oct = Math.floor(i / len);
    return baseRootMidi + oct * 12 + pattern[mod(i, len)];
  };
  const interval = (g.mode === "inkey" ? INKEY_INT : CHROMA_INT)[g.layout];

  let baseIdx = 0, baseMidi = 0;
  if (g.mode === "inkey") {
    if (g.fixed) {
      let best = 0, bd = Infinity;
      for (let i = -30; i <= 50; i++) {
        const d = Math.abs(pitchOf(i) - 36);
        if (d < bd) { bd = d; best = i; }
      }
      baseIdx = best;
    }
  } else baseMidi = g.fixed ? 36 : 36 + root;

  const selSet = new Set(sel.highlightSel);
  const selPcs = new Set(sel.highlightSel.map(pcOf));

  const rows: GridCell[][] = [];
  for (let r = 0; r < 8; r++) {
    const row: GridCell[] = [];
    for (let c = 0; c < 8; c++) {
      const stepR = g.orient === "vert" ? interval : 1;
      const stepC = g.orient === "vert" ? 1 : interval;
      const midi = g.mode === "inkey" ? pitchOf(baseIdx + r * stepR + c * stepC) : baseMidi + r * stepR + c * stepC;
      row.push({ ...cellOf(midi, scale, sel, selSet, selPcs), r, c });
    }
    rows.push(row);
  }
  return rows;
}

/** Build the piano-keyboard cell model (whites + blacks, C2–C6). */
export function buildPianoKeys(scale: ScaleContext, sel: SurfaceSelection): { whites: WhiteKey[]; blacks: BlackKey[] } {
  const selSet = new Set(sel.highlightSel);
  const selPcs = new Set(sel.highlightSel.map(pcOf));
  const whites: WhiteKey[] = [], blacks: BlackKey[] = [];
  for (let m = PIANO_LO; m <= PIANO_HI; m++) {
    if (WHITE_PCS.includes(mod(m, 12))) {
      const wi = whites.length;
      whites.push(cellOf(m, scale, sel, selSet, selPcs));
      const nb = m + 1;
      if (nb <= PIANO_HI && BLACK_PCS.includes(mod(nb, 12))) blacks.push({ ...cellOf(nb, scale, sel, selSet, selPcs), after: wi });
    }
  }
  return { whites, blacks };
}

/** A pad's style — a plain object assignable to React.CSSProperties. */
export interface PadStyle {
  background: string;
  color: string;
  border: string;
  boxShadow: string;
}

/** The Push-grid pad colours for a cell's highlight flags. */
export function padStyleOf(p: Cell, showScaleColors: boolean): PadStyle {
  let bg: string, color: string, border: string, glow: string;
  if (!showScaleColors) {
    bg = "#0e1117"; color = "#8893a4"; border = "1px solid #1c2129"; glow = "none";
  } else if (p.isRoot) {
    bg = "#1d2540"; color = "#eef2ff"; border = "1px solid #a5b4fc";
    glow = "0 0 13px rgba(165,180,252,.5), inset 0 0 9px rgba(165,180,252,.28)";
  } else if (p.inScale) {
    bg = "#0a2825"; color = "#5eead4"; border = "1px solid #2dd4bf"; glow = "0 0 7px rgba(45,212,191,.28)";
  } else {
    bg = "#1d0f12"; color = "#f87171"; border = "1px solid #5b1d22"; glow = "none";
  }
  const out = showScaleColors && !p.inScale;
  if (p.isSel) {
    bg = "#4a2f06"; color = "#fde68a"; border = "1px solid #fbbf24";
    glow = "0 0 17px rgba(251,191,36,.72), inset 0 0 11px rgba(251,191,36,.38)";
  } else if (p.isSelPc) {
    border = "1px dashed #d97706"; color = "#fcd34d";
  } else if (p.isVoice || p.isCRoot) {
    bg = out ? "#3a0f12" : (p.isCRoot ? "#4a2f06" : "#3a2a08");
    color = out ? "#fca5a5" : "#fde68a";
    border = "1px solid " + (out ? "#ef4444" : p.isCRoot ? "#fbbf24" : "#f59e0b");
    glow = out
      ? "0 0 15px rgba(239,68,68,.6), inset 0 0 10px rgba(239,68,68,.3)"
      : "0 0 16px rgba(251,191,36,.7), inset 0 0 10px rgba(251,191,36,.35)";
  } else if (p.isTone) {
    color = out ? "#fca5a5" : "#fcd34d";
    border = "1px solid " + (out ? "#ef4444" : "#f59e0b");
    glow = out ? "0 0 10px rgba(239,68,68,.45)" : "0 0 10px rgba(245,158,11,.45), inset 0 0 8px rgba(245,158,11,.22)";
  }
  // Sounding right now (MIDI playback): a bright filled yellow — unmistakable
  // against the teal scale tint and the red out-of-scale pads, and clearly
  // distinct from the dark-brown-filled amber of chord tones / live-held
  // selection (live notes stay amber via isSel; the file's notes glow yellow).
  if (p.isLit) {
    bg = "#fde047"; color = "#1a1400"; border = "1px solid #fef08a";
    glow = "0 0 20px rgba(253,224,71,.9), inset 0 0 11px rgba(253,224,71,.5)";
  }
  return { background: bg, color, border, boxShadow: glow };
}

/** The piano-key accent for a cell's highlight flags. An out-of-scale chord tone
 *  must still read as out-of-key (red), not be hidden behind the amber chord-tone
 *  colour — matches the grid + the legend. */
export function keyAccentOf(p: Cell, showScaleColors: boolean): KeyAccent | null {
  const out = showScaleColors && !p.inScale;
  if (p.isLit) return { c: "#fde047", strong: true };
  if (p.isSel) return { c: out ? "#ef4444" : "#fbbf24", strong: true };
  if (p.isSelPc) return { c: out ? "#ef4444" : "#d97706", dashed: true };
  if (p.isVoice || p.isCRoot) return { c: out ? "#ef4444" : "#fbbf24", strong: true, badge: p.voiceNum };
  if (p.isTone) return { c: out ? "#ef4444" : "#f59e0b" };
  if (showScaleColors && p.isRoot) return { c: "#a5b4fc", strong: true };
  if (showScaleColors && p.inScale) return { c: "#2dd4bf" };
  // Plain out-of-scale keys read red (outlined, not filled — distinct from the teal
  // in-scale fill and the filled chord/played accents).
  if (out) return { c: "#f87171", dashed: true };
  return null;
}
