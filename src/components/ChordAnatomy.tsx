// Chord Anatomy — the interval/colour/harmony surfaces for the current chord.
// Driven, like Bracelet/Tonnetz, by the active pitch classes (+ the sounding MIDI
// for voicing-sensitive views). Three panels behind a segmented control:
//   Colour    — root-aware (circle-of-fifths) and root-blind (interval-content)
//               colour wheels with their resultant-vector construction + swatches.
//   Intervals — the interval-vector histogram, the stacked-interval ladder, and the
//               set-class identity line (prime form, bitmask, interval vector).
//   Map       — the consonance × chirality harmony map (Tymoczko trichord geometry),
//               the current chord plotted over the full trichord landscape.
// All maths lives in lib/theory/chord-anatomy.ts (React-free).

import React, { useState } from "react";
import {
  intervalVector,
  tonalColor,
  intervalColor,
  stackedIntervals,
  chirality,
  consonanceF5,
  trichordLandscape,
  primeForm,
  pcBitmask,
  analyzeSelection,
  MAX_CHIRALITY,
  MAX_CONSONANCE_F5,
  IC_PAIR_LABELS,
  IC_HUES,
  icRimAngle,
} from "../lib/theory";

const C = {
  bg: "#0d1117",
  panel: "#11151b",
  border: "#1c2129",
  border2: "#2a3340",
  text: "#e6edf3",
  dim: "#94a3b8",
  faint: "#5b6675",
  accent: "#fbbf24",
  teal: "#2dd4bf",
};

const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const cofPos = (pc: number) => ((pc * 7) % 12 + 12) % 12;
const D2R = Math.PI / 180;
const cbrt = (x: number) => Math.sign(x) * Math.cbrt(Math.abs(x));

type Panel = "colour" | "intervals" | "map";

export default function ChordAnatomy({
  pcs,
  rootPc,
  realizationMidi,
  label,
  symbol,
}: {
  pcs: number[];
  rootPc: number | null;
  realizationMidi: number[];
  label: (pc: number) => string;
  symbol?: string | null;
}) {
  const [panel, setPanel] = useState<Panel>("colour");
  const uniq = [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b);

  // Reflect the CURRENT selection — never latch a stale chord. Below 2 notes the
  // surfaces aren't defined, so show the note(s) plainly or stay blank. The section's
  // box stays mounted (this returns a placeholder, not null), so nothing jumps.
  if (uniq.length < 2) {
    return (
      <div style={{ padding: "22px 14px", color: C.faint, fontSize: 13, textAlign: "center", lineHeight: 1.5 }}>
        {uniq.length === 1
          ? `${NOTE[uniq[0]]} — single note · add a note for intervals, two for the full anatomy`
          : "Play, select, or build a chord (2+ notes) to see its anatomy."}
      </div>
    );
  }

  const realization = realizationMidi.length >= 2 ? realizationMidi : uniq.map((p) => 60 + p);
  const name = identify(uniq, realization, symbol);

  return (
    <div style={{ color: C.text }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{name}</span>
        <span style={{ fontSize: 11, color: C.faint, fontFamily: "'JetBrains Mono', monospace" }}>
          {uniq.map((p) => NOTE[p]).join(" ")}
        </span>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["colour", "intervals", "map"] as Panel[]).map((p) => (
          <button
            key={p}
            onClick={() => setPanel(p)}
            style={{
              flex: 1,
              padding: "5px 8px",
              fontSize: 11.5,
              textTransform: "capitalize",
              cursor: "pointer",
              borderRadius: 7,
              border: `1px solid ${panel === p ? C.accent : C.border2}`,
              background: panel === p ? "rgba(251,191,36,.12)" : "transparent",
              color: panel === p ? C.accent : C.dim,
            }}
          >
            {p === "colour" ? "Colour" : p === "intervals" ? "Intervals" : "Harmony map"}
          </button>
        ))}
      </div>

      {panel === "colour" && <ColourPanel uniq={uniq} realizationMidi={realization} label={label} />}
      {panel === "intervals" && <IntervalsPanel uniq={uniq} rootPc={rootPc} realizationMidi={realization} />}
      {panel === "map" && <MapPanel uniq={uniq} name={name} />}
    </div>
  );
}

