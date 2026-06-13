// Tonnetz: the neo-Riemannian pitch lattice. Right = perfect 5th (+7), up =
// major 3rd (+4); the third edge of each triangle is a minor 3rd (+3), so each
// triangle is a major or minor triad. The scale is the backdrop, the root is
// marked, and edges between two active nodes light up — a sounding triad lights
// its triangle. Pure SVG over pitch classes the app already has; a future
// Tonality descriptor (real Tonnetz coordinates) could replace the layout.

import React from "react";

const COLS = 6, ROWS = 4, W = 46, H = 42, NR = 13, PAD = 16;

const pcAt = (c: number, r: number): number => (((7 * c + 4 * r) % 12) + 12) % 12;
// rows shear right and stack upward (r=0 at the bottom)
const xy = (c: number, r: number): [number, number] => [
  PAD + NR + c * W + r * (W / 2),
  PAD + NR + (ROWS - 1 - r) * H,
];

const VW = PAD * 2 + NR * 2 + (COLS - 1) * W + (ROWS - 1) * (W / 2);
const VH = PAD * 2 + NR * 2 + (ROWS - 1) * H;

interface Cell { c: number; r: number; }
const NODES: Cell[] = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) NODES.push({ c, r });

const EDGES: [Cell, Cell][] = [];
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++) {
    if (c + 1 < COLS) EDGES.push([{ c, r }, { c: c + 1, r }]); // perfect 5th
    if (r + 1 < ROWS) EDGES.push([{ c, r }, { c, r: r + 1 }]); // major 3rd
    if (c + 1 < COLS && r + 1 < ROWS) EDGES.push([{ c: c + 1, r }, { c, r: r + 1 }]); // minor 3rd
  }

export default function Tonnetz({
  rootPc,
  scalePcs,
  activePcs,
  noteName,
}: {
  rootPc: number;
  scalePcs: Set<number>;
  activePcs: number[];
  noteName: (pc: number) => string;
}) {
  const activeSet = new Set(activePcs);
  return (
    <svg viewBox={`0 0 ${VW.toFixed(0)} ${VH.toFixed(0)}`} className="px-tonnetz-svg" role="img" aria-label="Tonnetz">
      {EDGES.map(([a, b], i) => {
        const [x1, y1] = xy(a.c, a.r);
        const [x2, y2] = xy(b.c, b.r);
        const both = activeSet.has(pcAt(a.c, a.r)) && activeSet.has(pcAt(b.c, b.r));
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={both ? "#fbbf24" : "#1c2129"} strokeWidth={both ? 1.6 : 1} />
        );
      })}
      {NODES.map(({ c, r }, i) => {
        const pc = pcAt(c, r);
        const [x, y] = xy(c, r);
        const active = activeSet.has(pc);
        const isRoot = pc === rootPc;
        const inScale = scalePcs.has(pc);
        let fill = "#0b0e13", stroke = "#2a3340", txt = "#5b6675";
        if (inScale) { fill = "#0a2825"; stroke = "#2dd4bf"; txt = "#5eead4"; }
        if (isRoot) { fill = "#1d2540"; stroke = "#a5b4fc"; txt = "#eef2ff"; }
        if (active) { fill = "#4a2f06"; stroke = "#fbbf24"; txt = "#fde68a"; }
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={NR} fill={fill} stroke={stroke} strokeWidth={active || isRoot ? 2 : 1.2} />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="10.5"
              fontWeight="700"
              fontFamily="'JetBrains Mono', monospace"
              fill={txt}
            >
              {noteName(pc)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
