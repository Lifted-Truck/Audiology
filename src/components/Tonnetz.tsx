// Tonnetz: the neo-Riemannian pitch lattice — conceptually endless, so it's
// drag-to-pan and windowed (only the cells currently in view are rendered, from
// an unbounded integer grid). Right = perfect 5th (+7), up = major 3rd (+4); the
// third edge of each triangle is a minor 3rd (+3), so each triangle is a major
// or minor triad. The scale is the backdrop, the tonic keeps an indigo ring, and
// edges between two active nodes light up — a sounding triad lights its triangle.
// Nodes are clickable (like the pads); labels honor the Labels settings.

import React, { useRef, useState } from "react";

const W = 46, H = 42, NR = 13; // lattice spacing + node radius (viewBox units)
const VW = 360, VH = 230; // viewBox; CSS scales it to the container width
const M = NR + 6; // off-screen margin so edges at the border still draw

const pcAt = (c: number, r: number): number => (((7 * c + 4 * r) % 12) + 12) % 12;
const DRAG_THRESHOLD = 4; // px of movement before a press counts as a pan, not a click

export default function Tonnetz({
  rootPc,
  chordRootPc,
  scalePcs,
  activePcs,
  label,
  onPick,
}: {
  rootPc: number;
  chordRootPc: number | null;
  scalePcs: Set<number>;
  activePcs: number[];
  label: (pc: number) => string;
  onPick: (pc: number) => void;
}) {
  // Pan offset in viewBox units; origin starts left-of-centre so the lattice
  // fills the view in every direction.
  const [pan, setPan] = useState({ x: VW / 2 - W, y: VH / 2 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const lastMoved = useRef(false);
  const activeSet = new Set(activePcs);

  const sx = (c: number, r: number) => c * W + r * (W / 2) + pan.x;
  const sy = (r: number) => -(r * H) + pan.y;

  // Visible integer-cell window (with a 1-cell margin for edges).
  const rLo = Math.floor((pan.y - VH - M) / H) - 1;
  const rHi = Math.ceil((pan.y + M) / H) + 1;
  const cells: { c: number; r: number }[] = [];
  for (let r = rLo; r <= rHi; r++) {
    const cLo = Math.floor((-M - pan.x - (r * W) / 2) / W) - 1;
    const cHi = Math.ceil((VW + M - pan.x - (r * W) / 2) / W) + 1;
    for (let c = cLo; c <= cHi; c++) cells.push({ c, r });
  }

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
    lastMoved.current = false;
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const scale = rect && rect.width ? VW / rect.width : 1;
    const ddx = e.clientX - d.x, ddy = e.clientY - d.y;
    if (Math.abs(ddx) + Math.abs(ddy) > DRAG_THRESHOLD) d.moved = true;
    setPan({ x: d.px + ddx * scale, y: d.py + ddy * scale });
  };
  const onUp = (e: React.PointerEvent) => {
    if (drag.current) lastMoved.current = drag.current.moved;
    drag.current = null;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      className="px-tonnetz-svg"
      role="img"
      aria-label="Tonnetz (drag to pan)"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      {cells.map(({ c, r }) => {
        const here = activeSet.has(pcAt(c, r));
        const x1 = sx(c, r), y1 = sy(r);
        return (
          <g key={"e" + c + "_" + r}>
            {[
              [c + 1, r], // perfect 5th
              [c, r + 1], // major 3rd
              [c + 1, r - 1], // minor 3rd (down-right)
            ].map(([nc, nr], i) => {
              const lit = here && activeSet.has(pcAt(nc, nr));
              return (
                <line
                  key={i}
                  x1={x1} y1={y1} x2={sx(nc, nr)} y2={sy(nr)}
                  stroke={lit ? "#fbbf24" : "#1c2129"}
                  strokeWidth={lit ? 1.6 : 1}
                />
              );
            })}
          </g>
        );
      })}
      {cells.map(({ c, r }) => {
        const pc = pcAt(c, r);
        const x = sx(c, r), y = sy(r);
        const active = activeSet.has(pc);
        const isTonic = pc === rootPc;
        const isChordRoot = pc === chordRootPc;
        const inScale = scalePcs.has(pc);
        let fill = "#0b0e13", stroke = "#2a3340", txt = "#5b6675";
        if (inScale) { fill = "#0a2825"; stroke = "#2dd4bf"; txt = "#5eead4"; }
        if (isTonic) { fill = "#1d2540"; stroke = "#a5b4fc"; txt = "#eef2ff"; }
        if (active) {
          if (inScale) { fill = "#4a2f06"; stroke = "#fbbf24"; txt = "#fde68a"; }
          else { fill = "#3a0f12"; stroke = "#ef4444"; txt = "#fca5a5"; } // out-of-scale chord tone
        }
        return (
          <g
            key={"n" + c + "_" + r}
            className="px-node"
            onClick={() => { if (!lastMoved.current) onPick(pc); }}
          >
            {isTonic && <circle cx={x} cy={y} r={NR + (isChordRoot ? 5 : 3)} fill="none" stroke="#a5b4fc" strokeWidth={1.5} />}
            {isChordRoot && <circle cx={x} cy={y} r={NR + 2.5} fill="none" stroke="#fde68a" strokeWidth={2} />}
            <circle cx={x} cy={y} r={NR} fill={fill} stroke={stroke} strokeWidth={active || isTonic ? 2 : 1.2} />
            <text
              x={x} y={y}
              textAnchor="middle" dominantBaseline="central"
              fontSize="10.5" fontWeight="700" fontFamily="'JetBrains Mono', monospace"
              fill={txt}
            >
              {label(pc)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