/** Chord name if recognized, else a stacked-interval list. Mirrors the app analyzer. */
function identify(pcs: number[], midis: number[], symbol?: string | null): string {
  if (symbol) return symbol;
  const res = analyzeSelection(midis, (pc) => NOTE[pc]);
  if ("candidates" in res && res.candidates.length) return res.candidates[0].name;
  const lad = stackedIntervals(midis).map((s) => s.name);
  return lad.length ? lad.join("·") : pcs.map((p) => NOTE[p]).join(" ");
}

// ----- Colour ------------------------------------------------------------------

function Swatch({ title, css, focus, sub }: { title: string; css: string; focus: number; sub: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>{title}</div>
      <div style={{ height: 40, borderRadius: 8, background: css, border: `1px solid ${C.border2}` }} />
      <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
        {sub} · focus {focus.toFixed(2)}
      </div>
    </div>
  );
}

function ColourPanel({
  uniq,
  realizationMidi,
  label,
}: {
  uniq: number[];
  realizationMidi: number[];
  label: (pc: number) => string;
}) {
  const tc = tonalColor(uniq, realizationMidi);
  const ic = intervalColor(uniq);
  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <Swatch title="Tonal colour (root-aware)" css={tc.css} focus={tc.focus} sub={`hue ${Math.round(tc.hue)}°`} />
        <Swatch title="Interval colour (root-blind)" css={ic.css} focus={ic.focus} sub={`hue ${Math.round(ic.hue)}°`} />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <PitchWheel uniq={uniq} css={tc.css} label={label} />
        <IntervalWheel uniq={uniq} css={ic.css} />
      </div>
    </div>
  );
}

function PitchWheel({ uniq, css, label }: { uniq: number[]; css: string; label: (pc: number) => string }) {
  const S = 188,
    cx = 94,
    cy = 94,
    R = 64;
  const memb = new Set(uniq);
  const screenAng = (pc: number) => (cofPos(pc) * 30 - 90) * D2R;
  let sx = 0,
    sy = 0;
  for (const pc of uniq) {
    sx += Math.cos(screenAng(pc));
    sy += Math.sin(screenAng(pc));
  }
  const rx = cx + (sx / uniq.length) * R,
    ry = cy + (sy / uniq.length) * R;
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 2 }}>circle of fifths</div>
      <svg viewBox={`0 0 ${S} ${S}`} style={{ width: "100%", maxWidth: 200 }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.border} strokeWidth={0.75} />
        {Array.from({ length: 12 }, (_, p) => {
          const a = (p * 30 - 90) * D2R; // p is the cof position here
          const x = cx + R * Math.cos(a),
            y = cy + R * Math.sin(a);
          return <circle key={p} cx={x} cy={y} r={3.5} fill={`oklch(0.66 0.155 ${p * 30})`} opacity={0.3} />;
        })}
        {uniq.map((pc) => {
          const a = screenAng(pc);
          const x = cx + R * Math.cos(a),
            y = cy + R * Math.sin(a);
          const lx = cx + (R + 13) * Math.cos(a),
            ly = cy + (R + 13) * Math.sin(a);
          return (
            <g key={pc}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={C.border2} strokeWidth={1} />
              <circle cx={x} cy={y} r={6.5} fill={`oklch(0.66 0.155 ${cofPos(pc) * 30})`} stroke={C.panel} strokeWidth={1.3} />
              <text x={lx} y={ly + 3} textAnchor="middle" fontSize={9} fill={C.dim}>
                {label(pc)}
              </text>
            </g>
          );
        })}
        <line x1={cx} y1={cy} x2={rx} y2={ry} stroke={C.dim} strokeWidth={1.2} strokeDasharray="3 2" />
        <circle cx={rx} cy={ry} r={7.5} fill={css} stroke={C.text} strokeWidth={1.4} />
        <circle cx={cx} cy={cy} r={1.6} fill={C.faint} />
      </svg>
    </div>
  );
}

