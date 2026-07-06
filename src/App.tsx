// App shell: owns all UI state, derives the grid / piano / chord / highlight
// data, and composes the stage (transport, grid, piano-roll, piano) with the
// control panel. The pure music-theory + MIDI logic lives in lib/* and hooks/*;
// this file is the wiring.

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import "./styles/theme.css";
import {
  SHARP, FLAT, FLAT_KEYS, SCALES,
  QUALITIES, SYM, DEG_NUM, DEG_ROM, DEG_SOL,
  mod, pcOf, octOf, buildVoicing,
} from "./lib/theory";
import type { ScaleName, QualityKey } from "./lib/theory/constants";
import type { Voicing } from "./lib/theory/types";
import {
  windowedKeyBands, structuralKeyBandsOf, segmentKeyAt, visitedKeysOf,
  tonicizationSpansOf, pivotBandsOf, chordRegionsOf,
  buildGridCells, buildPianoKeys, padStyleOf, keyAccentOf,
} from "./lib/state";
import type { ScaleContext, SurfaceSelection } from "./lib/state";
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
import ChordAnatomy from "./components/ChordAnatomy";
import CircleOfFifths from "./components/CircleOfFifths";
import ControlPanels from "./components/ControlPanels";
import { parseTonalityAnalysis, shiftAnalysis, nameChord, analyzeMidi, scaleToEngineKey, structuralKeys, modeToScaleName, type FileAnalysis, type ChordNaming, type StructuralArea, type Tonicization } from "./lib/tonality";
import { useBridge } from "./hooks/useBridge";
import { useChordFacts } from "./hooks/useChordFacts";
import { useEngineFacts } from "./hooks/useEngineFacts";
import { useEngineProcess } from "./hooks/useEngineProcess";
import { Dot } from "./ui/primitives";
import type {
  Interaction, GridMode, Layout, Orient, LabelMode, NoteNotation,
  DegNotation, DegRef, ChordDisplay, Cell, KeyAccent, BuiltChord,
} from "./ui/types";

// Stable empty fallback — a fresh [] per render would churn every downstream
// memo (and rebuild the roll's static layer) whenever no tonicizations exist.
const NO_TONICIZATIONS: Tonicization[] = [];

type ViewKey = "transport" | "grid" | "pianoRoll" | "piano" | "bracelet" | "tonnetz" | "circle" | "anatomy";
const VIEW_DEFS: { key: ViewKey; label: string }[] = [
  { key: "transport", label: "Transport" },
  { key: "pianoRoll", label: "Piano roll" },
  { key: "grid", label: "Push grid" },
  { key: "piano", label: "Piano" },
  { key: "bracelet", label: "Bracelet" },
  { key: "tonnetz", label: "Tonnetz" },
  { key: "circle", label: "Circle of 5ths" },
  { key: "anatomy", label: "Chord anatomy" },
];

