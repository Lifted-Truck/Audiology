// App shell: owns all UI state, derives the grid / piano / chord / highlight
// data, and composes the stage (transport, grid, piano-roll, piano) with the
// control panel. The pure music-theory + MIDI logic lives in lib/* and hooks/*;
// this file is the wiring.

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import "./styles/theme.css";
import {
  SHARP, FLAT, FLAT_KEYS, SCALES, CHROMA_INT, INKEY_INT,
  QUALITIES, SYM, DEG_NUM, DEG_ROM, DEG_SOL,
  mod, pcOf, octOf, buildVoicing, spellInKey, chordRoman, keyRoman, scaleDegreeLabel, isDominantRoman,
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
import { parseTonalityAnalysis, shiftAnalysis, qualitySymbol, nameChord, analyzeMidi, scaleToEngineKey, structuralKeys, type FileAnalysis, type ChordNaming, type StructuralArea, type Tonicization } from "./lib/tonality";
import { useBridge } from "./hooks/useBridge";
import { useEngineProcess } from "./hooks/useEngineProcess";
import { Dot } from "./ui/primitives";
import type {
  Interaction, GridMode, Layout, Orient, LabelMode, NoteNotation,
  DegNotation, DegRef, ChordDisplay, Cell, GridCell, WhiteKey, BlackKey, KeyAccent, BuiltChord,
} from "./ui/types";

type ViewKey = "transport" | "grid" | "pianoRoll" | "piano" | "bracelet" | "tonnetz";
const VIEW_DEFS: { key: ViewKey; label: string }[] = [
  { key: "transport", label: "Transport" },
  { key: "pianoRoll", label: "Piano roll" },
  { key: "grid", label: "Push grid" },
  { key: "piano", label: "Piano" },
  { key: "bracelet", label: "Bracelet" },
  { key: "tonnetz", label: "Tonnetz" },
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

  // Structural key-areas (structural_keys) for the roll's key strip — the clean,
  // tonicization-absorbed reduction validated in the corpus harness. Default
  // display when available; the windowed key_regions are the "evidence" toggle.
  const [structuralAreas, setStructuralAreas] = useState<StructuralArea[] | null>(null);
  const [tonicizations, setTonicizations] = useState<Tonicization[]>([]);
  const [keyStripMode, setKeyStripMode] = useState<"structural" | "windowed">("structural");
  // Chord strip label mode: chord names, roman numerals (relative to the local
  // key), or both. Roman is often shorter, so it fits tight bars better.
  const [chordLabelMode, setChordLabelMode] = useState<"names" | "roman" | "both">("names");

  // Optional visual modules — each surface can be shown or hidden.
  const [views, setViews] = useState<Record<ViewKey, boolean>>({
    transport: true, grid: true, pianoRoll: true, piano: true, bracelet: true, tonnetz: true,
  });
  const toggleView = (k: ViewKey) => setViews((v) => ({ ...v, [k]: !v[k] }));
  // When off, the grid/piano drop the scale tint — a "blank" surface where only
  // played / selected / chord notes are highlighted.
  const [showScaleColors, setShowScaleColors] = useState(true);

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

  // Fetch structural key-areas for the loaded song from the bridge (events built
  // from the parsed MIDI, in beats). Cleared on song change / disconnect.
  useEffect(() => {
    setStructuralAreas(null);
    setTonicizations([]);
    const song = playback.song;
    if (!song || !bridge.connected) return;
    const events = song.notes.map((n) => [n.beats, n.durationBeats, n.midi]);
    const ctrl = new AbortController();
    structuralKeys(bridge.baseUrl, events, {}, ctrl.signal)
      .then((r) => { setStructuralAreas(r.areas); setTonicizations(r.tonicizations); })
      .catch(() => { setStructuralAreas(null); setTonicizations([]); });
    return () => ctrl.abort();
  }, [playback.song, bridge.connected, bridge.baseUrl]);

  // Pitch-class views (bracelet / Tonnetz) backdrop: the current scale's pcs.
  const scalePcs = useMemo(() => new Set(pattern.map((i) => mod(root + i, 12))), [pattern, root]);

  // Tonality's local-key regions → a key-band strip (modulations become visible).
  // Low-confidence regions (tiny margin — the engine flagging near-ambiguity) are
  // absorbed into the prevailing key so the strip reads simply; the full,
  // every-region view is the planned "deeper analysis" mode (see CLAUDE.md).
  // Each band is spelled in its OWN key (a Bb-major region reads "Bb maj", not
  // "A# maj", regardless of the root the user has selected) and carries
  // tonicPc/mode so the chord strip below can match its spelling.
  const keyRegionBands = useMemo(() => {
    if (!analysis) return [];
    const MIN_MARGIN = 0.03; // below this, treat as "no real key change here"
    const merged: typeof analysis.keyRegions = [];
    for (const r of analysis.keyRegions) {
      if (merged.length && r.meanMargin < MIN_MARGIN) {
        merged[merged.length - 1] = { ...merged[merged.length - 1], endSec: r.endSec };
      } else {
        merged.push({ ...r });
      }
    }
    return merged.map((r) => ({
      startSec: r.startSec,
      endSec: r.endSec,
      tonicPc: r.tonicPc,
      mode: r.mode,
      label: spellInKey(r.tonicPc, r.tonicPc, r.mode) + (r.mode === "major" ? " maj" : r.mode === "minor" ? " min" : " " + r.mode),
    }));
  }, [analysis]);

  // structural_keys areas → key bands (beats → seconds via the song's exact map).
  // The structural reduction absorbs tonicizations, so this strip is the clean
  // key-area view (harness-validated); adjacent same-key areas collapse to one.
  const keyModeWord = (m: string) => (m === "major" ? " maj" : m === "minor" ? " min" : " " + m);
  const structuralKeyBands = useMemo(() => {
    const song = playback.song;
    if (!song || !structuralAreas) return [];
    // Consumer-side gate: absorb very short areas — brief tonicizations that just
    // cleared the engine's 8-beat floor (a real modulation worth showing lasts a
    // few bars) — into the surrounding key, plus collapse adjacent same-key areas.
    // So the strip shows structural modulations, not flickers. The engine-side
    // principled version is the `min_area_beats` re-anchoring (Tonality response-7,
    // Finding 3b); this is the interim display gate. Toggle to "windowed" for the raw track.
    const MIN_AREA_BEATS = 24;
    const bands: { startSec: number; endSec: number; tonicPc: number; mode: string; label: string }[] = [];
    for (const a of structuralAreas) {
      const label = spellInKey(a.tonicPc, a.tonicPc, a.mode) + keyModeWord(a.mode);
      const prev = bands[bands.length - 1];
      const tooShort = a.endBeats - a.startBeats < MIN_AREA_BEATS;
      if (prev && (prev.label === label || tooShort)) prev.endSec = song.beatsToSeconds(a.endBeats);
      else bands.push({ startSec: song.beatsToSeconds(a.startBeats), endSec: song.beatsToSeconds(a.endBeats), tonicPc: a.tonicPc, mode: a.mode, label });
    }
    return bands;
  }, [playback.song, structuralAreas]);

  // The key strip the roll shows: structural reduction by default (cleaner), the
  // windowed key_regions as the opt-in "evidence" view. Falls back to windowed
  // when no structural areas (offline / not yet fetched).
  const hasStructural = structuralKeyBands.length > 0;
  const keyBands = keyStripMode === "structural" && hasStructural ? structuralKeyBands : keyRegionBands;

  // Tonicizations (brief pivots the structural reduction absorbed) → spans in
  // seconds, carrying the tonicized key + its roman relative to the parent. Used
  // for the pivot-lane markers AND to tag applied/secondary dominants ("V7/vi")
  // in the chord strip. Only meaningful alongside the structural key bands.
  const tonicizationSpans = useMemo(() => {
    const song = playback.song;
    if (!song || keyStripMode !== "structural" || !tonicizations.length) return [];
    return tonicizations.map((t) => ({
      startSec: song.beatsToSeconds(t.startBeats),
      endSec: song.beatsToSeconds(t.endBeats),
      tonicPc: t.tonicPc,
      mode: t.mode,
      parentRoman: keyRoman(t.degree, t.parentMode, t.mode), // e.g. "vi" / "V"
    }));
  }, [playback.song, tonicizations, keyStripMode]);

  // Pivot-lane markers: the tonicized key's roman ("what it leans toward").
  const pivotBands = useMemo(
    () => tonicizationSpans.map((t) => ({ startSec: t.startSec, endSec: t.endSec, label: t.parentRoman })),
    [tonicizationSpans]
  );

  // Tonality's per-segment chord readings → time-aligned labels for the roll,
  // each spelled in the local key region it falls under (chords in an Eb section
  // read with flats, chords in an A-major section with sharps).
  const chordRegions = useMemo(() => {
    if (!analysis) return [];
    // Use the *displayed* key bands (structural or windowed) for both spelling and
    // roman function, so the chord strip agrees with the key strip above it.
    const bandAt = (t: number) => keyBands.find((b) => t >= b.startSec && t < b.endSec);
    const spell = (pc: number, t: number) => {
      const b = bandAt(t);
      return b ? spellInKey(pc, b.tonicPc, b.mode) : noteName(pc);
    };
    const roman = (rootPc: number, quality: string, t: number) => {
      const b = bandAt(t);
      return b ? chordRoman(rootPc, quality, b.tonicPc, b.mode) : "";
    };
    const degree = (pc: number, t: number) => {
      const b = bandAt(t);
      return b ? scaleDegreeLabel(pc, b.tonicPc, b.mode) : "";
    };
    // Applied / secondary dominant: inside a tonicization span, a chord that's the
    // dominant of the tonicized key reads "V7/vi" etc. (its function in the target
    // key + the target's roman in the parent). null when it isn't an applied chord.
    const applied = (rootPc: number, quality: string, t: number) => {
      const ton = tonicizationSpans.find((s) => t >= s.startSec && t < s.endSec);
      if (!ton) return null;
      const inKey = chordRoman(rootPc, quality, ton.tonicPc, ton.mode);
      return isDominantRoman(inKey) ? inKey + "/" + ton.parentRoman : null;
    };
    return analysis.segments.map((s) => {
      const mid = (s.startSec + s.endSec) / 2;
      const isChord = s.rootPc != null && s.quality != null;
      const single = !isChord && s.pcs.length === 1;
      const name = isChord ? spell(s.rootPc!, mid) + qualitySymbol(s.quality!) : single ? spell(s.pcs[0], mid) : "";
      // roman view: chord → applied-dominant tag if any, else its roman numeral;
      // single melodic note → its scale degree (arabic) so the strip reads cleanly.
      const rn = isChord
        ? applied(s.rootPc!, s.quality!, mid) || roman(s.rootPc!, s.quality!, mid)
        : single
          ? degree(s.pcs[0], mid)
          : "";
      const label = chordLabelMode === "roman" ? rn || name : chordLabelMode === "both" && rn ? name + " · " + rn : name;
      return { startSec: s.startSec, endSec: s.endSec, label };
    });
  }, [analysis, noteName, keyBands, chordLabelMode, tonicizationSpans]);

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
    if (!showScaleColors) {
      bg = "#0e1117"; color = "#8893a4"; border = "1px solid #1c2129"; glow = "none";
    } else if (p.isRoot) {
      bg = "#1d2540"; color = "#eef2ff"; border = "1px solid #a5b4fc";
      glow = "0 0 13px rgba(165,180,252,.5), inset 0 0 9px rgba(165,180,252,.28)";
    } else if (p.inScale) {
      bg = "#0a2825"; color = "#5eead4"; border = "1px solid #2dd4bf"; glow = "0 0 7px rgba(45,212,191,.28)";
    } else {
      bg = "#1d0f12"; color = "#f87171"; border = "1px solid #5b1d22"; glow = "none";
    }
    const out = showScaleColors && !p.inScale;
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
    // Sounding right now (MIDI playback): a bright filled yellow — unmistakable
    // against the teal scale tint and the red out-of-scale pads, and clearly
    // distinct from the dark-brown-filled amber of chord tones / live-held
    // selection (live notes stay amber via isSel; the file's notes glow yellow).
    if (p.isLit) {
      bg = "#fde047"; color = "#1a1400"; border = "1px solid #fef08a";
      glow = "0 0 20px rgba(253,224,71,.9), inset 0 0 11px rgba(253,224,71,.5)";
    }
    return { background: bg, color, border, boxShadow: glow };
  };

  const keyAccent = (p: Cell): KeyAccent | null => {
    if (p.isLit) return { c: "#fde047", strong: true };
    if (p.isSel) return { c: "#fbbf24", strong: true };
    if (p.isSelPc) return { c: "#d97706", dashed: true };
    if (p.isVoice || p.isCRoot) return { c: "#fbbf24", strong: true, badge: p.voiceNum };
    if (p.isTone) return { c: "#f59e0b" };
    if (showScaleColors && p.isRoot) return { c: "#a5b4fc", strong: true };
    if (showScaleColors && p.inScale) return { c: "#2dd4bf" };
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
            <Dot c="#fbbf24" t={isLive ? "playing live" : interaction === "analyze" ? "selected" : chordDisplay === "voicing" ? "voicing note" : "chord tone"} />
            {playback.song && <Dot c="#fde047" t="sounding (file)" />}
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