function IntervalWheel({ uniq, css }: { uniq: number[]; css: string }) {
  const S = 188,
    cx = 94,
    cy = 94,
    R = 60;
  const v = intervalVector(uniq);
  const w = v.slice(0, 5),
    tt = v[5];
  const tot = w.reduce((a, b) => a + b, 0) + tt;
  let ux = 0,
    uy = 0;
  for (let k = 0; k < 5; k++) {
    ux += w[k] * Math.cos(icRimAngle(k));
    uy += w[k] * Math.sin(icRimAngle(k));
  }
  const rx = cx + (ux / tot) * R,
    ry = cy + (uy / tot) * R;
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 2 }}>interval content</div>
      <svg viewBox={`0 0 ${S} ${S}`} style={{ width: "100%", maxWidth: 200 }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.border} strokeWidth={0.75} />
        {Array.from({ length: 5 }, (_, k) => {
          const a = icRimAngle(k);
          const x = cx + R * Math.cos(a),
            y = cy + R * Math.sin(a);
          const on = w[k] > 0;
          return (
            <g key={k}>
              {on && <line x1={cx} y1={cy} x2={x} y2={y} stroke={C.border2} strokeWidth={0.8 + w[k] * 0.6} />}
              <circle cx={x} cy={y} r={on ? 4 + w[k] * 2 : 3} fill={`oklch(0.66 0.155 ${IC_HUES[k]})`} opacity={on ? 1 : 0.28} />
            </g>
          );
        })}
        {tt > 0 && <circle cx={cx} cy={cy} r={3 + tt * 2.4} fill="none" stroke={C.faint} strokeWidth={1.1} strokeDasharray="2.5 2" />}
        <line x1={cx} y1={cy} x2={rx} y2={ry} stroke={C.dim} strokeWidth={1.2} strokeDasharray="3 2" />
        <circle cx={rx} cy={ry} r={7.5} fill={css} stroke={C.text} strokeWidth={1.4} />
      </svg>
    </div>
  );
}

// ----- Intervals ---------------------------------------------------------------

function IntervalsPanel({
  uniq,
  rootPc,
  realizationMidi,
}: {
  uniq: number[];
  rootPc: number | null;
  realizationMidi: number[];
}) {
  const v = intervalVector(uniq);
  const maxic = Math.max(1, ...v);
  const ladderMidi = realizationMidi.length >= 2 ? realizationMidi : uniq.map((p, i) => 60 + (uniq[i] - uniq[0] + 12) % 12);
  const ladder = stackedIntervals(ladderMidi);
  const pf = primeForm(uniq);
  const mask = pcBitmask(uniq);
  return (
    <div>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 5 }}>
        interval vector{v[5] > 0 ? <span style={{ color: C.accent }}> · contains tritone</span> : ""}
      </div>
      <div style={{ display: "flex", gap: 5, alignItems: "flex-end", marginBottom: 14 }}>
        {v.map((n, i) => {
          const hot = i === 5 && n > 0;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{ width: "100%", height: 40, display: "flex", alignItems: "flex-end" }}>
                <div
                  style={{
                    width: "100%",
                    height: `${(n / maxic) * 38 + 1}px`,
                    borderRadius: "3px 3px 0 0",
                    background: hot ? C.accent : C.teal,
                    opacity: n ? (hot ? 1 : 0.8) : 0.16,
                  }}
                />
              </div>
              <div style={{ fontSize: 10, color: hot ? C.accent : C.faint }}>{n}</div>
              <div style={{ fontSize: 8.5, color: C.faint }}>{IC_PAIR_LABELS[i]}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: C.dim, marginBottom: 5 }}>stacked intervals (bottom → top)</div>
      <div style={{ display: "flex", flexDirection: "column-reverse", gap: 0, marginBottom: 14 }}>
        {ladder.map((s, i) => (
          <div key={i} style={{ fontSize: 12, color: C.text, padding: "3px 0", borderTop: `0.5px solid ${C.border}` }}>
            {s.name} <span style={{ color: C.faint, fontSize: 10 }}>({s.semitones} st)</span>
          </div>
        ))}
        {ladder.length === 0 && <div style={{ fontSize: 11, color: C.faint }}>—</div>}
      </div>

      <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace" }}>
        <div>
          notes&nbsp;&nbsp;{uniq.map((p) => NOTE[p]).join(" ")}
          {rootPc != null ? <span style={{ color: C.faint }}> · bass {NOTE[((rootPc % 12) + 12) % 12]}</span> : null}
        </div>
        <div>prime&nbsp;&nbsp;[{pf.join(" ")}]</div>
        <div>vector&nbsp;[{v.join(" ")}]</div>
        <div style={{ color: C.faint }}>mask&nbsp;&nbsp;&nbsp;{mask.toString(2).padStart(12, "0")}</div>
      </div>
    </div>
  );
}

