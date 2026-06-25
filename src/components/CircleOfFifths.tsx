// Circle of fifths: the 12 major keys around the outer ring (C at top, clockwise
// by fifths), their relative minors on the inner ring. Highlights the current key
// (root + major/minor); when a file is analyzed it traces the keys the piece
// visits as a faint path, so modulations read as motion around the circle. Nodes
// are clickable to set the app's root + scale. SVG, driven entirely by props.

import React from "react";

const CX = 110, CY = 110, R_MAJ = 86, R_MIN = 52, NR_MAJ = 15, NR_MIN = 13;

const pos = (i: number, r: number): [number, number] => {
  const a = ((i * 30 - 90) * Math.PI) / 180; // position 0 at top, clockwise
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
// 7 is its own inverse mod 12, so the fifths-position of a major pc P is (P*7)%12.
const majorPos = (pc: number): number => ((pc * 7) % 12 + 12) % 12;
const keyCenter = (tonicPc: number, isMinor: boolean): [number, number] =>
  isMinor ? pos(majorPos((tonicPc + 3) % 12), R_MIN) : pos(majorPos(tonicPc), R_MAJ);

export default function CircleOfFifths({
  tonicPc,
  isMinor,
  visited = [],
  label,
  onPick,
}: {
  tonicPc: number;
  isMinor: boolean;
  visited?: { tonicPc: number; mode: string }[];
  label: (pc: number) => string;
  onPick: (tonicPc: number, isMinor: boolean) => void;
}) {
  const visitedSet = new Set(visited.map((v) => `${v.mode === "minor" ? "m" : "M"}:${v.tonicPc}`));
  const journey = visited
    .map((v) => keyCenter(v.tonicPc, v.mode === "minor"))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const node = (pc: number, minor: boolean, [x, y]: [number, number]) => {
    const isCurrent = pc === tonicPc && minor === isMinor;
    const isVisited = visitedSet.has(`${minor ? "m" : "M"}:${pc}`);
    let fill = "#0d1016", stroke = "#2a3340", txt = "#5b6675", sw = 1.2;
    if (isVisited) { fill = "#0a2825"; stroke = "#2dd4bf"; txt = "#5eead4"; sw = 1.5; }
    if (isCurrent) { fill = "#1d2540"; stroke = "#a5b4fc"; txt = "#eef2ff"; sw = 2.4; }
    const r = minor ? NR_MIN : NR_MAJ;
    return (
      <g key={`${minor ? "m" : "M"}${pc}`} className="px-node" onClick={() => onPick(pc, minor)}>
        {isCurrent && <circle cx={x} cy={y} r={r + 3} fill="none" stroke="#a5b4fc" strokeWidth={1.5} />}
        <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
          fontSize={minor ? 9 : 10.5} fontWeight="700" fontFamily="'JetBrains Mono', monospace" fill={txt}>
          {label(pc)}{minor ? "m" : ""}
        </text>
      </g>
    );
  };

  const positions = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg viewBox="0 0 220 220" className="px-bracelet-svg" role="img" aria-label="circle of fifths">
      <circle cx={CX} cy={CY} r={R_MAJ} fill="none" stroke="#1c2129" strokeWidth={1} />
      <circle cx={CX} cy={CY} r={R_MIN} fill="none" stroke="#161b22" strokeWidth={1} />
      {journey && visited.length >= 2 && (
        <polyline points={journey} fill="none" stroke="rgba(251,191,36,.45)" strokeWidth={1.5}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {positions.map((i) => {
        const majorPc = ((i * 7) % 12 + 12) % 12;
        const minorPc = (majorPc + 9) % 12;
        return (
          <React.Fragment key={i}>
            {node(majorPc, false, pos(i, R_MAJ))}
            {node(minorPc, true, pos(i, R_MIN))}
          </React.Fragment>
        );
      })}
    </svg>
  );
}
