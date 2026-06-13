// Bracelet (pitch-class clock): the 12 pitch classes around a circle, C at top,
// clockwise. The scale is the backdrop (in-scale nodes filled), the scale tonic
// keeps an indigo ring even when it's also a chord tone, and the active set
// (current chord / selection / sounding notes) is joined into a polygon — the
// "bracelet". Nodes are clickable (like the pads). Labels honor the Labels
// settings (note vs degree) via the `label` prop.

import React from "react";

const PCS = Array.from({ length: 12 }, (_, i) => i);
const CX = 110, CY = 110, R = 84, NR = 15;

const pos = (pc: number): [number, number] => {
  const a = ((pc * 30 - 90) * Math.PI) / 180; // C (pc 0) at top, clockwise
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
};

export default function Bracelet({
  rootPc,
  scalePcs,
  activePcs,
  label,
  onPick,
}: {
  rootPc: number;
  scalePcs: Set<number>;
  activePcs: number[];
  label: (pc: number) => string;
  onPick: (pc: number) => void;
}) {
  const activeSet = new Set(activePcs);
  const ring = [...activePcs].sort((a, b) => a - b).map(pos);
  const ringPts = ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox="0 0 220 220" className="px-bracelet-svg" role="img" aria-label="pitch-class bracelet">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1c2129" strokeWidth={1} />

      {ring.length >= 3 && (
        <polygon points={ringPts} fill="rgba(251,191,36,.14)" stroke="#fbbf24" strokeWidth={1.5} strokeLinejoin="round" />
      )}
      {ring.length === 2 && (
        <line x1={ring[0][0]} y1={ring[0][1]} x2={ring[1][0]} y2={ring[1][1]} stroke="#fbbf24" strokeWidth={1.5} />
      )}

      {PCS.map((pc) => {
        const [x, y] = pos(pc);
        const active = activeSet.has(pc);
        const isTonic = pc === rootPc;
        const inScale = scalePcs.has(pc);
        let fill = "transparent", stroke = "#2a3340", txt = "#5b6675";
        if (inScale) { fill = "#0a2825"; stroke = "#2dd4bf"; txt = "#5eead4"; }
        if (isTonic) { fill = "#1d2540"; stroke = "#a5b4fc"; txt = "#eef2ff"; }
        if (active) { fill = "#4a2f06"; stroke = "#fbbf24"; txt = "#fde68a"; }
        return (
          <g key={pc} className="px-node" onClick={() => onPick(pc)}>
            {isTonic && <circle cx={x} cy={y} r={NR + 3} fill="none" stroke="#a5b4fc" strokeWidth={1.5} />}
            <circle cx={x} cy={y} r={NR} fill={fill} stroke={stroke} strokeWidth={active || isTonic ? 2 : 1.2} />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="11"
              fontWeight="700"
              fontFamily="'JetBrains Mono', monospace"
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