// ----- Harmony map -------------------------------------------------------------

function MapPanel({ uniq, name }: { uniq: number[]; name: string }) {
  const W = 300,
    H = 260,
    L = 30,
    Rr = 288,
    T = 16,
    B = 214,
    cxAxis = (L + Rr) / 2;
  // Fixed global bounds (max over ALL pc-sets) so the axes encompass every possible
  // chord — never rescaling or clamping as the chord changes. Signed cube-root on x
  // keeps the small-magnitude triads legible despite the wide (±8.2) handedness range.
  const F5MAX = MAX_CONSONANCE_F5 * 1.04;
  const CHN = cbrt(MAX_CHIRALITY * 1.02);
  const land = trichordLandscape();
  const myCh = chirality(uniq);
  const myF5 = consonanceF5(uniq);
  const halfW = (Rr - L) / 2;
  const clampX = (x: number) => Math.max(L + 6, Math.min(Rr - 6, x));
  const X = (ch: number) => clampX(cxAxis + (cbrt(ch) / CHN) * halfW);
  const Y = (f5: number) => B - (f5 / F5MAX) * (B - T);
  const myX = X(myCh),
    myY = Y(myF5);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
        <line x1={cxAxis} y1={T} x2={cxAxis} y2={B + 4} stroke={C.border2} strokeWidth={1} strokeDasharray="3 3" />
        <line x1={L} y1={B + 4} x2={Rr} y2={B + 4} stroke={C.border} strokeWidth={1} />
        <text x={L} y={B + 18} textAnchor="start" fontSize={9.5} fill={C.dim}>
          ← major
        </text>
        <text x={Rr} y={B + 18} textAnchor="end" fontSize={9.5} fill={C.dim}>
          minor →
        </text>
        <text x={cxAxis} y={B + 18} textAnchor="middle" fontSize={9} fill={C.faint}>
          symmetric
        </text>
        <text transform={`translate(${L - 18},${(T + B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={9} fill={C.faint}>
          consonance |f5| →
        </text>
        {land.map((t, i) => {
          const big = /maj|min|aug|dim|sus|cluster/.test(t.name);
          return (
            <g key={i}>
              <circle cx={X(t.chirality)} cy={Y(t.consonance)} r={big ? 5.5 : 4} fill={t.intervalCss} stroke={C.text} strokeWidth={big ? 1.1 : 0.4} opacity={0.9} />
              {big && (
                <text x={X(t.chirality) + (t.chirality < 0 ? -7 : 7)} y={Y(t.consonance) + 3} textAnchor={t.chirality < 0 ? "end" : "start"} fontSize={9} fill={C.dim}>
                  {t.name}
                </text>
              )}
            </g>
          );
        })}
        <circle cx={myX} cy={myY} r={9} fill="none" stroke={C.accent} strokeWidth={2.5} />
        <text
          x={clampX(myX)}
          y={myY - 13 < T + 4 ? myY + 22 : myY - 13}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill={C.accent}
        >
          {name}
        </text>
      </svg>
      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>
        Ring = {name} (|f5| {myF5.toFixed(2)}, handedness {myCh >= 0 ? "+" : ""}{myCh.toFixed(2)}). Dots = common
        trichords for reference. Consonance ↑, inversional handedness ←→ (major/minor on triads, bispectrum for any size).
      </div>
    </div>
  );
}
