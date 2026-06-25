// Circle of fifths: the 12 major keys around the outer ring (C at top, clockwise
// by fifths), their relative minors on the inner ring. Highlights the current key
// (root + major/minor); when a file is analyzed it traces the keys the piece
// visits as a path (arrowed in expanded mode), so modulations read as motion.
//
// Spelling: by default each key uses its **canonical** circle-of-fifths name
// (sharp side sharp, flat side flat) — stable, so selecting a key never flips the
// chart. The global Notation selector overrides to force all-sharp / all-flat.
//
// Expanded mode adds each key's signature (count of sharps/flats) and directional
// arrows on the modulation path. SVG, driven by props + a local expand toggle.

import React, { useState } from "react";

// Canonical key spelling (fewest accidentals) per pitch class.
const CANON_MAJOR = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const CANON_MINOR = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"];
const SHARP_PC = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT_PC = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
// Key signature per MAJOR pitch class: [count, symbol]. Minors share their relative major's.
const ACC: [number, string][] = [
  [0, ""], [5, "♭"], [2, "♯"], [3, "♭"], [4, "♯"], [1, "♭"],
  [6, "♯"], [1, "♯"], [4, "♭"], [3, "♯"], [2, "♭"], [5, "♯"],
];
const sigLabel = (majorPc: number): string => {
  const [n, s] = ACC[majorPc];
  return n === 0 ? "♮" : `${n}${s}`;
};

// 7 is its own inverse mod 12, so the fifths-position of a major pc P is (P*7)%12.
const majorPos = (pc: number): number => ((pc * 7) % 12 + 12) % 12;

export default function CircleOfFifths({
  tonicPc,
  isMinor,
  visited = [],
  noteNot = "auto",
  onPick,
}: {
  tonicPc: number;
  isMinor: boolean;
  visited?: { tonicPc: number; mode: string }[];
  noteNot?: "auto" | "sharp" | "flat";
  onPick: (tonicPc: number, isMinor: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const G = expanded
    ? { vb: 260, cx: 130, cy: 130, rMaj: 104, rMin: 62, nrMaj: 19, nrMin: 15 }
    : { vb: 220, cx: 110, cy: 110, rMaj: 86, rMin: 52, nrMaj: 15, nrMin: 13 };
  const pos = (i: number, r: number): [number, number] => {
    const a = ((i * 30 - 90) * Math.PI) / 180;
    return [G.cx + r * Math.cos(a), G.cy + r * Math.sin(a)];
  };
  const keyCenter = (tPc: number, minor: boolean): [number, number] =>
    minor ? pos(majorPos((tPc + 3) % 12), G.rMin) : pos(majorPos(tPc), G.rMaj);

  const keyName = (pc: number, minor: boolean): string => {
    const base = noteNot === "sharp" ? SHARP_PC[pc] : noteNot === "flat" ? FLAT_PC[pc] : (minor ? CANON_MINOR : CANON_MAJOR)[pc];
    return base + (minor ? "m" : "");
  };

  const visitedSet = new Set(visited.map((v) => `${v.mode === "minor" ? "m" : "M"}:${v.tonicPc}`));
  const journey = visited.map((v) => keyCenter(v.tonicPc, v.mode === "minor"));

  const node = (pc: number, minor: boolean, [x, y]: [number, number]) => {
    const isCurrent = pc === tonicPc && minor === isMinor;
    const isVisited = visitedSet.has(`${minor ? "m" : "M"}:${pc}`);
    let fill = "#0d1016", stroke = "#2a3340", txt = "#5b6675", sw = 1.2;
    if (isVisited) { fill = "#0a2825"; stroke = "#2dd4bf"; txt = "#5eead4"; sw = 1.5; }
    if (isCurrent) { fill = "#1d2540"; stroke = "#a5b4fc"; txt = "#eef2ff"; sw = 2.4; }
    const r = minor ? G.nrMin : G.nrMaj;
    const showSig = expanded && !minor; // signature on majors (minors share the relative)
    return (
      <g key={`${minor ? "m" : "M"}${pc}`} className="px-node" onClick={() => onPick(pc, minor)}>
        {isCurrent && <circle cx={x} cy={y} r={r + 3} fill="none" stroke="#a5b4fc" strokeWidth={1.5} />}
        <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />
        <text x={x} y={showSig ? y - 3.5 : y} textAnchor="middle" dominantBaseline="central"
          fontSize={minor ? (expanded ? 9.5 : 9) : (expanded ? 11.5 : 10.5)} fontWeight="700"
          fontFamily="'JetBrains Mono', monospace" fill={txt}>
          {keyName(pc, minor)}
        </text>
        {showSig && (
          <text x={x} y={y + 7.5} textAnchor="middle" dominantBaseline="central" fontSize="7.5" fontWeight="600"
            fontFamily="'JetBrains Mono', monospace" fill={isCurrent ? "#c7d2fe" : "#7c8694"}>
            {sigLabel(pc)}
          </text>
        )}
      </g>
    );
  };

  const positions = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="px-cof-wrap">
      <button className={"px-cof-expand" + (expanded ? " on" : "")} onClick={() => setExpanded((e) => !e)}
        title={expanded ? "Less detail" : "Expand — key signatures + directional path"}>
        {expanded ? "⤡" : "⤢"}
      </button>
      <svg viewBox={`0 0 ${G.vb} ${G.vb}`} className="px-bracelet-svg" role="img" aria-label="circle of fifths">
        <defs>
          <marker id="cof-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#fbbf24" />
          </marker>
        </defs>
        <circle cx={G.cx} cy={G.cy} r={G.rMaj} fill="none" stroke="#1c2129" strokeWidth={1} />
        <circle cx={G.cx} cy={G.cy} r={G.rMin} fill="none" stroke="#161b22" strokeWidth={1} />
        {/* modulation path: arrowed segments when expanded, plain polyline otherwise */}
        {journey.length >= 2 && (expanded
          ? journey.slice(1).map(([x2, y2], k) => {
              const [x1, y1] = journey[k];
              return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(251,191,36,.6)" strokeWidth={1.8}
                strokeLinecap="round" markerEnd="url(#cof-arrow)" />;
            })
          : <polyline points={journey.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none"
              stroke="rgba(251,191,36,.45)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {positions.map((i) => {
          const majorPc = ((i * 7) % 12 + 12) % 12;
          const minorPc = (majorPc + 9) % 12;
          return (
            <React.Fragment key={i}>
              {node(majorPc, false, pos(i, G.rMaj))}
              {node(minorPc, true, pos(i, G.rMin))}
            </React.Fragment>
          );
        })}
      </svg>
    </div>
  );
}