export default function App() {
  const [root, setRoot] = useState(0);
  const [scaleName, setScaleName] = useState<ScaleName>("Major");
  const [mode, setMode] = useState<GridMode>("chromatic");
  const [fixed, setFixed] = useState(true);
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
  // Adapt the chord quality to the current scale (always on in In-Key mode; an
  // opt-in in Chromatic mode too). When on, picking a new root snaps the quality
  // to one whose tones are all in the scale.
  const [adaptToScale, setAdaptToScale] = useState(false);
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
  // Performed-timing coalesce window (beats) for engine file analysis. null =
  // exact (quantized files); ~0.5 (an 8th) heals humanized transcriptions that
  // otherwise over-segment — Tonality's recommended 0.25–0.5 band (response-3).
  const [coalesceWindow, setCoalesceWindow] = useState<number | null>(0.5);
  // Optional engine analysis flags (response-3 Findings B & C): the relative-
  // major/minor tie-breaker and key-region hysteresis smoothing. Off by default
  // (matching the engine), toggleable in the transport.
  const [disambigRelKeys, setDisambigRelKeys] = useState(false);
  const [smoothRegions, setSmoothRegions] = useState(false);

  // The roll's key-strip source toggle: the clean structural reduction (default)
  // vs the raw windowed key_regions ("evidence" view). The structural data itself
  // is fetched below via useEngineFacts once playback + bridge exist.
  const [keyStripMode, setKeyStripMode] = useState<"structural" | "windowed">("structural");
  // Chord strip label mode: chord names, roman numerals (relative to the local
  // key), or both. Roman is often shorter, so it fits tight bars better.
  const [chordLabelMode, setChordLabelMode] = useState<"names" | "roman" | "both">("names");

  // Optional visual modules — each surface can be shown or hidden.
  const [views, setViews] = useState<Record<ViewKey, boolean>>({
    transport: true, grid: true, pianoRoll: true, piano: true, bracelet: true, tonnetz: true, circle: false, anatomy: false,
  });
  // Follow-the-key: auto-switch the explorer's root+scale to the current playback
  // segment's local key as the playhead moves. Off by default; only meaningful
  // with engine key analysis (key bands) loaded.
  const [followKey, setFollowKey] = useState(false);
  const toggleView = (k: ViewKey) => setViews((v) => ({ ...v, [k]: !v[k] }));
  // When off, the grid/piano drop the scale tint — a "blank" surface where only
  // played / selected / chord notes are highlighted.
  const [showScaleColors, setShowScaleColors] = useState(true);

  const pattern = SCALES[scaleName];
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

  // The scale-fitting quality for a root: keep the current one if its tones are
  // all in-scale, else the first quality that fits — preferring one with the SAME
  // number of voices, so a 7th/extended chord doesn't collapse to a triad (only
  // falling to a different size if nothing of the same size fits). Shared by the
  // adapt effect and tap-to-play, so what plays matches what's shown (no lag).
  const fitQuality = useCallback(
    (rootPc: number, current: QualityKey): QualityKey => {
      const fits = (k: QualityKey) => QUALITIES[k].iv.every((i) => inScalePc(mod(rootPc + i, 12)));
      if (fits(current)) return current;
      const keys = Object.keys(QUALITIES) as QualityKey[];
      const voices = QUALITIES[current].iv.length;
      return keys.find((k) => QUALITIES[k].iv.length === voices && fits(k)) ?? keys.find(fits) ?? current;
    },
    [inScalePc]
  );

  // The quality actually shown/played: when adapting (always in In-Key mode; opt-in
  // via adaptToScale in Chromatic) the user's picked quality is fit to the scale for
  // the current root. This is *derived*, not stored-then-patched — so the displayed
  // chord is correct on the very first render (no stale-quality blink), for every
  // path that changes the root or scale (tap, PcChips, scale switch).
  const effQuality = useMemo<QualityKey>(
    () => (mode === "inkey" || adaptToScale ? fitQuality(chordRootPc, chordQuality) : chordQuality),
    [mode, adaptToScale, chordRootPc, chordQuality, fitQuality]
  );

  const ivCount = QUALITIES[effQuality].iv.length;
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
      setAnalysis(shiftAnalysis(fa, -(playback.song?.trimSec ?? 0)));
      setAnalysisError(null);
    } catch (e) {
      setAnalysis(null);
      setAnalysisError(e instanceof Error ? e.message : "Failed to parse analysis");
    }
  }, [playback.song]);
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
  // Start/stop the bridge process from inside the app (dev-server middleware).
  const engine = useEngineProcess(bridge.connected);

  // File analysis via the engine. Sends the raw MIDI bytes to our same-origin
  // /__tonality/analyze_midi adapter (which calls the bridge's midi_file_analysis
  // with a temp path + the coalesce window) and parses the result.
  const analyzeViaBridge = useCallback(async (buf: ArrayBuffer) => {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const raw = await analyzeMidi(buf, coalesceWindow, {
        disambiguateRelativeKeys: disambigRelKeys,
        smoothKeyRegions: smoothRegions,
      });
      // The engine analyzes the original bytes; re-align onto the trim-rebased song.
      setAnalysis(shiftAnalysis(parseTonalityAnalysis(raw), -(playback.song?.trimSec ?? 0)));
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Engine analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [coalesceWindow, disambigRelKeys, smoothRegions, playback.song]);

  // Re-analyze when any engine analysis option changes (if a file is loaded + bridge up).
  useEffect(() => {
    if (bridge.connected && midiBytesRef.current) {
      const id = setTimeout(() => midiBytesRef.current && analyzeViaBridge(midiBytesRef.current), 150);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coalesceWindow, disambigRelKeys, smoothRegions]);

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

  // Live engine-backed chord naming — an instance of the generic engine-consume
  // seam. 80ms debounce coalesces rapid changes; null (offline / <2 notes /
  // errored) falls back to the local analyzer in the Live panel.
  const engineNaming = useEngineFacts<ChordNaming>({
    enabled: isLive && bridge.connected && highlightSel.length >= 2,
    key: bridge.baseUrl + "|" + highlightSel.join(",") + "|" + root + "|" + scaleName + "|" + useFlats,
    debounceMs: 80,
    fetch: (signal) =>
      nameChord(
        bridge.baseUrl,
        {
          pcs: Array.from(new Set(highlightSel.map(pcOf))),
          tonic: noteName(root),
          keyName: scaleToEngineKey(scaleName),
          realizationMidi: [...highlightSel].sort((a, b) => a - b),
        },
        signal
      ),
  });

  // Structural key-areas for the loaded song — another engine-consume instance.
  // clearOnKeyChange: a new song must never show the old song's areas. The frame-
  // weighted structural "home" key is preferred over the windowed global key for
  // the circle's home ring (robust on near-ties, e.g. Bohemian Bb-vs-Eb).
  const structural = useEngineFacts<{
    areas: StructuralArea[];
    tonicizations: Tonicization[];
    home: { tonicPc: number; mode: string } | null;
  }>({
    enabled: !!playback.song && bridge.connected,
    key: playback.song,
    debounceMs: 0,
    clearOnKeyChange: true,
    fetch: async (signal) => {
      const song = playback.song!;
      // Feed the engine the ORIGINAL (untrimmed) beats: the leading-silence trim is a
      // display/playback offset, and re-basing the beats shifts structural_keys' window
      // grid and corrupts the reduction (e.g. a spurious minor blip at the very start).
      // Shift the returned areas/tonicizations back by trimBeats onto the trimmed axis.
      const tb = song.trimBeats;
      const events = song.notes.map((n) => [n.beats + tb, n.durationBeats, n.midi]);
      const unshift = <T extends { startBeats: number; endBeats: number }>(x: T): T =>
        ({ ...x, startBeats: x.startBeats - tb, endBeats: x.endBeats - tb });
      const r = await structuralKeys(bridge.baseUrl, events, {}, signal);
      return {
        areas: r.areas.map(unshift),
        tonicizations: r.tonicizations.map(unshift),
        home: r.homeTonicPc != null && r.homeMode ? { tonicPc: r.homeTonicPc, mode: r.homeMode } : null,
      };
    },
  });
  const structuralAreas = structural?.areas ?? null;
  const tonicizations = structural?.tonicizations ?? NO_TONICIZATIONS;
  const structuralHome = structural?.home ?? null;

  // Pitch-class views (bracelet / Tonnetz) backdrop: the current scale's pcs.
  const scalePcs = useMemo(() => new Set(pattern.map((i) => mod(root + i, 12))), [pattern, root]);

  // Analysis-derived strips — the derivation logic lives in lib/state (pure,
  // React-free, testable); these memos just wire state into the selectors.
  const keyRegionBands = useMemo(() => windowedKeyBands(analysis), [analysis]);
  const structuralKeyBands = useMemo(
    () => structuralKeyBandsOf(playback.song, structuralAreas),
    [playback.song, structuralAreas]
  );

  // The key strip the roll shows: structural reduction by default (cleaner), the
  // windowed key_regions as the opt-in "evidence" view. Falls back to windowed
  // when no structural areas (offline / not yet fetched).
  const hasStructural = structuralKeyBands.length > 0;
  const keyBands = keyStripMode === "structural" && hasStructural ? structuralKeyBands : keyRegionBands;

  // Follow-the-key: the local key under the playhead (from the key bands), plus the
  // distinct keys the piece visits (for the circle-of-fifths journey trace).
  const segmentKey = useMemo(() => segmentKeyAt(keyBands, playback.currentTime), [keyBands, playback.currentTime]);
  const visitedKeys = useMemo(() => visitedKeysOf(keyBands), [keyBands]);
  const canFollowKey = keyBands.length > 0;
  // When following, snap root+scale to the segment key (only major/minor map onto a
  // selectable scale). Keyed on the segment key's identity so it fires at key-area
  // boundaries, not every frame; setRoot/setScaleName to an unchanged value no-op.
  useEffect(() => {
    if (!followKey || !segmentKey) return;
    const sn = modeToScaleName(segmentKey.mode);
    if (!sn) return;
    setRoot(segmentKey.tonicPc);
    setScaleName(sn);
  }, [followKey, segmentKey?.tonicPc, segmentKey?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tonicization spans (pivot lane + applied-dominant tagging) and the chord
  // strip — derivation in lib/state.
  const tonicizationSpans = useMemo(
    () => tonicizationSpansOf(playback.song, tonicizations, keyStripMode === "structural"),
    [playback.song, tonicizations, keyStripMode]
  );
  const pivotBands = useMemo(() => pivotBandsOf(tonicizationSpans), [tonicizationSpans]);
  const chordRegions = useMemo(
    () => chordRegionsOf(analysis, keyBands, tonicizationSpans, chordLabelMode, noteName),
    [analysis, keyBands, tonicizationSpans, chordLabelMode, noteName]
  );

  /* ----- build chord ----- */
  const voiceChord = useCallback(
    (rootMidi: number) => buildVoicing(rootMidi, effQuality, inversion, voicing),
    [effQuality, inversion, voicing]
  );

  const chord = useMemo<BuiltChord>(() => {
    const iv = QUALITIES[effQuality].iv;
    const closePcs = Array.from(new Set(iv.map((i) => pcOf(48 + chordRootPc + i))));
    return { closePcs, voicing: voiceChord(48 + chordRootPc), symbol: noteName(chordRootPc) + SYM[effQuality] };
  }, [effQuality, chordRootPc, voiceChord, noteName]);

  // Active pitch classes for the diagrams: the built chord (Build) or the
  // selected/sounding notes (Analyze/Live).
  const activePcs = useMemo(() => {
    if (interaction === "build") return chordOn ? chord.closePcs : [];
    return Array.from(new Set(highlightSel.map(pcOf)));
  }, [interaction, chordOn, chord, highlightSel]);

  // Consume-when-connected: engine set-class facts for the active chord (null = use local).
  const chordFacts = useChordFacts(bridge.baseUrl, bridge.connected, activePcs);

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

  // Sounding MIDI for Chord Anatomy's voicing-sensitive surfaces (stacked intervals,
  // register → brightness): the built voicing in Build, the selected/sounding notes else.
  const chordRealizationMidi =
    interaction === "build" ? (chordOn ? chord.voicing : []) : highlightSel;
  const chordSymbol = interaction === "build" && chordOn ? chord.symbol : null;

  /* ----- reference for degree labels ----- */
  const refPc =
    degRef === "root"
      ? interaction === "analyze" || isLive
        ? highlightSel.length
          ? pcOf(Math.min(...highlightSel))
          : root
        : chordRootPc
      : root;

  /* ----- grid + piano cell models (builders in lib/state) ----- */
  const scaleCtx = useMemo<ScaleContext>(() => ({ root, pattern, inScalePc }), [root, pattern, inScalePc]);
  const surfaceSel = useMemo<SurfaceSelection>(
    () => ({ interaction, chordOn, chordDisplay, chord, chordRootPc, highlightSel, litSet }),
    [interaction, chordOn, chordDisplay, chord, chordRootPc, highlightSel, litSet]
  );
  const grid = useMemo(
    () => buildGridCells(scaleCtx, surfaceSel, { mode, fixed, layout, orient }),
    [scaleCtx, surfaceSel, mode, fixed, layout, orient]
  );
  const bottomLeft = grid[0][0];
  const piano = useMemo(() => buildPianoKeys(scaleCtx, surfaceSel), [scaleCtx, surfaceSel]);

  /* ----- labels ----- */
  const degLabel = (rel: number) => (degNot === "roman" ? DEG_ROM[rel] : degNot === "solfege" ? DEG_SOL[rel] : DEG_NUM[rel]);
  const padMain = (p: Cell) => (labelMode === "note" ? noteName(p.pc) : degLabel(mod(p.pc - refPc, 12)));
  // Pitch-class label honoring the Labels settings — for the bracelet / Tonnetz.
  const pcLabel = (pc: number) => (labelMode === "note" ? noteName(pc) : degLabel(mod(pc - refPc, 12)));

  /* ----- pad / key styling (colour logic in lib/state) ----- */
  const padStyle = (p: Cell): React.CSSProperties => padStyleOf(p, showScaleColors);
  const keyAccent = (p: Cell): KeyAccent | null => keyAccentOf(p, showScaleColors);

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
      // Play the scale-fit quality for the new root (matches what effQuality will
      // derive once setChordRootPc lands — so sound and display never disagree).
      const q = mode === "inkey" || adaptToScale ? fitQuality(p.pc, chordQuality) : chordQuality;
      buildVoicing(p.midi, q, inversion, voicing).forEach((m, i) => playMidi(m, 1.0, i * 0.03, 0.85));
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
      // The diagrams are octave-less, so a click means "this pitch class":
      // toggle by pc — removing a pc clears it in *every* octave (so notes set
      // from the grid/keyboard in another register can be deleted here too).
      if (selected.some((m) => pcOf(m) === pc)) {
        setSelected((s) => s.filter((m) => pcOf(m) !== pc));
      } else {
        playMidi(midi);
        setSelected((s) => (s.includes(midi) ? s : [...s, midi]));
      }
      return;
    }
    if (interaction === "live") {
      playMidi(midi);
      return;
    }
    if (chordOn && tapChord) {
      const q = mode === "inkey" || adaptToScale ? fitQuality(pc, chordQuality) : chordQuality;
      buildVoicing(midi, q, inversion, voicing).forEach((m, i) => playMidi(m, 1.0, i * 0.03, 0.85));
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

          {views.transport && (
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
                onStartEngine={engine.start}
                onStopEngine={engine.stop}
                engineStarting={engine.starting}
                engineError={engine.error}
                coalesceWindow={coalesceWindow}
                onCoalesceChange={setCoalesceWindow}
                disambigRelKeys={disambigRelKeys}
                onDisambigChange={setDisambigRelKeys}
                smoothRegions={smoothRegions}
                onSmoothChange={setSmoothRegions}
                followKey={followKey}
                onFollowKeyChange={setFollowKey}
                canFollowKey={canFollowKey}
              />
            </div>
          )}

          {views.pianoRoll && (
            <div className="px-stage-block">
              <div className="px-block-cap px-block-cap-row">
                <span>Piano roll</span>
                <span className="px-roll-toggles">
                  {chordRegions.length > 0 && (
                    <button
                      className="px-keymode"
                      onClick={() => setChordLabelMode((m) => (m === "names" ? "roman" : m === "roman" ? "both" : "names"))}
                      title="Chord strip labels: chord names → roman numerals (relative to the local key) → both."
                    >
                      Chords: {chordLabelMode}
                    </button>
                  )}
                  {hasStructural && (
                    <button
                      className="px-keymode"
                      onClick={() => setKeyStripMode((m) => (m === "structural" ? "windowed" : "structural"))}
                      title={
                        keyStripMode === "structural"
                          ? "Key strip: structural key-areas (tonicizations absorbed). Click to show the raw windowed track."
                          : "Key strip: raw windowed key-regions (tonicization-grain evidence). Click for the structural reduction."
                      }
                    >
                      Key: {keyStripMode === "structural" ? "structural" : "windowed"}
                    </button>
                  )}
                </span>
              </div>
              <PianoRoll
                song={playback.song}
                currentTime={playback.currentTime}
                duration={playback.duration}
                isPlaying={playback.isPlaying}
                activeNotes={playback.activeNotes}
                onSeek={playback.seek}
                regions={chordRegions}
                keyRegions={keyBands}
                pivots={pivotBands}
                tonicizations={tonicizationSpans}
                tempoScale={playback.tempoScale}
              />
            </div>
          )}

          {views.grid && (
            <div className="px-stage-block">
              <div className="px-block-cap">Push grid</div>
              <Grid rows={grid} styleOf={padStyle} label={padMain} labelMode={labelMode} onPad={onPad} />
            </div>
          )}

          {views.piano && (
            <div className="px-stage-block">
              <div className="px-block-cap">Piano · C2 – C6</div>
              <Piano whites={piano.whites} blacks={piano.blacks} accentOf={keyAccent} label={padMain} labelMode={labelMode} onPad={onPad} />
            </div>
          )}

          {(views.bracelet || views.tonnetz || views.circle) && (
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
                {views.circle && (
                  <div className="px-diagram">
                    <div className="px-diagram-cap">Circle of 5ths{followKey ? " · following" : ""}</div>
                    <CircleOfFifths
                      tonicPc={root}
                      isMinor={scaleName === "Minor"}
                      visited={visitedKeys}
                      homeKey={structuralHome ?? (analysis ? { tonicPc: analysis.key.tonicPc, mode: analysis.key.mode } : null)}
                      noteNot={noteNot}
                      onPick={(pc, minor) => { setFollowKey(false); setRoot(pc); setScaleName(minor ? "Minor" : "Major"); }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {views.anatomy && (
            <div className="px-stage-block">
              <div className="px-block-cap">Chord anatomy</div>
              <div className="px-diagram">
                <ChordAnatomy
                  pcs={activePcs}
                  rootPc={diagramRootPc}
                  realizationMidi={chordRealizationMidi}
                  label={pcLabel}
                  symbol={chordSymbol}
                  facts={chordFacts}
                />
              </div>
            </div>
          )}

          <div className="px-legend">
            <Dot c="#a5b4fc" t="root / tonic" />
            <Dot c="#2dd4bf" t="in scale" />
            {showScaleColors && <Dot c="#f87171" t="out of scale" />}
            <Dot c="#fbbf24" t={isLive ? "playing live" : interaction === "analyze" ? "selected" : chordDisplay === "voicing" ? "voicing note" : "chord tone"} />
            {playback.song && <Dot c="#fde047" t="sounding (file)" />}
            {playback.song && views.pianoRoll && <Dot c="#a78bfa" t="in tonicized key (roll)" />}
            {playback.song && views.pianoRoll && <Dot c="#f87171" t="out of key (roll)" />}
            {playback.song && views.pianoRoll && <Dot c="#94a3b8" t="drums (roll)" />}
            {pivotBands.length > 0 && views.pianoRoll && <Dot c="#fb923c" t="pivot / tonicization" />}
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
          adaptToScale={adaptToScale} setAdaptToScale={setAdaptToScale}
          chordRootPc={chordRootPc} setChordRootPc={setChordRootPc}
          chordQuality={effQuality} setChordQuality={setChordQuality}
          inversion={inversion} setInversion={setInversion}
          voicing={voicing} setVoicing={setVoicing}
          chordDisplay={chordDisplay} setChordDisplay={setChordDisplay}
          selected={selected} setSelected={setSelected}
          sound={sound} setSound={setSound}
          noteName={noteName} inScalePc={inScalePc} isLive={isLive}
          chord={chord} highlightSel={highlightSel} liveNotes={liveNotes} litSet={litSet}
          live={live} song={playback.song} playMidi={playMidi} analysis={analysis}
          showLayout={views.grid}
          showScaleColors={showScaleColors} setShowScaleColors={setShowScaleColors}
          engineNaming={engineNaming} bridgeConnected={bridge.connected}
        />
      </div>
    </div>
  );
}
