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
  intervalVectorFromMagnitudes,
  tonalColor,
  tonalColorFrom,
  intervalColorFromVector,
  stackedIntervals,
  chirality,
  consonanceF5,
  trichordLandscape,
  primeForm,
  pcBitmask,
  analyzeSelection,
  stackAboveRoot,
  intervalShortName,
  intervalClassOf,
  MAX_CHIRALITY,
  MAX_CONSONANCE_F5,
  IC_PAIR_LABELS,
  IC_HUES,
  icRimAngle,
} from "../lib/theory";
import type { IntervalVector } from "../lib/theory";
import type { SetClassInfo } from "../lib/tonality/bridge";

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
  facts,
}: {
  pcs: number[];
  rootPc: number | null;
  realizationMidi: number[];
  label: (pc: number) => string;
  symbol?: string | null;
  facts?: SetClassInfo | null;
}) {
  const [panel, setPanel] = useState<Panel>("colour");
  const uniq = [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b);

  // The graphs are ALWAYS rendered — the scaffolding (wheel rings, IC rim, histogram
  // axis, harmony-map landscape) persists so the section never resizes or blinks out
  // during MIDI playback / live performance. Only the chord-specific marks (resultant
  // dots, bars, the map ring) come and go with the current selection. Nothing is
  // latched: when fewer than 2 notes sound, the marks simply clear.
  const active = uniq.length >= 2;
  // Engine facts only when they describe the currently-shown chord (and it's active).
  const eng = active && facts ? facts : null;
  const realization = realizationMidi.length >= 2 ? realizationMidi : uniq.map((p) => 60 + p);
  const name = active ? identify(uniq, realization, symbol) : uniq.length === 1 ? NOTE[uniq[0]] : "—";
  const sub = active
    ? uniq.map((p) => NOTE[p]).join(" ")
    : uniq.length === 1
      ? "single note · play 2+ notes for the full anatomy"
      : "waiting for notes";

  return (
    <div style={{ color: C.text }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: active ? C.text : C.faint }}>{name}</span>
        <span style={{ fontSize: 11, color: C.faint, fontFamily: "'JetBrains Mono', monospace" }}>{sub}</span>
        {active && (
          <span
            title={eng ? "set-class facts from the Tonality engine" : "computed locally (engine not connected)"}
            style={{
              marginLeft: "auto",
              fontSize: 9.5,
              letterSpacing: "0.05em",
              padding: "1px 6px",
              borderRadius: 5,
              border: `1px solid ${eng ? C.teal : C.border2}`,
              color: eng ? C.teal : C.faint,
            }}
          >
            {eng ? "engine" : "local"}
          </span>
        )}
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

      {/* Fixed-height panel area so switching panels / changing chord size never resizes
          the section. Sized to the tallest panel; shorter panels keep the headroom. */}
      <div style={{ minHeight: 392 }}>
        {panel === "colour" && <ColourPanel uniq={uniq} realizationMidi={realization} active={active} label={label} eng={eng} />}
        {panel === "intervals" && <IntervalsPanel uniq={uniq} rootPc={rootPc} active={active} eng={eng} />}
        {panel === "map" && <MapPanel uniq={uniq} name={active ? name : null} active={active} eng={eng} />}
      </div>
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

function Swatch({ title, css, focus, sub, active }: { title: string; css: string; focus: number; sub: string; active: boolean }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>{title}</div>
      <div style={{ height: 40, borderRadius: 8, background: active ? css : "#161b22", border: `1px solid ${C.border2}` }} />
      <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
        {active ? `${sub} · focus ${focus.toFixed(2)}` : "—"}
      </div>
    </div>
  );
}

function ColourPanel({
  uniq,
  realizationMidi,
  active,
  label,
  eng,
}: {
  uniq: number[];
  realizationMidi: number[];
  active: boolean;
  label: (pc: number) => string;
  eng: SetClassInfo | null;
}) {
  const card = uniq.length;
  // Consume the engine's DFT when connected: tonal hue/focus are arg(f5) / |f5|/n
  // (dft_phases[4] / dft_magnitudes[4], the engine's arrays being 0-indexed from f1),
  // and the interval vector — which set_class_info doesn't return — is recovered
  // exactly from the DFT magnitudes. Same numbers as local; the "engine" badge stays honest.
  const engOk = eng != null && eng.dftMagnitudes.length >= 6 && eng.dftPhases.length >= 5 && card > 0;
  const v = engOk ? intervalVectorFromMagnitudes(eng.dftMagnitudes, card) : intervalVector(uniq);
  const tc = engOk
    ? tonalColorFrom((eng.dftPhases[4] * 180) / Math.PI, eng.dftMagnitudes[4] / card, realizationMidi)
    : tonalColor(uniq, realizationMidi);
  const ic = intervalColorFromVector(v);
  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <Swatch title="Tonal colour (root-aware)" css={tc.css} focus={tc.focus} sub={`hue ${Math.round(tc.hue)}°`} active={active} />
        <Swatch title="Interval colour (root-blind)" css={ic.css} focus={ic.focus} sub={`hue ${Math.round(ic.hue)}°`} active={active} />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <PitchWheel uniq={uniq} css={tc.css} active={active} label={label} />
        <IntervalWheel v={v} css={ic.css} active={active} />
      </div>
    </div>
  );
}

