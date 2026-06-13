// App shell: owns all UI state, derives the grid / piano / chord / highlight
// data, and composes the stage (transport, grid, piano-roll, piano) with the
// control panel. The pure music-theory + MIDI logic lives in lib/* and hooks/*;
// this file is the wiring.

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import "./styles/theme.css";
import {
  SHARP, FLAT, FLAT_KEYS, SCALES, CHROMA_INT, INKEY_INT,
  QUALITIES, SYM, DEG_NUM, DEG_ROM, DEG_SOL,
  mod, pcOf, octOf, buildVoicing,
} from "./lib/theory";
import type { ScaleName, QualityKey } from "./lib/theory/constants";
import type { Voicing } from "./lib/theory/types";
import { PIANO_LO, PIANO_HI, WHITE_PCS, BLACK_PCS } from "./geometry/piano";
import { useAudioContext } from "./hooks/useAudioContext";
import { useLiveInput } from "./hooks/useLiveInput";
import { usePlayback } from "./hooks/usePlayback";
import { useCoalescedNotes } from "./hooks/useCoalescedNotes";
import TransportBar from "./components/TransportBar";
import PianoRoll from "./components/PianoRoll";
import Grid from "./components/Grid";
import Piano from "./components/Piano";
import Bracelet from "./components/Bracelet";
import Tonnetz from "./components/Tonnetz";
import ControlPanels from "./components/ControlPanels";
import { parseTonalityAnalysis, qualitySymbol, nameChord, analyzeMidi, scaleToEngineKey, type FileAnalysis, type ChordNaming } from "./lib/tonality";
import { useBridge } from "./hooks/useBridge";
import { Dot } from "./ui/primitives";
import type {
  Interaction, GridMode, Layout, Orient, LabelMode, NoteNotation,
  DegNotation, DegRef, ChordDisplay, Cell, GridCell, WhiteKey, BlackKey, KeyAccent, BuiltChord,
} from "./ui/types";

type ViewKey = "grid" | "pianoRoll" | "piano" | "bracelet" | "tonnetz";
const VIEW_DEFS: { key: ViewKey; label: string }[] = [
  { key: "grid", label: "Push grid" },
  { key: "pianoRoll", label: "Piano roll" },
  { key: "piano", label: "Piano" },
  { key: "bracelet", label: "Bracelet" },
  { key: "tonnetz", label: "Tonnetz" },
];

