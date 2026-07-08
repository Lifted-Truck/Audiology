// Pc-Set Lab — a custom-scale / pitch-class-set editor + analyzer (the Ian-Ring-
// style surface). Build any pc-set on the chromatic rail, and read its set-class
// identity (prime form, interval vector, mask, DFT colour), its symmetry
// (transpositional + inversional), its complement, the catalog scales/chords it
// IS or sits inside, and its modes — with a tap to send a named scale to the
// explorer. Identity prefers the engine's set_class_info when connected (same
// consume seam as Chord Anatomy); symmetry / names / modes are pure-local (a
// 12-step loop, not engine combinatorics). All maths is React-free in lib/theory.

import React, { useMemo, useState } from "react";
import {
  normalize, normalOrder, primeFormLocal, transpositionalSymmetry, inversionalAxes,
  complement, invert, transpose, exactNames, modesOf,
  intervalVector, intervalVectorFromMagnitudes, tonalColor, intervalColor,
  setClassLabel, pcBitmask, scalesContaining,
} from "../lib/theory";
import type { ScaleName } from "../lib/theory/constants";
import { useChordFacts } from "../hooks/useChordFacts";

const C = {
  border: "#1c2129", border2: "#2a3340", text: "#e6edf3", dim: "#94a3b8",
  faint: "#5b6675", accent: "#fbbf24", teal: "#2dd4bf", red: "#f87171", indigo: "#a5b4fc",
};
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export default function PcSetLab({
  seedScalePcs, seedActivePcs, currentRoot, currentScale,
  onApplyScale, bridgeBaseUrl, bridgeConnected, label,
}: {
  seedScalePcs: number[];
  seedActivePcs: number[];
  currentRoot: number;
  currentScale: ScaleName;
  onApplyScale: (rootPc: number, scale: ScaleName) => void;
  bridgeBaseUrl: string;
  bridgeConnected: boolean;
  label: (pc: number) => string;
}) {
  // The lab owns its working set — seeded from the explorer, edited freely here.
  const [set, setSet] = useState<number[]>(() => normalize(seedScalePcs.length ? seedScalePcs : [0, 4, 7]));
  const has = (pc: number) => set.includes(pc);
  const toggle = (pc: number) => setSet((s) => (s.includes(pc) ? s.filter((p) => p !== pc) : normalize([...s, pc])));

  // Engine set-class facts for the working set (same debounced/fallback seam as anatomy).
  const facts = useChordFacts(bridgeBaseUrl, bridgeConnected, set);
  const engId = facts && facts.dftMagnitudes.length >= 6;

  const a = useMemo(() => {
    const u = normalize(set);
    const card = u.length;
    const iv = engId ? intervalVectorFromMagnitudes(facts!.dftMagnitudes, card) : intervalVector(u);
    const prime = engId ? facts!.primeForm : primeFormLocal(u);
    const mask = engId ? facts!.mask : pcBitmask(u);
    const trans = transpositionalSymmetry(u);
    const axes = inversionalAxes(u);
    const tc = tonalColor(u);
    const ic = intervalColor(u);
    const names = exactNames(u);
    const modes = card >= 2 && card <= 8 ? modesOf(u) : [];
    // Scales that CONTAIN the set (tightest first); dedupe our own exact matches out.
    const containers = scalesContaining(u).filter((m) => !m.exact).slice(0, 8);
    return { u, card, iv, prime, mask, trans, axes, tc, ic, names, modes, containers, comp: complement(u) };
  }, [set, engId, facts]);

  const chip = (on: boolean, tone: "accent" | "teal" | "plain" = "plain"): React.CSSProperties => ({
    padding: "4px 9px", fontSize: 11, cursor: "pointer", borderRadius: 6, whiteSpace: "nowrap",
    border: `1px solid ${on ? (tone === "teal" ? C.teal : C.accent) : C.border2}`,
    background: on ? (tone === "teal" ? "rgba(45,212,191,.12)" : "rgba(251,191,36,.12)") : "transparent",
    color: on ? (tone === "teal" ? C.teal : C.accent) : C.dim,
  });

  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 10, lineHeight: 1.7 }}>
      <span style={{ color: C.faint, minWidth: 116, flexShrink: 0 }}>{k}</span>
      <span style={{ color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{children}</span>
    </div>
  );

  const transWord = a.trans.degree > 1 ? `${a.trans.degree}-fold · period ${a.trans.period}` : "none (asymmetric)";
  const invWord = a.axes > 0 ? `${a.axes} ${a.axes === 1 ? "axis" : "axes"} (mirror-symmetric)` : "none (chiral)";

  return (
    <div style={{ color: C.text, fontSize: 11.5 }}>
      {/* Editor rail */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3, marginBottom: 8 }}>
        {Array.from({ length: 12 }, (_, pc) => {
          const on = has(pc);
          const black = [1, 3, 6, 8, 10].includes(pc);
          return (
            <button
              key={pc}
              onClick={() => toggle(pc)}
              title={NOTE[pc]}
              style={{
                padding: "8px 0", fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 6,
                fontFamily: "'JetBrains Mono', monospace",
                border: `1px solid ${on ? C.accent : C.border2}`,
                background: on ? "rgba(251,191,36,.16)" : black ? "#0c1016" : "#0e1218",
                color: on ? C.accent : C.faint,
              }}
            >
              {label(pc)}
            </button>
          );
        })}
      </div>

      {/* Seeds + operations */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
        <button style={chip(false)} onClick={() => setSet(normalize(seedScalePcs))} title="Load the explorer's current scale">↧ Scale</button>
        <button style={chip(false)} onClick={() => setSet(normalize(seedActivePcs))} title="Load the current chord / selection" disabled={seedActivePcs.length < 1}>↧ Selection</button>
        <button style={chip(false)} onClick={() => setSet(a.comp)} title="Swap to the complementary pc-set">Complement</button>
        <button style={chip(false)} onClick={() => setSet(invert(set, set.length ? set[0] : 0))} title="Invert about the lowest note">Invert</button>
        <button style={chip(false)} onClick={() => setSet(transpose(set, 1))}>T+1</button>
        <button style={chip(false)} onClick={() => setSet(transpose(set, -1))}>T−1</button>
        <button style={chip(false)} onClick={() => setSet([])} title="Clear the set">Clear</button>
        <span style={{ flex: 1 }} />
        <span
          title={engId ? "identity from the Tonality engine" : "identity computed locally"}
          style={{ fontSize: 9.5, letterSpacing: ".05em", padding: "2px 7px", borderRadius: 5, alignSelf: "center", border: `1px solid ${engId ? C.teal : C.border2}`, color: engId ? C.teal : C.faint }}
        >
          {engId ? "engine" : "local"}
        </span>
      </div>

      {a.card === 0 ? (
        <div style={{ color: C.faint, padding: "12px 2px" }}>Empty set — tap notes above, or seed from the explorer.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: "'JetBrains Mono', monospace" }}>
          <section>
            <div style={{ color: C.accent, fontSize: 10.5, letterSpacing: ".04em", marginBottom: 3 }}>identity · {engId ? "engine" : "local"}</div>
            <Row k="notes">{a.u.map((p) => NOTE[p]).join(" ")}<span style={{ color: C.faint }}> · {a.card} pcs</span></Row>
            <Row k="pcs / normal">{`{${a.u.join(" ")}}  ·  [${normalOrder(a.u).join(" ")}]`}</Row>
            <Row k="prime form">[{a.prime.join(" ")}]<span style={{ color: C.faint }}>  · steps {setClassLabel(a.u) ?? "—"}</span></Row>
            <Row k="interval vector">[{a.iv.join(" ")}]{a.iv[5] > 0 ? <span style={{ color: C.accent }}> · has tritone</span> : null}</Row>
            <Row k="mask">{a.mask.toString(2).padStart(12, "0")}<span style={{ color: C.faint }}> · {a.mask}</span></Row>
          </section>

          <section>
            <div style={{ color: C.accent, fontSize: 10.5, letterSpacing: ".04em", marginBottom: 3 }}>symmetry &amp; colour</div>
            <Row k="transposition">{transWord}</Row>
            <Row k="inversion">{invWord}</Row>
            <Row k="complement">{a.comp.length ? `${a.comp.map((p) => NOTE[p]).join(" ")}  (${a.comp.length})` : "— (aggregate)"}</Row>
            <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center" }}>
              <ColourChip title="tonal" color={a.tc} />
              <ColourChip title="interval" color={a.ic} />
            </div>
          </section>

          <section>
            <div style={{ color: C.accent, fontSize: 10.5, letterSpacing: ".04em", marginBottom: 4 }}>
              names {a.names.length ? "" : "· none exact"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {a.names.map((m, i) => (
                <button
                  key={i}
                  disabled={m.kind !== "scale"}
                  onClick={() => m.scaleKey && onApplyScale(m.rootPc, m.scaleKey)}
                  title={m.kind === "scale" ? "Apply this scale to the explorer" : "Chord match"}
                  style={{
                    ...chip(true, m.kind === "scale" ? "teal" : "accent"),
                    cursor: m.kind === "scale" ? "pointer" : "default",
                  }}
                >
                  {NOTE[m.rootPc]} {m.name}
                  {m.pushAvailable ? <span style={{ color: C.faint, fontSize: 9 }}> ·P3</span> : null}
                </button>
              ))}
              {!a.names.length && <span style={{ color: C.faint }}>not a catalog scale or chord at any transposition</span>}
            </div>
          </section>

          {a.containers.length > 0 && (
            <section>
              <div style={{ color: C.accent, fontSize: 10.5, letterSpacing: ".04em", marginBottom: 4 }}>sits inside · tap to apply</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {a.containers.map((m, i) => (
                  <button key={i} style={{ ...chip(false), cursor: "pointer" }} onClick={() => onApplyScale(m.root, m.scale)} title={`${m.extra} extra note${m.extra === 1 ? "" : "s"}`}>
                    {NOTE[m.root]} {m.scale}<span style={{ color: C.faint, fontSize: 9 }}> +{m.extra}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {a.modes.length > 1 && (
            <section>
              <div style={{ color: C.accent, fontSize: 10.5, letterSpacing: ".04em", marginBottom: 3 }}>modes · {a.modes.length} rotations</div>
              {a.modes.map((m) => (
                <Row key={m.degree} k={`${m.degree} · ${NOTE[m.rootPc]}`}>
                  <span style={{ color: C.faint }}>[{m.intervals.join(" ")}]</span>
                  {m.name ? <span style={{ color: C.teal }}>  {m.name}</span> : null}
                </Row>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ColourChip({ title, color }: { title: string; color: { css: string; hue: number; focus: number } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 26, height: 18, borderRadius: 4, background: color.css, border: "1px solid #2a3340" }} />
      <span style={{ fontSize: 10, color: "#5b6675" }}>{title} · {Math.round(color.hue)}° · {color.focus.toFixed(2)}</span>
    </div>
  );
}