function PitchWheel({ uniq, css, active, label }: { uniq: number[]; css: string; active: boolean; label: (pc: number) => string }) {
  const S = 188,
    cx = 94,
    cy = 94,
    R = 64;
  const screenAng = (pc: number) => (cofPos(pc) * 30 - 90) * D2R;
  let sx = 0,
    sy = 0;
  for (const pc of uniq) {
    sx += Math.cos(screenAng(pc));
    sy += Math.sin(screenAng(pc));
  }
  const rx = cx + (uniq.length ? sx / uniq.length : 0) * R,
    ry = cy + (uniq.length ? sy / uniq.length : 0) * R;
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
        {active && (
          <>
            <line x1={cx} y1={cy} x2={rx} y2={ry} stroke={C.dim} strokeWidth={1.2} strokeDasharray="3 2" />
            <circle cx={rx} cy={ry} r={7.5} fill={css} stroke={C.text} strokeWidth={1.4} />
          </>
        )}
        <circle cx={cx} cy={cy} r={1.6} fill={C.faint} />
      </svg>
    </div>
  );
}

function IntervalWheel({ v, css, active }: { v: IntervalVector; css: string; active: boolean }) {
  const S = 188,
    cx = 94,
    cy = 94,
    R = 60;
  const w = v.slice(0, 5),
    tt = v[5];
  const tot = w.reduce((a, b) => a + b, 0) + tt;
  let ux = 0,
    uy = 0;
  for (let k = 0; k < 5; k++) {
    ux += w[k] * Math.cos(icRimAngle(k));
    uy += w[k] * Math.sin(icRimAngle(k));
  }
  const rx = cx + (tot ? ux / tot : 0) * R,
    ry = cy + (tot ? uy / tot : 0) * R;
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
        {active && (
          <>
            <line x1={cx} y1={cy} x2={rx} y2={ry} stroke={C.dim} strokeWidth={1.2} strokeDasharray="3 2" />
            <circle cx={rx} cy={ry} r={7.5} fill={css} stroke={C.text} strokeWidth={1.4} />
          </>
        )}
        <circle cx={cx} cy={cy} r={1.6} fill={C.faint} />
      </svg>
    </div>
  );
}

// ----- Intervals ---------------------------------------------------------------

