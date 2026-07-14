// Headless piano keyboard → portable SVG string. A one-octave (or ranged) piano
// with the given pitch classes / MIDI notes highlighted. Uses the geometry/piano
// key metrics so it matches the app's keyboard. React-free.

import { el, svgRoot, COLORS, type Rendered } from "./svg";
import { WHITE_PCS } from "../../geometry/piano";

const WW = 22, BW = 13, WH = 96, BH = 60;

export interface KeyboardOptions {
  /** Highlight these MIDI notes exactly (register-specific). */
  midis?: number[];
  /** Highlight these pitch classes in every octave of the range. */
  pcs?: number[];
  /** Inclusive MIDI range to draw (default C4..B5 = 60..83). */
  lo?: number;
  hi?: number;
  /** Highlight colour (default teal). */
  highlight?: string;
}

const isWhite = (m: number) => WHITE_PCS.includes(((m % 12) + 12) % 12);

export function keyboardSvg(opts: KeyboardOptions = {}): Rendered {
  const lo = opts.lo ?? 60;
  const hi = opts.hi ?? 83;
  const hl = opts.highlight ?? COLORS.inSet;
  const litMidi = new Set(opts.midis ?? []);
  const litPc = new Set((opts.pcs ?? []).map((p) => ((p % 12) + 12) % 12));
  const lit = (m: number) => litMidi.has(m) || litPc.has(((m % 12) + 12) % 12);

  // white keys left→right, then black keys overlaid.
  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (isWhite(m)) whites.push(m);
  const width = whites.length * WW;
  const height = WH;
  const whiteX = new Map<number, number>();

  const parts: string[] = [];
  whites.forEach((m, i) => {
    whiteX.set(m, i * WW);
    parts.push(el("rect", { x: i * WW, y: 0, width: WW - 1, height: WH, rx: 2, fill: lit(m) ? hl : "#e9edf2", stroke: COLORS.line, "stroke-width": 1 }));
  });
  // black keys: sit between the white key they follow and the next.
  for (let m = lo; m <= hi; m++) {
    if (isWhite(m)) continue;
    const leftWhite = whiteX.get(m - 1);
    if (leftWhite === undefined) continue;
    const x = leftWhite + WW - BW / 2;
    parts.push(el("rect", { x, y: 0, width: BW, height: BH, rx: 1.5, fill: lit(m) ? hl : COLORS.black, stroke: COLORS.line, "stroke-width": 1 }));
  }

  return { svg: svgRoot(width, height, parts.join(""), COLORS.bg), width, height };
}
