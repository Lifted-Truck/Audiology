// Headless bracelet (pitch-class clock) → portable SVG string. The 12 pitch
// classes around a circle (C at top, clockwise), the set marked and joined into
// a polygon. Mirrors components/Bracelet.tsx's geometry; produced as a static
// string for the MCP render_bracelet tool. React-free.

import { el, text, svgRoot, COLORS, NOTE_NAMES, norm, type Rendered } from "./svg";

const CX = 110, CY = 110, R = 84, NR = 15, SIZE = 220;
const pos = (pc: number): [number, number] => {
  const a = ((pc * 30 - 90) * Math.PI) / 180; // C at top, clockwise
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
};

export interface BraceletOptions {
  /** Mark one pc as the tonic (indigo ring). */
  rootPc?: number;
  useFlats?: boolean;
}

export function braceletSvg(pcs: number[], opts: BraceletOptions = {}): Rendered {
  const set = new Set(norm(pcs));
  const names = opts.useFlats
    ? ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    : NOTE_NAMES;

  const parts: string[] = [el("circle", { cx: CX, cy: CY, r: R, fill: "none", stroke: COLORS.line, "stroke-width": 0.75 })];

  // polygon / line joining the set
  const ring = [...set].sort((a, b) => a - b).map(pos);
  if (ring.length >= 3) {
    parts.push(el("polygon", { points: ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "), fill: "rgba(251,191,36,.14)", stroke: COLORS.accent, "stroke-width": 1.5, "stroke-linejoin": "round" }));
  } else if (ring.length === 2) {
    parts.push(el("line", { x1: ring[0][0], y1: ring[0][1], x2: ring[1][0], y2: ring[1][1], stroke: COLORS.accent, "stroke-width": 1.5 }));
  }

  // nodes (background dim first, then in-set on top — matches the component's layering)
  const order = [...Array(12).keys()].sort((a, b) => Number(set.has(a)) - Number(set.has(b)));
  for (const pc of order) {
    const [x, y] = pos(pc);
    const inSet = set.has(pc);
    const isTonic = pc === opts.rootPc;
    const fill = inSet ? "#4a2f06" : isTonic ? "#1d2540" : "transparent";
    const stroke = inSet ? COLORS.accent : isTonic ? COLORS.root : COLORS.line;
    const txt = inSet ? "#fde68a" : isTonic ? "#eef2ff" : COLORS.faint;
    if (isTonic) parts.push(el("circle", { cx: x, cy: y, r: NR + 3, fill: "none", stroke: COLORS.root, "stroke-width": 1.5 }));
    parts.push(el("circle", { cx: x, cy: y, r: NR, fill, stroke, "stroke-width": inSet || isTonic ? 2 : 1.2 }));
    parts.push(text(names[pc], { x, y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 11, "font-weight": 700, "font-family": "'JetBrains Mono', monospace", fill: txt }));
  }

  return { svg: svgRoot(SIZE, SIZE, parts.join(""), COLORS.bg), width: SIZE, height: SIZE };
}