function IntervalsPanel({
  uniq,
  rootPc,
  active,
  eng,
}: {
  uniq: number[];
  rootPc: number | null;
  active: boolean;
  eng: SetClassInfo | null;
}) {
  // Interval vector from the engine's DFT magnitudes when connected (set_class_info
  // doesn't return the vector directly), else the local count. Exact either way.
  const v =
    eng && eng.dftMagnitudes.length >= 6
      ? intervalVectorFromMagnitudes(eng.dftMagnitudes, uniq.length)
      : intervalVector(uniq);
  const maxic = Math.max(1, ...v);
  const heights = stackAboveRoot(uniq, rootPc);
  const rootAbs = rootPc != null ? ((rootPc % 12) + 12) % 12 : uniq.length ? uniq[0] : 0;
  // Prefer the engine's set-class identity when connected (Rahn prime form is authoritative).
  const pf = eng ? eng.primeForm : primeForm(uniq);
  const mask = eng ? eng.mask : pcBitmask(uniq);
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

      <div style={{ fontSize: 11, color: C.dim, marginBottom: 3 }}>
        intervals above the root · every pair, stacked by span
      </div>
      <div style={{ height: 168, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        {active && heights.length >= 2 ? (
          <IntervalBrackets heights={heights} rootAbs={rootAbs} />
        ) : (
          <div style={{ fontSize: 11, color: C.faint }}>—</div>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace" }}>
        <div>
          notes&nbsp;&nbsp;{uniq.length ? uniq.map((p) => NOTE[p]).join(" ") : "—"}
          {active && rootPc != null ? <span style={{ color: C.faint }}> · bass {NOTE[((rootPc % 12) + 12) % 12]}</span> : null}
        </div>
        <div>prime&nbsp;&nbsp;[{pf.join(" ")}]</div>
        <div>vector&nbsp;[{v.join(" ")}]</div>
        <div style={{ color: C.faint }}>mask&nbsp;&nbsp;&nbsp;{mask.toString(2).padStart(12, "0")}</div>
      </div>
    </div>
  );
}

// Stacked interval brackets: notes along the bottom, every pairwise interval drawn as
// a bracket spanning its two notes, stacked by span width (adjacent at the bottom, the
// full span on top). Shows how the small intervals above the root nest into wider ones.
function IntervalBrackets({ heights, rootAbs }: { heights: number[]; rootAbs: number }) {
  const n = heights.length;
  const colW = n > 5 ? 40 : 46,
    rowH = 22,
    leftPad = 22,
    topPad = 14;
  const maxLevel = n - 1;
  const noteX = (i: number) => leftPad + i * colW;
  const rowY = (d: number) => topPad + (maxLevel - d) * rowH;
  const noteY = topPad + maxLevel * rowH + 18;
  const W = leftPad * 2 + (n - 1) * colW;
  const H = noteY + 6;
  const icColor = (ic: number) => (ic <= 5 ? `oklch(0.64 0.15 ${IC_HUES[ic - 1]})` : "#8590a2");

  const brackets: React.ReactNode[] = [];
  for (let d = 1; d <= maxLevel; d++) {
    for (let k = 0; k + d < n; k++) {
      const semi = heights[k + d] - heights[k];
      const col = icColor(intervalClassOf(semi));
      const x1 = noteX(k),
        x2 = noteX(k + d),
        y = rowY(d);
      brackets.push(
        <g key={`${d}-${k}`}>
          <line x1={x1} y1={y} x2={x2} y2={y} stroke={col} strokeWidth={1.5} />
          <line x1={x1} y1={y} x2={x1} y2={y + 4} stroke={col} strokeWidth={1.5} />
          <line x1={x2} y1={y} x2={x2} y2={y + 4} stroke={col} strokeWidth={1.5} />
          <rect x={(x1 + x2) / 2 - 13} y={y - 11} width={26} height={13} rx={3} fill={C.panel} />
          <text x={(x1 + x2) / 2} y={y - 1} textAnchor="middle" fontSize={10} fontWeight={600} fill={col}>
            {intervalShortName(semi)}
          </text>
        </g>
      );
    }
  }
  // Fills a fixed-height parent (xMidYMid meet) so adding notes scales the diagram to
  // fit instead of growing the panel — the box height stays static.
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      {brackets}
      {heights.map((h, i) => (
        <text key={i} x={noteX(i)} y={noteY} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="'JetBrains Mono', monospace" fill={C.dim}>
          {NOTE[(rootAbs + h) % 12]}
        </text>
      ))}
    </svg>
  );
}

// ----- Harmony map -------------------------------------------------------------

function MapPanel({ uniq, name, active, eng }: { uniq: number[]; name: string | null; active: boolean; eng: SetClassInfo | null }) {
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
  // Consume the engine's determinations when connected. `general_chirality` is the same
  // bispectrum slice the landscape dots use, so use it directly — the ring then lands
  // exactly on its landscape dot (maj on "maj", etc.). Only for true bispectrum
  // blind-spots (general ≈ 0 but the complete `chirality_sign` is ±) do we nudge off the
  // spine so the chord still shows its correct side.
  const myF5 = eng ? eng.consonanceF5 : consonanceF5(uniq);
  const myCh = eng
    ? Math.abs(eng.generalChirality) > 0.01
      ? eng.generalChirality
      : eng.chiralitySign * 0.4
    : chirality(uniq);
  const halfW = (Rr - L) / 2;
  const clampX = (x: number) => Math.max(L + 6, Math.min(Rr - 6, x));
  const X = (ch: number) => clampX(cxAxis + (cbrt(ch) / CHN) * halfW);
  const Y = (f5: number) => B - (f5 / F5MAX) * (B - T);
  const myX = X(myCh),
    myY = Y(myF5);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 380, display: "block", margin: "0 auto" }}>
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
          const big = /^(maj|min|aug|dim|sus|cluster)$/.test(t.name);
          return (
            <g key={i}>
              {/* hover anything for its name; the named anchors also show a visible label */}
              <circle cx={X(t.chirality)} cy={Y(t.consonance)} r={big ? 5.5 : 4} fill={t.intervalCss} stroke={C.text} strokeWidth={big ? 1.1 : 0.4} opacity={0.9} style={{ cursor: "default" }}>
                <title>{t.name}</title>
              </circle>
              {big && (
                <text x={X(t.chirality) + (t.chirality < 0 ? -7 : 7)} y={Y(t.consonance) + 3} textAnchor={t.chirality < 0 ? "end" : "start"} fontSize={9} fill={C.dim} pointerEvents="none">
                  {t.name}
                </text>
              )}
            </g>
          );
        })}
        {active && (
          <>
            <circle cx={myX} cy={myY} r={9} fill="none" stroke={C.accent} strokeWidth={2.5}>
              <title>{name ?? ""}</title>
            </circle>
            <text
              x={clampX(myX)}
              y={myY - 13 < T + 4 ? myY + 22 : myY - 13}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={C.accent}
              pointerEvents="none"
            >
              {name}
            </text>
          </>
        )}
      </svg>
      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>
        {active ? (
          <>
            Ring = {name} (|f5| {myF5.toFixed(2)}, handedness {myCh >= 0 ? "+" : ""}
            {myCh.toFixed(2)}).{" "}
          </>
        ) : (
          <>Play a chord to plot it. </>
        )}
        Dots = common trichords for reference. Consonance ↑, inversional handedness ←→ (major/minor on triads,
        bispectrum for any size).
      </div>
    </div>
  );
}
