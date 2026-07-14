// Headless grand-staff → portable SVG string. Renders a set of MIDI notes as one
// simultaneity (a chord / interval) engraved on the grand staff, REUSING the pure
// score layout (lib/score/layout.ts) — the same geometry the on-screen Score view
// draws from. No rhythm glyphs (matches the Score view's v1 proportional model).
// React-free; for the MCP render_staff tool.

import { el, text, svgRoot, COLORS, type Rendered } from "./svg";
import { layoutScore } from "../score/layout";
import type { Note } from "../midi/types";

const LINE_GAP = 8;
const TOP = 16;
const LEFT = 34; // clef gutter
const RIGHT = 18;

export interface StaffOptions {
  useFlats?: boolean;
}

/** Engrave `midis` as one simultaneity on the grand staff. */
export function staffSvg(midis: number[], opts: StaffOptions = {}): Rendered {
  // Synthesize simultaneous notes (time 0) so layoutScore places them with its
  // clef split, ledger lines, stems, and chord-second collision offsets.
  const notes: Note[] = midis.map((midi) => ({
    midi, time: 0, duration: 1, endTime: 1, velocity: 0.8, beats: 0, durationBeats: 1, drum: false,
  }));
  const lay = layoutScore(notes, { pxPerSec: 1, useFlats: opts.useFlats ?? false, lineGap: LINE_GAP, top: TOP });

  const maxX = lay.glyphs.reduce((m, g) => Math.max(m, g.x + g.xOffset), 0);
  const width = LEFT + maxX + RIGHT + 8;
  const height = lay.height;

  const parts: string[] = [];

  // staff lines
  for (const ys of [lay.trebleLines, lay.bassLines]) {
    for (const y of ys) parts.push(el("line", { x1: 0, y1: y, x2: width, y2: y, stroke: "rgba(230,237,243,0.5)", "stroke-width": 1 }));
  }
  // clefs (unicode)
  parts.push(text("\u{1D11E}", { x: 4, y: lay.trebleLines[2] + 1, "font-size": 34, "font-family": "serif", fill: COLORS.ink, "dominant-baseline": "middle" }));
  parts.push(text("\u{1D122}", { x: 6, y: lay.bassLines[1] + 3, "font-size": 26, "font-family": "serif", fill: COLORS.ink, "dominant-baseline": "middle" }));

  const half = LINE_GAP / 2;
  for (const g of lay.glyphs) {
    const x = LEFT + g.x + g.xOffset;
    // ledger lines
    for (const ly of g.ledgerYs) parts.push(el("line", { x1: x - 7, y1: ly, x2: x + 7, y2: ly, stroke: "rgba(230,237,243,0.45)", "stroke-width": 1 }));
    // stem
    const sx = g.stemDir === 1 ? x + 4.4 : x - 4.4;
    const sy2 = g.stemDir === 1 ? g.y - LINE_GAP * 3.2 : g.y + LINE_GAP * 3.2;
    parts.push(el("line", { x1: sx, y1: g.y + (g.stemDir === 1 ? -1 : 1), x2: sx, y2: sy2, stroke: COLORS.inSet, "stroke-width": 1.1 }));
    // notehead (oblique ellipse)
    parts.push(el("ellipse", { cx: x, cy: g.y, rx: 4.8, ry: half - 0.6, transform: `rotate(-20 ${x} ${g.y})`, fill: COLORS.inSet }));
    // accidental
    if (g.accidental !== 0) parts.push(text(g.accidental === 1 ? "♯" : "♭", { x: x - 14, y: g.y + 1, "font-size": 11, "font-weight": 700, "font-family": "'JetBrains Mono', monospace", fill: COLORS.accent }));
  }

  return { svg: svgRoot(width, height, parts.join(""), COLORS.bg), width, height };
}
