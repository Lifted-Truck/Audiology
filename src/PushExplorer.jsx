import React, { useState, useMemo, useEffect, useCallback } from "react";
import "./styles/theme.css";
import {
  SHARP, FLAT, FLAT_KEYS, SCALES, CHROMA_INT, INKEY_INT,
  QUALITIES, QUAL_CATS, SYM, DEG_NUM, DEG_ROM, DEG_SOL,
  mod, pcOf, octOf, buildVoicing, analyzeSelection,
} from "./lib/theory";
import { PIANO_LO, PIANO_HI, WHITE_PCS, BLACK_PCS, WW, BW, WH, BH } from "./geometry/piano";
import { useAudioContext } from "./hooks/useAudioContext";
import { useLiveInput, ALL_INPUTS } from "./hooks/useLiveInput";
import { usePlayback } from "./hooks/usePlayback";
import TransportBar from "./components/TransportBar";
import { KEY_TO_SEMITONE, OCTAVE_DOWN_KEY, OCTAVE_UP_KEY } from "./lib/midi/input";

/* ------------------------------------------------------------------ */
/*  UI PRIMITIVES                                                      */
/* ------------------------------------------------------------------ */

function Field({ label, children }) {
  return (
    <div className="field">
      <span className="field-lbl">{label}</span>
      {children}
    </div>
  );
}