export default function App() {
  const [root, setRoot] = useState(0);
  const [scaleName, setScaleName] = useState<ScaleName>("Major");
  const [mode, setMode] = useState<GridMode>("inkey");
  const [fixed, setFixed] = useState(false);
  const [layout, setLayout] = useState<Layout>("4ths");
  const [orient, setOrient] = useState<Orient>("vert");
  const [labelMode, setLabelMode] = useState<LabelMode>("note");
  const [noteNot, setNoteNot] = useState<NoteNotation>("auto");
  const [degNot, setDegNot] = useState<DegNotation>("number");
  const [degRef, setDegRef] = useState<DegRef>("tonic");
  const [sound, setSound] = useState(true);

  const [interaction, setInteraction] = useState<Interaction>("build");
  const [chordOn, setChordOn] = useState(true);
  const [tapChord, setTapChord] = useState(false);
  const [chordRootPc, setChordRootPc] = useState(0);
  const [chordQuality, setChordQuality] = useState<QualityKey>("maj7");
  const [inversion, setInversion] = useState(0);
  const [voicing, setVoicing] = useState<Voicing>("close");
  const [chordDisplay, setChordDisplay] = useState<ChordDisplay>("tones");
  const [selected, setSelected] = useState<number[]>([]);

  // Tonality engine analysis of the loaded file: auto via the bridge when
  // connected, or a manually-loaded JSON (offline). midiBytesRef holds the raw
  // file so we can (re-)analyze it on demand / when the bridge connects.
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const midiBytesRef = useRef<ArrayBuffer | null>(null);

  // Optional visual modules — each surface can be shown or hidden.
  const [views, setViews] = useState<Record<ViewKey, boolean>>({
    grid: true, pianoRoll: true, piano: true, bracelet: true, tonnetz: true,
  });
  const toggleView = (k: ViewKey) => setViews((v) => ({ ...v, [k]: !v[k] }));

  const pattern = SCALES[scaleName];
  const len = pattern.length;
  const useFlats = noteNot === "flat" || (noteNot === "auto" && FLAT_KEYS.includes(root));
  const noteName = useCallback((pc: number) => (useFlats ? FLAT : SHARP)[pc], [useFlats]);
  const inScalePc = useCallback((pc: number) => pattern.includes(mod(pc - root, 12)), [pattern, root]);

  // clamp chord root into the scale when entering In-Key mode
  useEffect(() => {
    if (mode === "inkey" && !inScalePc(chordRootPc)) {
      let best = root, bd = 99;
      pattern.forEach((pp) => {
        const pc = mod(root + pp, 12);
        const d = Math.min(mod(pc - chordRootPc, 12), mod(chordRootPc - pc, 12));
        if (d < bd) { bd = d; best = pc; }
      });
      setChordRootPc(best);
    }
  }, [mode, scaleName, root]); // eslint-disable-line

  // if the chosen quality has out-of-scale notes in In-Key mode, swap to a valid one
  useEffect(() => {
    if (mode !== "inkey") return;
    const fits = (k: QualityKey) => QUALITIES[k].iv.every((i) => inScalePc(mod(chordRootPc + i, 12)));
    if (!fits(chordQuality)) {
      const found = (Object.keys(QUALITIES) as QualityKey[]).find(fits);
      if (found) setChordQuality(found);
    }
  }, [mode, chordRootPc, scaleName, root, chordQuality]); // eslint-disable-line

  const ivCount = QUALITIES[chordQuality].iv.length;
  useEffect(() => {
    if (inversion > ivCount - 1) setInversion(ivCount - 1);
  }, [ivCount, inversion]);

  /* ----- audio ----- */
  const audio = useAudioContext();
  const getSynth = audio.getSynth;
  const playback = usePlayback(audio);

  const onMidiLoaded = useCallback((buf: ArrayBuffer) => {
    midiBytesRef.current = buf;
  }, []);

  const loadAnalysis = useCallback(async (file: File) => {
    try {
      const fa = parseTonalityAnalysis(JSON.parse(await file.text()));
      setAnalysis(fa);
      setAnalysisError(null);
    } catch (e) {
      setAnalysis(null);
      setAnalysisError(e instanceof Error ? e.message : "Failed to parse analysis");
    }
  }, []);
  const playMidi = useCallback(
    (m: number, dur = 0.55, when = 0, gMul = 1) => {
      if (!sound) return;
      try { getSynth().playMidi(m, dur, when, gMul); } catch (e) { /* ignore */ }
    },
    [sound, getSynth]
  );
  const liveNoteOn = useCallback((m: number, vel: number) => {
    if (!sound) return;
    try { getSynth().noteOn(m, vel); } catch (e) { /* ignore */ }
  }, [sound, getSynth]);
  const liveNoteOff = useCallback((m: number) => {
    try { getSynth().noteOff(m); } catch (e) { /* ignore */ }
  }, [getSynth]);

  /* ----- live input (computer keyboard + Web MIDI) ----- */
  const live = useLiveInput({ enabled: interaction === "live", onNoteOn: liveNoteOn, onNoteOff: liveNoteOff });
  const isLive = interaction === "live";
  const coalescedActive = useCoalescedNotes(playback.activeNotes, 60);
  const liveNotes = useMemo(() => {
    const s = new Set(live.heldNotes);
    for (const m of coalescedActive) s.add(m);
    return [...s].sort((a, b) => a - b);
  }, [live.heldNotes, coalescedActive]);
  const highlightSel = isLive ? liveNotes : selected;
  const litSet = useMemo(() => new Set(playback.activeNotes), [playback.activeNotes]);

  // Live engine-backed naming via the local Tonality bridge (Option B). Auto-
  // detects the bridge; falls back to the local analyzer when it's offline.
  const bridge = useBridge();

  // File analysis via the bridge (no manual script step). Sends the raw MIDI
  // bytes to /analyze_midi and parses the result into our FileAnalysis.
  const analyzeViaBridge = useCallback(async (buf: ArrayBuffer) => {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const raw = await analyzeMidi(bridge.baseUrl, buf);
      setAnalysis(parseTonalityAnalysis(raw));
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Engine analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [bridge.baseUrl]);

  // On a new file: drop the old analysis, then auto-analyze via the bridge if connected.
  useEffect(() => {
    setAnalysis(null);
    setAnalysisError(null);
    if (bridge.connected && midiBytesRef.current) analyzeViaBridge(midiBytesRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.song]);

  // If the bridge connects after a file is already loaded, analyze it then.
  useEffect(() => {
    if (bridge.connected && midiBytesRef.current && !analysis && !analyzing) {
      analyzeViaBridge(midiBytesRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.connected]);

  const [engineNaming, setEngineNaming] = useState<ChordNaming | null>(null);
  useEffect(() => {
    if (!isLive || !bridge.connected || highlightSel.length < 2) {
      setEngineNaming(null);
      return;
    }
    const pcs = Array.from(new Set(highlightSel.map(pcOf)));
    const tonic = noteName(root);
    const keyName = scaleToEngineKey(scaleName);
    const realization = [...highlightSel].sort((a, b) => a - b);
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      nameChord(bridge.baseUrl, { pcs, tonic, keyName, realizationMidi: realization }, ctrl.signal)
        .then(setEngineNaming)
        .catch(() => setEngineNaming(null));
    }, 80); // coalesce rapid changes
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [isLive, bridge.connected, bridge.baseUrl, highlightSel, root, scaleName, noteName]);

  // Pitch-class views (bracelet / Tonnetz) backdrop: the current scale's pcs.
  const scalePcs = useMemo(() => new Set(pattern.map((i) => mod(root + i, 12))), [pattern, root]);

  // Tonality's per-segment chord readings → time-aligned labels for the roll.
  const chordRegions = useMemo(() => {
    if (!analysis) return [];
    return analysis.segments.map((s) => ({
      startSec: s.startSec,
      endSec: s.endSec,
      label:
        s.rootPc != null && s.quality != null
          ? noteName(s.rootPc) + qualitySymbol(s.quality)
          : s.pcs.length === 1
            ? noteName(s.pcs[0])
            : "",
    }));
  }, [analysis, noteName]);

  // Tonality's local-key regions → a key-band strip (modulations become visible).
  const keyRegionBands = useMemo(() => {
    if (!analysis) return [];
    return analysis.keyRegions.map((r) => ({
      startSec: r.startSec,
      endSec: r.endSec,
      label: noteName(r.tonicPc) + (r.mode === "major" ? " maj" : r.mode === "minor" ? " min" : " " + r.mode),
    }));
  }, [analysis, noteName]);

  /* ----- build chord ----- */
  const voiceChord = useCallback(
    (rootMidi: number) => buildVoicing(rootMidi, chordQuality, inversion, voicing),
    [chordQuality, inversion, voicing]
  );

  const chord = useMemo<BuiltChord>(() => {
    const iv = QUALITIES[chordQuality].iv;
    const closePcs = Array.from(new Set(iv.map((i) => pcOf(48 + chordRootPc + i))));
    return { closePcs, voicing: voiceChord(48 + chordRootPc), symbol: noteName(chordRootPc) + SYM[chordQuality] };
  }, [chordQuality, chordRootPc, voiceChord, noteName]);

  // Active pitch classes for the diagrams: the built chord (Build) or the
  // selected/sounding notes (Analyze/Live).
  const activePcs = useMemo(() => {
    if (interaction === "build") return chordOn ? chord.closePcs : [];
    return Array.from(new Set(highlightSel.map(pcOf)));
  }, [interaction, chordOn, chord, highlightSel]);

  // Chord root for the diagrams: the explicit chord root (Build), else the bass
  // (lowest sounding) pc (Analyze/Live). null = nothing to mark.
  const diagramRootPc =
    interaction === "build"
      ? chordOn
        ? chordRootPc
        : null
      : highlightSel.length
        ? pcOf(Math.min(...highlightSel))
        : null;

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
  const grid = useMemo<GridCell[][]>(() => {
    const baseRootMidi = 36 + root;
    const pitchOf = (i: number) => {
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

    const rows: GridCell[][] = [];
    for (let r = 0; r < 8; r++) {
      const row: GridCell[] = [];
      for (let c = 0; c < 8; c++) {
        const stepR = orient === "vert" ? interval : 1;
        const stepC = orient === "vert" ? 1 : interval;
        const midi = mode === "inkey" ? pitchOf(baseIdx + r * stepR + c * stepC) : baseMidi + r * stepR + c * stepC;
        const pc = pcOf(midi);
        const inScale = inScalePc(pc);
        const isRoot = pc === root;

        let isTone = false, isCRoot = false, isVoice = false;
        let voiceNum: number | null = null;
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
        row.push({ midi, pc, inScale, isRoot, isTone, isCRoot, isVoice, voiceNum, isSel, isSelPc, isLit: litSet.has(midi), r, c });
      }
      rows.push(row);
    }
    return rows;
  }, [root, scaleName, mode, fixed, layout, orient, len, pattern, inScalePc, chordOn, chordDisplay, chord, chordRootPc, interaction, highlightSel, litSet]);

  const bottomLeft = grid[0][0];

  /* ----- piano keyboard ----- */
  const piano = useMemo<{ whites: WhiteKey[]; blacks: BlackKey[] }>(() => {
    const selSet = new Set(highlightSel);
    const selPcs = new Set(highlightSel.map(pcOf));
    const make = (midi: number): Cell => {
      const pc = pcOf(midi);
      const inScale = inScalePc(pc);
      const isRoot = pc === root;
      let isTone = false, isCRoot = false, isVoice = false;
      let voiceNum: number | null = null;
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
      return { midi, pc, inScale, isRoot, isTone, isCRoot, isVoice, voiceNum, isSel, isSelPc, isLit: litSet.has(midi) };
    };
    const whites: WhiteKey[] = [], blacks: BlackKey[] = [];
    for (let m = PIANO_LO; m <= PIANO_HI; m++) {
      if (WHITE_PCS.includes(mod(m, 12))) {
        const wi = whites.length;
        whites.push(make(m));
        const nb = m + 1;
        if (nb <= PIANO_HI && BLACK_PCS.includes(mod(nb, 12))) blacks.push({ ...make(nb), after: wi });
      }
    }
    return { whites, blacks };
  }, [root, scaleName, inScalePc, chordOn, chordDisplay, chord, chordRootPc, interaction, highlightSel, litSet]);

  /* ----- labels ----- */
  const degLabel = (rel: number) => (degNot === "roman" ? DEG_ROM[rel] : degNot === "solfege" ? DEG_SOL[rel] : DEG_NUM[rel]);
  const padMain = (p: Cell) => (labelMode === "note" ? noteName(p.pc) : degLabel(mod(p.pc - refPc, 12)));
  // Pitch-class label honoring the Labels settings — for the bracelet / Tonnetz.
  const pcLabel = (pc: number) => (labelMode === "note" ? noteName(pc) : degLabel(mod(pc - refPc, 12)));

  /* ----- pad style ----- */
  const padStyle = (p: Cell): React.CSSProperties => {
    let bg: string, color: string, border: string, glow: string;
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
    if (p.isLit) {
      bg = "#0c3b36"; color = "#defff8"; border = "1px solid #7fffe9";
      glow = "0 0 18px rgba(126,255,233,.9), inset 0 0 11px rgba(126,255,233,.5)";
    }
    return { background: bg, color, border, boxShadow: glow };
  };

  const keyAccent = (p: Cell): KeyAccent | null => {
    if (p.isLit) return { c: "#7fffe9", strong: true };
    if (p.isSel) return { c: "#fbbf24", strong: true };
    if (p.isSelPc) return { c: "#d97706", dashed: true };
    if (p.isVoice || p.isCRoot) return { c: "#fbbf24", strong: true, badge: p.voiceNum };
    if (p.isTone) return { c: "#f59e0b" };
    if (p.isRoot) return { c: "#a5b4fc", strong: true };
    if (p.inScale) return { c: "#2dd4bf" };
    return null;
  };

  const onPad = (p: Cell) => {
    if (interaction === "analyze") {
      playMidi(p.midi);
      setSelected((s) => (s.includes(p.midi) ? s.filter((m) => m !== p.midi) : [...s, p.midi]));
      return;
    }
    if (interaction === "live") {
      playMidi(p.midi);
      return;
    }
    if (chordOn && tapChord) {
      voiceChord(p.midi).forEach((m, i) => playMidi(m, 1.0, i * 0.03, 0.85));
    } else {
      playMidi(p.midi);
    }
    if (chordOn) setChordRootPc(p.pc);
  };

  // Clicking a pitch class on the bracelet / Tonnetz behaves like a pad tap, in a
  // fixed middle register (these views are octave-less).
  const onPickPc = (pc: number) => {
    const midi = 60 + pc; // C3..B3
    if (interaction === "analyze") {
      playMidi(midi);
      setSelected((s) => (s.includes(midi) ? s.filter((m) => m !== midi) : [...s, midi]));
      return;
    }
    if (interaction === "live") {
      playMidi(midi);
      return;
    }
    if (chordOn && tapChord) {
      voiceChord(midi).forEach((m, i) => playMidi(m, 1.0, i * 0.03, 0.85));
    } else {
      playMidi(midi);
    }
    if (chordOn) setChordRootPc(pc);
  };

  const layoutNote =
    layout === "seq"
      ? "Sequential — every note in order, no duplicates."
      : (orient === "vert" ? "Each row up" : "Each column right") + " = a " + (layout === "4ths" ? "4th" : "3rd") + " higher.";

  return (
    <div className="px-root">
      <header className="px-head">
        <div className="px-head-l">
          <div className="px-kicker">{"ABLETON PUSH 3 · NOTE MODE"}</div>
          <h1 className="px-title">Scale &amp; Chord Explorer</h1>
        </div>
        <div className="px-readout">
          <span className="px-ro-lbl">bottom-left pad</span>
          <span className="px-ro-val">{noteName(bottomLeft.pc)}<sub>{octOf(bottomLeft.midi)}</sub></span>
        </div>
      </header>

      <div className="px-body">
        <section className="px-stage">
          <div className="px-views">
            <span className="px-views-cap">Views</span>
            {VIEW_DEFS.map(({ key, label }) => (
              <button
                key={key}
                className={"px-view-chip" + (views[key] ? " on" : "")}
                onClick={() => toggleView(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="px-stage-block">
            <div className="px-block-cap">Transport</div>
            <TransportBar
              playback={playback}
              onLoadAnalysis={loadAnalysis}
              onMidiLoaded={onMidiLoaded}
              onAnalyzeViaBridge={() => midiBytesRef.current && analyzeViaBridge(midiBytesRef.current)}
              bridgeConnected={bridge.connected}
              analyzing={analyzing}
              hasAnalysis={!!analysis}
              analysisError={analysisError}
            />
          </div>

          {views.grid && (
            <div className="px-stage-block">
              <div className="px-block-cap">Push grid</div>
              <Grid rows={grid} styleOf={padStyle} label={padMain} labelMode={labelMode} onPad={onPad} />
            </div>
          )}

          {views.pianoRoll && (
            <div className="px-stage-block">
              <div className="px-block-cap">Piano roll</div>
              <PianoRoll
                song={playback.song}
                currentTime={playback.currentTime}
                duration={playback.duration}
                activeNotes={playback.activeNotes}
                onSeek={playback.seek}
                regions={chordRegions}
                keyRegions={keyRegionBands}
              />
            </div>
          )}

          {views.piano && (
            <div className="px-stage-block">
              <div className="px-block-cap">Piano · C2 – C6</div>
              <Piano whites={piano.whites} blacks={piano.blacks} accentOf={keyAccent} label={padMain} labelMode={labelMode} onPad={onPad} />
            </div>
          )}

          {(views.bracelet || views.tonnetz) && (
            <div className="px-stage-block">
              <div className="px-block-cap">Diagrams</div>
              <div className="px-diagrams">
                {views.bracelet && (
                  <div className="px-diagram">
                    <div className="px-diagram-cap">Bracelet</div>
                    <Bracelet rootPc={root} chordRootPc={diagramRootPc} scalePcs={scalePcs} activePcs={activePcs} label={pcLabel} onPick={onPickPc} />
                  </div>
                )}
                {views.tonnetz && (
                  <div className="px-diagram">
                    <div className="px-diagram-cap">Tonnetz · drag to pan</div>
                    <Tonnetz rootPc={root} chordRootPc={diagramRootPc} scalePcs={scalePcs} activePcs={activePcs} label={pcLabel} onPick={onPickPc} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="px-legend">
            <Dot c="#a5b4fc" t="root / tonic" />
            <Dot c="#2dd4bf" t="in scale" />
            {mode === "chromatic" && <Dot c="#f87171" t="out of scale" />}
            <Dot c="#fbbf24" t={isLive ? "playing" : interaction === "analyze" ? "selected" : chordDisplay === "voicing" ? "voicing note" : "chord tone"} />
            <span className="px-legend-note">{layoutNote}</span>
          </div>
        </section>

        <ControlPanels
          root={root} setRoot={setRoot}
          scaleName={scaleName} setScaleName={(s) => setScaleName(s as ScaleName)}
          mode={mode} setMode={setMode}
          fixed={fixed} setFixed={setFixed}
          layout={layout} setLayout={setLayout}
          orient={orient} setOrient={setOrient}
          labelMode={labelMode} setLabelMode={setLabelMode}
          noteNot={noteNot} setNoteNot={setNoteNot}
          degNot={degNot} setDegNot={setDegNot}
          degRef={degRef} setDegRef={setDegRef}
          interaction={interaction} setInteraction={setInteraction}
          chordOn={chordOn} setChordOn={setChordOn}
          tapChord={tapChord} setTapChord={setTapChord}
          chordRootPc={chordRootPc} setChordRootPc={setChordRootPc}
          chordQuality={chordQuality} setChordQuality={setChordQuality}
          inversion={inversion} setInversion={setInversion}
          voicing={voicing} setVoicing={setVoicing}
          chordDisplay={chordDisplay} setChordDisplay={setChordDisplay}
          selected={selected} setSelected={setSelected}
          sound={sound} setSound={setSound}
          noteName={noteName} inScalePc={inScalePc} isLive={isLive}
          chord={chord} highlightSel={highlightSel} liveNotes={liveNotes} litSet={litSet}
          live={live} song={playback.song} playMidi={playMidi} analysis={analysis}
          showLayout={views.grid}
          engineNaming={engineNaming} bridgeConnected={bridge.connected}
        />
      </div>
    </div>
  );
}
