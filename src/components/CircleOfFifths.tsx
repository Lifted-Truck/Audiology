// Circle of fifths: the 12 major keys around the outer ring (C at top, clockwise
// by fifths), their relative minors on the inner ring. Highlights the current key
// (indigo ring), marks the file's overall/home key (gold dashed ring), and traces
// the keys the piece visits as a numbered, arrowed path so the order and direction
// of modulations are clear.
//
// Spelling: by default each key uses its **canonical** circle-of-fifths name
// (sharp side sharp, flat side flat) — stable, so selecting a key never flips the
// chart. The global Notation selector overrides to force all-sharp / all-flat.
//
// Expanded mode adds each key's signature (count of sharps/flats). SVG, driven by
// props + a local expand toggle.

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

type Key = { tonicPc: number; mode: string };

export default function CircleOfFifths({
  tonicPc,
  isMinor,
  visited = [],
  homeKey = null,
  noteNot = "auto",
  scalePcs,
  onPick,
}: {
  tonicPc: number;
  isMinor: boolean;
  visited?: Key[];
  homeKey?: Key | null;
  noteNot?: "auto" | "sharp" | "flat";
  /** The selected scale's pitch classes — keys outside it recede. Omit for no filtering. */
  scalePcs?: number[];
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
  const minorOf = (k: Key) => k.mode === "minor";
  const keyCenter = (k: Key): [number, number] =>
    minorOf(k) ? pos(majorPos((k.tonicPc + 3) % 12), G.rMin) : pos(majorPos(k.tonicPc), G.rMaj);
  const nodeR = (k: Key) => (minorOf(k) ? G.nrMin : G.nrMaj);

  const keyName = (pc: number, minor: boolean): string => {
    const base = noteNot === "sharp" ? SHARP_PC[pc] : noteNot === "flat" ? FLAT_PC[pc] : (minor ? CANON_MINOR : CANON_MAJOR)[pc];
    return base + (minor ? "m" : "");
  };

  const visitedSet = new Set(visited.map((v) => `${minorOf(v) ? "m" : "M"}:${v.tonicPc}`));
  // Empty = no scale filtering (everything reads at full strength).
  const scaleSet = new Set(scalePcs ?? []);
  const sameKey = (a: Key | null, pc: number, minor: boolean) => !!a && a.tonicPc === pc && minorOf(a) === minor;

  // Modulation path: shorten each segment to the node edges so the arrowhead lands
  // in the gap between keys (not hidden under a circle), and number the moves.
  const segs = visited.slice(1).map((to, k) => {
    const from = visited[k];
    const [ax, ay] = keyCenter(from), [bx, by] = keyCenter(to);
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const x1 = ax + ux * (nodeR(from) + 3), y1 = ay + uy * (nodeR(from) + 3);
    const x2 = bx - ux * (nodeR(to) + 6), y2 = by - uy * (nodeR(to) + 6);
    return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, n: k + 1 };
  });

  const node = (pc: number, minor: boolean, [x, y]: [number, number]) => {
    const isCurrent = pc === tonicPc && minor === isMinor;
    const isHome = sameKey(homeKey, pc, minor);
    const isVisited = visitedSet.has(`${minor ? "m" : "M"}:${pc}`);
    // Recede the keys that don't belong to the selected scale, so the chart reflects
    // the current MODE rather than reading as a static reference chart. A key belongs
    // when its whole tonic triad is in the scale — which generalizes past major/minor:
    // C Dorian lights Cm/Dm/F/Gm/B♭, C Major lights C/Dm/Em/F/G/Am. Never dim a key
    // that's carrying information (current, the file's home, or on the journey path).
    const inScale = !scaleSet.size || (minor ? [0, 3, 7] : [0, 4, 7]).every((iv) => scaleSet.has((pc + iv) % 12));
    const dim = !inScale && !isCurrent && !isHome && !isVisited;
    let fill = "#0d1016", stroke = "#2a3340", txt = "#5b6675", sw = 1.2;
    if (isVisited) { fill = "#0a2825"; stroke = "#2dd4bf"; txt = "#5eead4"; sw = 1.5; }
    if (isCurrent) { fill = "#1d2540"; stroke = "#a5b4fc"; txt = "#eef2ff"; sw = 2.4; }
    const r = minor ? G.nrMin : G.nrMaj;
    const showSig = expanded && !minor; // signature on majors (minors share the relative)
    return (
      <g key={`${minor ? "m" : "M"}${pc}`} className="px-node" opacity={dim ? 0.26 : 1} onClick={() => onPick(pc, minor)}>
        {isHome && <circle cx={x} cy={y} r={r + (isCurrent ? 6 : 3)} fill="none" stroke="#fcd34d" strokeWidth={2} strokeDasharray="3 2.5" />}
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
        title={expanded ? "Less detail" : "Expand — key signatures"}>
        {expanded ? "⤡" : "⤢"}
      </button>
      <svg viewBox={`0 0 ${G.vb} ${G.vb}`} className="px-bracelet-svg" role="img" aria-label="circle of fifths">
        <defs>
          <marker id="cof-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#fbbf24" />
          </marker>
        </defs>
        <circle cx={G.cx} cy={G.cy} r={G.rMaj} fill="none" stroke="#1c2129" strokeWidth={1} />
        <circle cx={G.cx} cy={G.cy} r={G.rMin} fill="none" stroke="#161b22" strokeWidth={1} />
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
        {/* the modulation path is drawn ON TOP so its arrowheads + move numbers stay visible */}
        {segs.map((s) => (
          <g key={s.n}>
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#fbbf24" strokeWidth={1.8}
              strokeLinecap="round" markerEnd="url(#cof-arrow)" opacity={0.85} />
            <circle cx={s.mx} cy={s.my} r={6.5} fill="#1a1205" stroke="#fbbf24" strokeWidth={1} />
            <text x={s.mx} y={s.my} textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="800"
              fontFamily="'JetBrains Mono', monospace" fill="#fde68a">{s.n}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