function Seg({ options, value, onChange, small }) {
  return (
    <div className={"seg" + (small ? " sm" : "")}>
      {options.map((o) => (
        <button key={String(o.v)} className={"seg-btn" + (value === o.v ? " on" : "")} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Sel({ value, onChange, children }) {
  return (
    <div className="sel-wrap">
      <select className="sel" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <span className="sel-arrow">{"\u25be"}</span>
    </div>
  );
}

function PcChips({ value, onChange, noteName, disabledFn, outFn }) {
  return (
    <div className="px-pcrow">
      {Array.from({ length: 12 }, (_, pc) => {
        const dis = disabledFn ? disabledFn(pc) : false;
        const out = outFn ? outFn(pc) : false;
        return (
          <button
            key={pc}
            disabled={dis}
            className={"px-pc" + (value === pc ? " sel" : "") + (out ? " out" : "") + (dis ? " dis" : "")}
            onClick={() => onChange(pc)}
          >
            {noteName(pc)}
          </button>
        );
      })}
    </div>
  );
}

function Dot({ c, t, ring }) {
  return (
    <span className="px-leg-item">
      <span className="px-leg-dot" style={{ background: ring ? "transparent" : c, border: ring ? "1px solid " + c : "none" }} />
      {t}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN                                                               */
/* ------------------------------------------------------------------ */

export default function PushExplorer() {
  const [root, setRoot] = useState(0);
  const [scaleName, setScaleName] = useState("Major");
  const [mode, setMode] = useState("inkey");
  const [fixed, setFixed] = useState(false);
  const [layout, setLayout] = useState("4ths");
  const [orient, setOrient] = useState("vert");
  const [labelMode, setLabelMode] = useState("note");
  const [noteNot, setNoteNot] = useState("auto");
  const [degNot, setDegNot] = useState("number");
  const [degRef, setDegRef] = useState("tonic");
  const [sound, setSound] = useState(true);

  const [interaction, setInteraction] = useState("build"); // build | analyze
  const [chordOn, setChordOn] = useState(true);
  const [tapChord, setTapChord] = useState(false);
  const [chordRootPc, setChordRootPc] = useState(0);
  const [chordQuality, setChordQuality] = useState("maj7");
  const [inversion, setInversion] = useState(0);
  const [voicing, setVoicing] = useState("close");
  const [chordDisplay, setChordDisplay] = useState("tones");
  const [selected, setSelected] = useState([]); // midi notes

  const pattern = SCALES[scaleName];
  const len = pattern.length;
  const useFlats = noteNot === "flat" || (noteNot === "auto" && FLAT_KEYS.includes(root));
  const noteName = useCallback((pc) => (useFlats ? FLAT : SHARP)[pc], [useFlats]);
  const inScalePc = useCallback((pc) => pattern.includes(mod(pc - root, 12)), [pattern, root]);

  // clamp chord root into the scale when entering In-Key mode
  useEffect(() => {
    if (mode === "inkey" && !inScalePc(chordRootPc)) {
      let best = root, bd = 99;
      pattern.forEach((p) => {
        const pc = mod(root + p, 12);
        const d = Math.min(mod(pc - chordRootPc, 12), mod(chordRootPc - pc, 12));
        if (d < bd) { bd = d; best = pc; }
      });
      setChordRootPc(best);
    }
  }, [mode, scaleName, root]); // eslint-disable-line

  // if the chosen quality has out-of-scale notes in In-Key mode, swap to a valid one
  useEffect(() => {
    if (mode !== "inkey") return;
    const fits = (k) => QUALITIES[k].iv.every((i) => inScalePc(mod(chordRootPc + i, 12)));
    if (!fits(chordQuality)) {
      const found = Object.keys(QUALITIES).find(fits);
      if (found) setChordQuality(found);
    }
  }, [mode, chordRootPc, scaleName, root, chordQuality]); // eslint-disable-line

  const ivCount = QUALITIES[chordQuality].iv.length;
  useEffect(() => {
    if (inversion > ivCount - 1) setInversion(ivCount - 1);
  }, [ivCount, inversion]);

  /* ----- audio ----- */
  // One AudioContext, one synth, shared by taps, live play, and playback.
  const audio = useAudioContext();
  const getSynth = audio.getSynth;
  const playback = usePlayback(audio);
  const playMidi = useCallback(
    (m, dur = 0.55, when = 0, gMul = 1) => {
      if (!sound) return;
      try { getSynth().playMidi(m, dur, when, gMul); } catch (e) {}
    },
    [sound]
  );
  // Sustained voices for Live play — held while a key / MIDI note is down.
  const liveNoteOn = useCallback((m, vel) => {
    if (!sound) return;
    try { getSynth().noteOn(m, vel); } catch (e) {}
  }, [sound]);
  const liveNoteOff = useCallback((m) => {
    try { getSynth().noteOff(m); } catch (e) {}
  }, []);

  /* ----- live input (computer keyboard + Web MIDI) ----- */
  const live = useLiveInput({
    enabled: interaction === "live",
    onNoteOn: liveNoteOn,
    onNoteOff: liveNoteOff,
  });
  const isLive = interaction === "live";
  // In Live mode the held notes drive highlighting + analysis; in Analyze mode
  // the manual selection does. Build mode highlights the constructed chord.
  const highlightSel = isLive ? live.heldNotes : selected;

  /* ----- build chord ----- */
  // voice the current quality/inversion/voicing for any root midi note
  const voiceChord = useCallback(
    (rootMidi) => buildVoicing(rootMidi, chordQuality, inversion, voicing),
    [chordQuality, inversion, voicing]
  );

  const chord = useMemo(() => {
    const iv = QUALITIES[chordQuality].iv;
    const closePcs = Array.from(new Set(iv.map((i) => pcOf(48 + chordRootPc + i))));
    return { closePcs, voicing: voiceChord(48 + chordRootPc), symbol: noteName(chordRootPc) + SYM[chordQuality] };
  }, [chordQuality, chordRootPc, voiceChord, noteName]);

  const analysis = useMemo(() => analyzeSelection(highlightSel, noteName), [highlightSel, noteName]);

  // Whether the sounding/selected notes sit inside the current scale, plus which
  // pitch classes (if any) fall outside it.
  const keyCheck = useMemo(() => {
    const pcs = Array.from(new Set(highlightSel.map(pcOf)));
    if (pcs.length === 0) return null;
    const out = pcs.filter((pc) => !inScalePc(pc));
    return { inKey: out.length === 0, out };
  }, [highlightSel, inScalePc]);

  /* ----- reference for degree labels ----- */
  const refPc =
    degRef === "root"
      ? interaction === "analyze" || isLive
        ? highlightSel.length
          ? pcOf(Math.min(...highlightSel))
          : root
        : chordRootPc
      : root;

  /* ----- grid ----- */
  const grid = useMemo(() => {
    const baseRootMidi = 36 + root;
    const pitchOf = (i) => {
      const oct = Math.floor(i / len);
      return baseRootMidi + oct * 12 + pattern[mod(i, len)];
    };
    const interval = (mode === "inkey" ? INKEY_INT : CHROMA_INT)[layout];

    let baseIdx = 0, baseMidi = 0;
    if (mode === "inkey") {
      if (fixed) {
        let best = 0, bd = Infinity;
        for (let i = -30; i <= 50; i++) {
          const d = Math.abs(pitchOf(i) - 36);
          if (d < bd) { bd = d; best = i; }
        }
        baseIdx = best;
      }
    } else baseMidi = fixed ? 36 : 36 + root;

    const selSet = new Set(highlightSel);
    const selPcs = new Set(highlightSel.map(pcOf));

    const rows = [];
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (let c = 0; c < 8; c++) {
        const stepR = orient === "vert" ? interval : 1;
        const stepC = orient === "vert" ? 1 : interval;
        const midi = mode === "inkey" ? pitchOf(baseIdx + r * stepR + c * stepC) : baseMidi + r * stepR + c * stepC;
        const pc = pcOf(midi);
        const inScale = inScalePc(pc);
        const isRoot = pc === root;

        let isTone = false, isCRoot = false, isVoice = false, voiceNum = null;
        let isSel = false, isSelPc = false;
        if (interaction === "build" && chordOn) {
          isTone = chordDisplay === "tones" && chord.closePcs.includes(pc);
          isCRoot = isTone && pc === chordRootPc;
          isVoice = chordDisplay === "voicing" && chord.voicing.includes(midi);
          voiceNum = isVoice ? chord.voicing.indexOf(midi) + 1 : null;
        } else if (interaction === "analyze" || interaction === "live") {
          isSel = selSet.has(midi);
          isSelPc = !isSel && selPcs.has(pc);
        }
        row.push({ midi, pc, inScale, isRoot, isTone, isCRoot, isVoice, voiceNum, isSel, isSelPc, r, c });
      }
      rows.push(row);
    }
    return rows;
  }, [root, scaleName, mode, fixed, layout, orient, len, pattern, inScalePc, chordOn, chordDisplay, chord, chordRootPc, interaction, highlightSel]);

  const bottomLeft = grid[0][0];

  /* ----- piano keyboard ----- */
  const piano = useMemo(() => {
    const selSet = new Set(highlightSel);
    const selPcs = new Set(highlightSel.map(pcOf));
    const make = (midi) => {
      const pc = pcOf(midi);
      const inScale = inScalePc(pc);
      const isRoot = pc === root;
      let isTone = false, isCRoot = false, isVoice = false, voiceNum = null;
      let isSel = false, isSelPc = false;
      if (interaction === "build" && chordOn) {
        isTone = chordDisplay === "tones" && chord.closePcs.includes(pc);
        isCRoot = isTone && pc === chordRootPc;
        isVoice = chordDisplay === "voicing" && chord.voicing.includes(midi);
        voiceNum = isVoice ? chord.voicing.indexOf(midi) + 1 : null;
      } else if (interaction === "analyze" || interaction === "live") {
        isSel = selSet.has(midi);
        isSelPc = !isSel && selPcs.has(pc);
      }
      return { midi, pc, inScale, isRoot, isTone, isCRoot, isVoice, voiceNum, isSel, isSelPc };
    };
    const whites = [], blacks = [];
    for (let m = PIANO_LO; m <= PIANO_HI; m++) {
      if (WHITE_PCS.includes(mod(m, 12))) {
        const wi = whites.length;
        whites.push(make(m));
        const nb = m + 1;
        if (nb <= PIANO_HI && BLACK_PCS.includes(mod(nb, 12))) blacks.push({ ...make(nb), after: wi });
      }
    }
    return { whites, blacks };
  }, [root, scaleName, inScalePc, chordOn, chordDisplay, chord, chordRootPc, interaction, highlightSel]);

  /* ----- labels ----- */
  const degLabel = (rel) => (degNot === "roman" ? DEG_ROM[rel] : degNot === "solfege" ? DEG_SOL[rel] : DEG_NUM[rel]);
  const padMain = (p) => (labelMode === "note" ? noteName(p.pc) : degLabel(mod(p.pc - refPc, 12)));

  /* ----- pad style ----- */
  const padStyle = (p) => {
    let bg, color, border, glow;
    if (p.isRoot) {
      bg = "#1d2540"; color = "#eef2ff"; border = "1px solid #a5b4fc";
      glow = "0 0 13px rgba(165,180,252,.5), inset 0 0 9px rgba(165,180,252,.28)";
    } else if (p.inScale) {
      bg = "#0a2825"; color = "#5eead4"; border = "1px solid #2dd4bf"; glow = "0 0 7px rgba(45,212,191,.28)";
    } else {
      bg = "#1d0f12"; color = "#f87171"; border = "1px solid #5b1d22"; glow = "none";
    }
    const out = !p.inScale;
    if (p.isSel) {
      bg = "#4a2f06"; color = "#fde68a"; border = "1px solid #fbbf24";
      glow = "0 0 17px rgba(251,191,36,.72), inset 0 0 11px rgba(251,191,36,.38)";
    } else if (p.isSelPc) {
      border = "1px dashed #d97706"; color = "#fcd34d";
    } else if (p.isVoice || p.isCRoot) {
      bg = out ? "#3a0f12" : (p.isCRoot ? "#4a2f06" : "#3a2a08");
      color = out ? "#fca5a5" : "#fde68a";
      border = "1px solid " + (out ? "#ef4444" : p.isCRoot ? "#fbbf24" : "#f59e0b");
      glow = out
        ? "0 0 15px rgba(239,68,68,.6), inset 0 0 10px rgba(239,68,68,.3)"
        : "0 0 16px rgba(251,191,36,.7), inset 0 0 10px rgba(251,191,36,.35)";
    } else if (p.isTone) {
      color = out ? "#fca5a5" : "#fcd34d";
      border = "1px solid " + (out ? "#ef4444" : "#f59e0b");
      glow = out ? "0 0 10px rgba(239,68,68,.45)" : "0 0 10px rgba(245,158,11,.45), inset 0 0 8px rgba(245,158,11,.22)";
    }
    return { background: bg, color, border, boxShadow: glow };
  };

  // accent color + emphasis for a piano key given its highlight flags
  const keyAccent = (p) => {
    if (p.isSel) return { c: "#fbbf24", strong: true };
    if (p.isSelPc) return { c: "#d97706", dashed: true };
    if (p.isVoice || p.isCRoot) return { c: "#fbbf24", strong: true, badge: p.voiceNum };
    if (p.isTone) return { c: "#f59e0b" };
    if (p.isRoot) return { c: "#a5b4fc", strong: true };
    if (p.inScale) return { c: "#2dd4bf" };
    return null;
  };

  const onPad = (p) => {
    if (interaction === "analyze") {
      playMidi(p.midi);
      setSelected((s) => (s.includes(p.midi) ? s.filter((m) => m !== p.midi) : [...s, p.midi]));
      return;
    }
    if (interaction === "live") {
      // Live highlighting follows held keys/MIDI; clicking a pad is just a tap.
      playMidi(p.midi);
      return;
    }
    // build mode
    if (chordOn && tapChord) {
      voiceChord(p.midi).forEach((m, i) => playMidi(m, 1.0, i * 0.03, 0.85));
    } else {
      playMidi(p.midi);
    }
    if (chordOn) setChordRootPc(p.pc);
  };

  const playChord = () => chord.voicing.forEach((m, i) => playMidi(m, 1.1, i * 0.04, 0.85));
  const playSelection = () => [...selected].sort((a, b) => a - b).forEach((m, i) => playMidi(m, 1.1, i * 0.04, 0.85));

  const layoutNote =
    layout === "seq"
      ? "Sequential \u2014 every note in order, no duplicates."
      : (orient === "vert" ? "Each row up" : "Each column right") + " = a " + (layout === "4ths" ? "4th" : "3rd") + " higher.";

  const qualFits = (k) => QUALITIES[k].iv.every((i) => inScalePc(mod(chordRootPc + i, 12)));

  // Shared analysis readout — used by both Analyze and Live panels. Wrapped in a
  // fixed-min-height slot so the panel doesn't reflow / jump while you play.
  const renderAnalysis = () => (
    <div className="px-analysis-slot">
      {keyCheck && (
        <div className={"px-keycheck" + (keyCheck.inKey ? " in" : " out")}>
          <span className="px-keycheck-dot" />
          {keyCheck.inKey
            ? "In key — " + noteName(root) + " " + scaleName
            : "Out of key: " + keyCheck.out.map(noteName).join(", ")}
        </div>
      )}
      {analysis.empty && <div className="px-analyze-empty">{isLive ? "Play some notes to identify them." : "No notes selected yet."}</div>}
      {analysis.single && <div className="px-analyze-empty">{analysis.text}</div>}
      {analysis.none && (
        <div className="px-analyze-empty">
          No standard name. Bass {noteName(analysis.bassPc)}; intervals from bass: {analysis.intervals.join(", ")} semitones.
        </div>
      )}
      {analysis.candidates && (
        <div className="px-cands">
          {analysis.candidates.map((c, i) => (
            <div key={i} className={"px-cand" + (c.primary ? " primary" : "")}>
              <span className="px-cand-name">{c.name}</span>
              <span className="px-cand-sub">{c.sub}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Computer-keyboard cheat-sheet for Live mode (white keys, in pitch order).
  const keyHints = Object.entries(KEY_TO_SEMITONE)
    .filter(([, s]) => WHITE_PCS.includes(mod(s, 12)))
    .map(([k]) => k.toUpperCase());

  return (
    <div className="px-root">
      <header className="px-head">
        <div className="px-head-l">
          <div className="px-kicker">{"ABLETON PUSH 3 \u00b7 NOTE MODE"}</div>
          <h1 className="px-title">Scale &amp; Chord Explorer</h1>
        </div>
        <div className="px-readout">
          <span className="px-ro-lbl">bottom-left pad</span>
          <span className="px-ro-val">{noteName(bottomLeft.pc)}<sub>{octOf(bottomLeft.midi)}</sub></span>
        </div>
      </header>

      <div className="px-body">
        {/* ---------------- STAGE ---------------- */}
        <section className="px-stage">
          <div className="px-stage-block">
            <div className="px-block-cap">Transport</div>
            <TransportBar playback={playback} />
          </div>

          <div className="px-stage-block">
            <div className="px-block-cap">Push grid</div>
            <div className="px-grid-wrap">
            <div className="px-grid">
              {grid.slice().reverse().map((row) =>
                row.map((p) => (
                  <button key={p.r + "-" + p.c} className="px-pad" style={padStyle(p)} onClick={() => onPad(p)}>
                    <span className="px-pad-main">{padMain(p)}</span>
                    {labelMode === "note" && <span className="px-pad-oct">{octOf(p.midi)}</span>}
                    {p.isVoice && <span className="px-pad-voice">{p.voiceNum}</span>}
                  </button>
                ))
              )}
            </div>
            </div>
          </div>

          <div className="px-stage-block">
            <div className="px-block-cap">Piano · C2 – C6</div>
            <div className="px-piano-scroll">
              <div className="px-piano" style={{ width: piano.whites.length * WW, height: WH }}>
                {piano.whites.map((p, i) => {
                  const a = keyAccent(p);
                  const lit = a && !a.dashed;
                  return (
                    <button
                      key={p.midi}
                      className={"px-wkey" + (lit ? " lit" : "") + (a && a.strong ? " strong" : "")}
                      style={{
                        left: i * WW, width: WW, height: WH,
                        background: lit ? a.c : undefined,
                        boxShadow: a && a.strong ? "0 0 14px " + a.c : undefined,
                        ...(a && a.dashed ? { borderColor: a.c, borderStyle: "dashed" } : {}),
                      }}
                      onClick={() => onPad(p)}
                    >
                      {a && a.badge && <span className="px-pad-voice">{a.badge}</span>}
                      <span className="px-key-lbl" style={{ color: lit ? "#0a0c10" : a && a.dashed ? a.c : "#2a3340" }}>{padMain(p)}</span>
                      {labelMode === "note" && <span className="px-key-oct" style={{ color: lit ? "#0a0c10" : "#9aa4b2" }}>{octOf(p.midi)}</span>}
                    </button>
                  );
                })}
                {piano.blacks.map((p) => {
                  const a = keyAccent(p);
                  const lit = a && !a.dashed;
                  return (
                    <button
                      key={p.midi}
                      className={"px-bkey" + (lit ? " lit" : "") + (a && a.strong ? " strong" : "")}
                      style={{
                        left: (p.after + 1) * WW - BW / 2, width: BW, height: BH,
                        background: lit ? a.c : undefined,
                        boxShadow: a && a.strong ? "0 0 14px " + a.c : undefined,
                        ...(a && a.dashed ? { borderColor: a.c, borderStyle: "dashed" } : {}),
                      }}
                      onClick={() => onPad(p)}
                    >
                      {a && a.badge && <span className="px-pad-voice">{a.badge}</span>}
                      <span className="px-key-lbl" style={{ color: lit ? "#0a0c10" : a && a.dashed ? a.c : "#9aa4b2" }}>{padMain(p)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="px-legend">
            <Dot c="#a5b4fc" t="root / tonic" />
            <Dot c="#2dd4bf" t="in scale" />
            {mode === "chromatic" && <Dot c="#f87171" t="out of scale" />}
            <Dot c="#fbbf24" t={isLive ? "playing" : interaction === "analyze" ? "selected" : chordDisplay === "voicing" ? "voicing note" : "chord tone"} />
            <span className="px-legend-note">{layoutNote}</span>
          </div>
        </section>

        {/* ---------------- CONTROLS ---------------- */}
        <aside className="px-panel">
          <div className="px-card">
            <h2 className="px-card-h">Key &amp; Scale</h2>
            <Field label="Root / tonic">
              <PcChips value={root} onChange={setRoot} noteName={noteName} />
            </Field>
            <Field label="Scale">
              <Sel value={scaleName} onChange={setScaleName}>
                {Object.keys(SCALES).map((s) => (<option key={s} value={s}>{s}</option>))}
              </Sel>
            </Field>
          </div>

          <div className="px-card">
            <h2 className="px-card-h">Layout</h2>
            <Field label="Pad notes">
              <Seg options={[{ v: "inkey", l: "In Key" }, { v: "chromatic", l: "Chromatic" }]} value={mode} onChange={setMode} />
            </Field>
            <Field label="Origin">
              <Seg options={[{ v: false, l: "Relative" }, { v: true, l: "Fixed (C)" }]} value={fixed} onChange={setFixed} />
            </Field>
            <Field label="Transposition">
              <Seg options={[{ v: "4ths", l: "4ths" }, { v: "3rds", l: "3rds" }, { v: "seq", l: "Seq." }]} value={layout} onChange={setLayout} />
            </Field>
            <Field label="Direction">
              <Seg options={[{ v: "vert", l: "Vertical" }, { v: "horiz", l: "Horizontal" }]} value={orient} onChange={setOrient} />
            </Field>
          </div>

          <div className="px-card">
            <h2 className="px-card-h">Labels</h2>
            <Field label="Show pads as">
              <Seg options={[{ v: "note", l: "Notes" }, { v: "degree", l: "Degrees" }]} value={labelMode} onChange={setLabelMode} />
            </Field>
            {labelMode === "note" ? (
              <Field label="Notation">
                <Seg options={[{ v: "auto", l: "Auto" }, { v: "sharp", l: "\u266f" }, { v: "flat", l: "\u266d" }]} value={noteNot} onChange={setNoteNot} />
              </Field>
            ) : (
              <>
                <Field label="Notation">
                  <Seg options={[{ v: "number", l: "1\u20137" }, { v: "roman", l: "I\u2013VII" }, { v: "solfege", l: "Do\u2013Ti" }]} value={degNot} onChange={setDegNot} />
                </Field>
                <Field label="Relative to">
                  <Seg options={[{ v: "tonic", l: "Tonic" }, { v: "root", l: interaction === "analyze" || isLive ? "Bass note" : "Chord root" }]} value={degRef} onChange={setDegRef} />
                </Field>
              </>
            )}
          </div>

          <div className="px-card">
            <div className="px-card-hrow">
              <h2 className="px-card-h">Chord</h2>
              <Seg small options={[{ v: "build", l: "Build" }, { v: "analyze", l: "Analyze" }, { v: "live", l: "Live" }]} value={interaction} onChange={setInteraction} />
            </div>

            {interaction === "build" ? (
              <>
                <div className="px-card-hrow tight">
                  <span className="field-lbl">Highlight chord</span>
                  <button className={"px-tog" + (chordOn ? " on" : "")} onClick={() => setChordOn(!chordOn)}>{chordOn ? "ON" : "OFF"}</button>
                </div>
                <div className={chordOn ? "" : "px-dim"}>
                  <div className="px-card-hrow tight">
                    <span className="field-lbl">Tap pad plays chord</span>
                    <button className={"px-tog" + (tapChord ? " on" : "")} onClick={() => setTapChord(!tapChord)}>{tapChord ? "ON" : "OFF"}</button>
                  </div>
                  <Field label="Root (or tap a pad)">
                    <PcChips
                      value={chordRootPc}
                      onChange={setChordRootPc}
                      noteName={noteName}
                      disabledFn={(pc) => mode === "inkey" && !inScalePc(pc)}
                      outFn={(pc) => !inScalePc(pc)}
                    />
                  </Field>

                  <Field label="Quality">
                    {QUAL_CATS.map((cat) => (
                      <div className="px-qgroup" key={cat}>
                        <span className="px-qcat">{cat}</span>
                        <div className="px-chips">
                          {Object.keys(QUALITIES).filter((k) => QUALITIES[k].cat === cat).map((k) => {
                            const fits = qualFits(k);
                            const dis = mode === "inkey" && !fits;
                            return (
                              <button
                                key={k}
                                disabled={dis}
                                title={fits ? "in scale" : "contains out-of-scale note(s)"}
                                className={"px-qchip" + (chordQuality === k ? " sel" : "") + (!fits ? " out" : "") + (dis ? " dis" : "")}
                                onClick={() => setChordQuality(k)}
                              >
                                {QUALITIES[k].l}
                                {!fits && <span className="px-qdot" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <span className="px-mini-legend"><span className="px-qdot static" /> contains out-of-scale note(s)</span>
                  </Field>

                  <Field label="Inversion">
                    <Seg options={Array.from({ length: ivCount }, (_, i) => ({ v: i, l: i === 0 ? "Root" : i + (["st", "nd", "rd"][i - 1] || "th") }))} value={inversion} onChange={setInversion} />
                  </Field>
                  <Field label="Voicing">
                    <Seg options={[{ v: "close", l: "Close" }, { v: "drop2", l: "Drop 2" }, { v: "drop3", l: "Drop 3" }, { v: "spread", l: "Spread" }, { v: "wide", l: "Wide" }]} value={voicing} onChange={setVoicing} />
                  </Field>
                  <Field label="Show on grid">
                    <Seg options={[{ v: "tones", l: "Tones (all)" }, { v: "voicing", l: "Voicing (exact)" }]} value={chordDisplay} onChange={setChordDisplay} />
                  </Field>

                  <div className="px-chord-out">
                    <div className="px-chord-sym">{chord.symbol}</div>
                    <div className="px-chord-notes">
                      {chord.voicing.map((m, i) => (<span key={i} className="px-chip">{noteName(pcOf(m))}<sub>{octOf(m)}</sub></span>))}
                    </div>
                    <button className="px-play" onClick={playChord}>{"\u25b6"} Play chord</button>
                  </div>
                </div>
              </>
            ) : interaction === "analyze" ? (
              <div className="px-analyze">
                <p className="px-hint">Tap pads to add them to the selection; tap again to remove. Identification updates live and surfaces multiple readings when they overlap.</p>
                {selected.length > 0 && (
                  <div className="px-chord-notes" style={{ marginTop: 10 }}>
                    {[...selected].sort((a, b) => a - b).map((m, i) => (
                      <span key={i} className="px-chip click" onClick={() => setSelected((s) => s.filter((x) => x !== m))}>
                        {noteName(pcOf(m))}<sub>{octOf(m)}</sub> {"\u00d7"}
                      </span>
                    ))}
                  </div>
                )}

                {renderAnalysis()}

                {selected.length > 0 && (
                  <div className="px-analyze-btns">
                    <button className="px-play" onClick={playSelection}>{"\u25b6"} Play</button>
                    <button className="px-clear" onClick={() => setSelected([])}>Clear</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-analyze">
                <p className="px-hint">
                  Play with your computer keyboard or a connected MIDI controller. Held notes light up the grid &amp; piano and are identified below in real time.
                </p>

                {live.midiSupported ? (
                  <Field label="MIDI input">
                    <Sel value={live.midiInputId} onChange={live.setMidiInputId}>
                      <option value={ALL_INPUTS}>All inputs</option>
                      {live.midiDevices.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                    </Sel>
                  </Field>
                ) : (
                  <p className="px-hint px-live-warn">Web MIDI isn't available in this browser \u2014 computer keyboard still works.</p>
                )}
                {live.midiSupported && !live.midiEnabled && (
                  <p className="px-hint px-live-warn">Waiting for MIDI access{"\u2026"} (allow it if your browser prompts).</p>
                )}
                {live.midiSupported && live.midiEnabled && live.midiDevices.length === 0 && (
                  <p className="px-hint">No MIDI controllers detected \u2014 connect one or use the keyboard.</p>
                )}

                <div className="px-live-row">
                  <span className="field-lbl">Octave</span>
                  <div className="px-oct">
                    <button className="px-oct-btn" onClick={() => live.setOctaveOffset(live.octaveOffset - 1)} title={"Octave down (" + OCTAVE_DOWN_KEY.toUpperCase() + ")"}>{"\u2013"}</button>
                    <span className="px-oct-val">C{3 + live.octaveOffset}</span>
                    <button className="px-oct-btn" onClick={() => live.setOctaveOffset(live.octaveOffset + 1)} title={"Octave up (" + OCTAVE_UP_KEY.toUpperCase() + ")"}>+</button>
                  </div>
                </div>

                <div className="px-keyhint">
                  <span className="px-keyhint-keys">{keyHints.join(" ")}</span> = white keys{" \u00b7 "}
                  <span className="px-keyhint-keys">W E T Y U</span> = black{" \u00b7 "}
                  <span className="px-keyhint-keys">{OCTAVE_DOWN_KEY.toUpperCase()} / {OCTAVE_UP_KEY.toUpperCase()}</span> = octave
                </div>

                <div className="px-chord-notes px-live-held">
                  {live.heldNotes.map((m, i) => (
                    <span key={i} className="px-chip">{noteName(pcOf(m))}<sub>{octOf(m)}</sub></span>
                  ))}
                </div>

                {renderAnalysis()}
              </div>
            )}
          </div>

          <div className="px-card px-card-mini">
            <button className={"px-tog wide" + (sound ? " on" : "")} onClick={() => setSound(!sound)}>{sound ? "\ud83d\udd0a Sound on" : "\ud83d\udd07 Sound off"}</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
