import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const FLAT_KEYS = [5, 10, 3, 8, 1, 6]; // F Bb Eb Ab Db Gb

const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  "Melodic Minor": [0, 2, 3, 5, 7, 9, 11],
  "Major Pentatonic": [0, 2, 4, 7, 9],
  "Minor Pentatonic": [0, 3, 5, 7, 10],
  "Minor Blues": [0, 3, 5, 6, 7, 10],
  "Major Blues": [0, 2, 3, 4, 7, 9],
  "Whole Tone": [0, 2, 4, 6, 8, 10],
  "Half-Whole Dim": [0, 1, 3, 4, 6, 7, 9, 10],
  "Whole-Half Dim": [0, 2, 3, 5, 6, 8, 9, 11],
  "Super Locrian": [0, 1, 3, 4, 6, 8, 10],
  "Spanish (Phr. Dom.)": [0, 1, 4, 5, 7, 8, 10],
  "Hungarian Minor": [0, 2, 3, 6, 7, 8, 11],
  Bhairav: [0, 1, 4, 5, 7, 8, 11],
  Hirajoshi: [0, 2, 3, 7, 8],
  "In-Sen": [0, 1, 5, 7, 10],
  Iwato: [0, 1, 5, 6, 10],
  Kumoi: [0, 2, 3, 7, 9],
  Pelog: [0, 1, 3, 7, 8],
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// row interval (vertical step) in semitones / scale-steps for each layout
const CHROMA_INT = { "4ths": 5, "3rds": 4, seq: 8 };
const INKEY_INT = { "4ths": 3, "3rds": 2, seq: 8 };

// piano keyboard range + key geometry (px)
const PIANO_LO = 36, PIANO_HI = 84; // C2 .. C6 (Ableton: C3 = 60)
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_PCS = [1, 3, 6, 8, 10];
const WW = 32, BW = 20, WH = 170, BH = 106;

// chord qualities defined by REAL intervals (semitones from root)
const QUALITIES = {
  maj:   { l: "maj",  iv: [0, 4, 7],         cat: "Triads" },
  min:   { l: "min",  iv: [0, 3, 7],         cat: "Triads" },
  dim:   { l: "dim",  iv: [0, 3, 6],         cat: "Triads" },
  aug:   { l: "aug",  iv: [0, 4, 8],         cat: "Triads" },
  sus2:  { l: "sus2", iv: [0, 2, 7],         cat: "Triads" },
  sus4:  { l: "sus4", iv: [0, 5, 7],         cat: "Triads" },
  maj6:  { l: "6",    iv: [0, 4, 7, 9],      cat: "Sixths & Sevenths" },
  min6:  { l: "m6",   iv: [0, 3, 7, 9],      cat: "Sixths & Sevenths" },
  maj7:  { l: "maj7", iv: [0, 4, 7, 11],     cat: "Sixths & Sevenths" },
  dom7:  { l: "7",    iv: [0, 4, 7, 10],     cat: "Sixths & Sevenths" },
  min7:  { l: "m7",   iv: [0, 3, 7, 10],     cat: "Sixths & Sevenths" },
  m7b5:  { l: "m7\u266d5", iv: [0, 3, 6, 10], cat: "Sixths & Sevenths" },
  dim7:  { l: "\u00b07",  iv: [0, 3, 6, 9],  cat: "Sixths & Sevenths" },
  mMaj7: { l: "mM7",  iv: [0, 3, 7, 11],     cat: "Sixths & Sevenths" },
  add9:  { l: "add9", iv: [0, 4, 7, 14],     cat: "Extended" },
  dom9:  { l: "9",    iv: [0, 4, 7, 10, 14], cat: "Extended" },
  maj9:  { l: "maj9", iv: [0, 4, 7, 11, 14], cat: "Extended" },
  min9:  { l: "m9",   iv: [0, 3, 7, 10, 14], cat: "Extended" },
  six9:  { l: "6/9",  iv: [0, 4, 7, 9, 14],  cat: "Extended" },
};
const QUAL_CATS = ["Triads", "Sixths & Sevenths", "Extended"];

const SYM = {
  maj: "", min: "m", dim: "dim", aug: "+", sus2: "sus2", sus4: "sus4",
  maj6: "6", min6: "m6", maj7: "maj7", dom7: "7", min7: "m7",
  m7b5: "m7\u266d5", dim7: "\u00b07", mMaj7: "m(maj7)",
  add9: "add9", dom9: "9", maj9: "maj9", min9: "m9", six9: "6/9",
};

const DEG_NUM = ["1", "\u266d2", "2", "\u266d3", "3", "4", "\u266d5", "5", "\u266d6", "6", "\u266d7", "7"];
const DEG_ROM = ["I", "\u266dII", "II", "\u266dIII", "III", "IV", "\u266dV", "V", "\u266dVI", "VI", "\u266dVII", "VII"];
const DEG_SOL = ["Do", "Ra", "Re", "Me", "Mi", "Fa", "Se", "Sol", "Le", "La", "Te", "Ti"];

const INTERVAL_NAMES = {
  1: "minor 2nd", 2: "major 2nd", 3: "minor 3rd", 4: "major 3rd",
  5: "perfect 4th", 6: "tritone", 7: "perfect 5th", 8: "minor 6th",
  9: "major 6th", 10: "minor 7th", 11: "major 7th",
};

// interval-set (sorted, from candidate root) -> chord suffix
const FORMULAS = {
  "0,4,7": "", "0,3,7": "m", "0,3,6": "dim", "0,4,8": "aug",
  "0,2,7": "sus2", "0,5,7": "sus4",
  "0,4,7,9": "6", "0,3,7,9": "m6",
  "0,4,7,11": "maj7", "0,4,7,10": "7", "0,3,7,10": "m7",
  "0,3,6,10": "m7\u266d5", "0,3,6,9": "\u00b07", "0,3,7,11": "m(maj7)",
  "0,4,8,10": "7\u266f5", "0,4,8,11": "maj7\u266f5",
  "0,2,4,7": "add9", "0,2,3,7": "m(add9)",
  "0,5,7,10": "7sus4",
  "0,2,4,7,11": "maj9", "0,2,4,7,10": "9", "0,2,3,7,10": "m9", "0,2,4,7,9": "6/9",
};

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

const mod = (n, m) => ((n % m) + m) % m;
const pcOf = (midi) => mod(midi, 12);
const octOf = (midi) => Math.floor(midi / 12) - 2; // Ableton: C3 = 60

function applyVoicing(close, voicing) {
  let a = close.slice().sort((x, y) => x - y);
  if (voicing === "drop2" && a.length >= 2) a[a.length - 2] -= 12;
  else if (voicing === "drop3" && a.length >= 3) a[a.length - 3] -= 12;
  else if (voicing === "spread") {
    if (a.length >= 2) a[a.length - 2] -= 12;
    if (a.length >= 4) a[a.length - 4] -= 12;
  } else if (voicing === "wide") {
    a = a.map((n, i) => (i % 2 === 1 ? n + 12 : n));
  }
  return a.sort((x, y) => x - y);
}

function analyzeSelection(midis, noteName) {
  if (midis.length === 0) return { empty: true };
  const pcs = Array.from(new Set(midis.map(pcOf))).sort((a, b) => a - b);
  const bassPc = pcOf(Math.min(...midis));

  if (pcs.length === 1)
    return { single: true, text: noteName(pcs[0]) + " \u2014 single note" };

  if (pcs.length === 2) {
    const other = pcs[0] === bassPc ? pcs[1] : pcs[0];
    const gap = mod(other - bassPc, 12);
    const cands = [
      { name: noteName(bassPc) + "\u2013" + noteName(other), sub: INTERVAL_NAMES[gap] || "interval", primary: true },
    ];
    if (gap === 7 || gap === 5)
      cands.push({ name: noteName(gap === 7 ? bassPc : other) + "5", sub: "power chord", primary: false });
    return { candidates: cands, pcs, bassPc };
  }

  const raw = [];
  for (const r of pcs) {
    const iv = pcs.map((p) => mod(p - r, 12)).sort((a, b) => a - b).join(",");
    if (FORMULAS[iv] !== undefined) raw.push({ root: r, suffix: FORMULAS[iv], isRoot: r === bassPc });
  }
  if (raw.length === 0) {
    const intervals = pcs.map((p) => mod(p - bassPc, 12)).sort((a, b) => a - b);
    return { none: true, pcs, bassPc, intervals };
  }
  raw.sort((a, b) => (b.isRoot ? 1 : 0) - (a.isRoot ? 1 : 0));
  const candidates = raw.map((c) => ({
    name: noteName(c.root) + c.suffix + (c.isRoot ? "" : "/" + noteName(bassPc)),
    sub: c.isRoot ? "root position" : "slash / inversion",
    primary: c.isRoot,
  }));
  return { candidates, pcs, bassPc };
}

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
  const acRef = useRef(null);
  const getAC = () => {
    if (!acRef.current) acRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return acRef.current;
  };
  const playMidi = useCallback(
    (m, dur = 0.55, when = 0, gMul = 1) => {
      if (!sound) return;
      try {
        const ac = getAC();
        if (ac.state === "suspended") ac.resume();
        const t = ac.currentTime + when;
        const o = ac.createOscillator();
        const o2 = ac.createOscillator();
        const g = ac.createGain();
        const gO2 = ac.createGain();
        o.type = "triangle"; o2.type = "sine";
        const f = 440 * Math.pow(2, (m - 69) / 12);
        o.frequency.value = f; o2.frequency.value = f * 2; gO2.gain.value = 0.25;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16 * gMul, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); o2.connect(gO2).connect(g); g.connect(ac.destination);
        o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
      } catch (e) {}
    },
    [sound]
  );

  /* ----- build chord ----- */
  // build the exact voiced chord (with inversion + voicing) for any root midi note
  const buildVoicing = useCallback(
    (rootMidi) => {
      const iv = QUALITIES[chordQuality].iv;
      let v = iv.map((i) => rootMidi + i).sort((a, b) => a - b);
      const inv = Math.min(inversion, v.length - 1);
      for (let k = 0; k < inv; k++) v.push(v.shift() + 12);
      v.sort((a, b) => a - b);
      return applyVoicing(v, voicing);
    },
    [chordQuality, inversion, voicing]
  );

  const chord = useMemo(() => {
    const iv = QUALITIES[chordQuality].iv;
    const closePcs = Array.from(new Set(iv.map((i) => pcOf(48 + chordRootPc + i))));
    return { closePcs, voicing: buildVoicing(48 + chordRootPc), symbol: noteName(chordRootPc) + SYM[chordQuality] };
  }, [chordQuality, chordRootPc, buildVoicing, noteName]);

  const analysis = useMemo(() => analyzeSelection(selected, noteName), [selected, noteName]);

  /* ----- reference for degree labels ----- */
  const refPc =
    degRef === "root"
      ? interaction === "analyze"
        ? selected.length
          ? pcOf(Math.min(...selected))
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

    const selSet = new Set(selected);
    const selPcs = new Set(selected.map(pcOf));

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
        } else if (interaction === "analyze") {
          isSel = selSet.has(midi);
          isSelPc = !isSel && selPcs.has(pc);
        }
        row.push({ midi, pc, inScale, isRoot, isTone, isCRoot, isVoice, voiceNum, isSel, isSelPc, r, c });
      }
      rows.push(row);
    }
    return rows;
  }, [root, scaleName, mode, fixed, layout, orient, len, pattern, inScalePc, chordOn, chordDisplay, chord, chordRootPc, interaction, selected]);

  const bottomLeft = grid[0][0];

  /* ----- piano keyboard ----- */
  const piano = useMemo(() => {
    const selSet = new Set(selected);
    const selPcs = new Set(selected.map(pcOf));
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
      } else if (interaction === "analyze") {
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
  }, [root, scaleName, inScalePc, chordOn, chordDisplay, chord, chordRootPc, interaction, selected]);

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
    // build mode
    if (chordOn && tapChord) {
      buildVoicing(p.midi).forEach((m, i) => playMidi(m, 1.0, i * 0.03, 0.85));
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

  return (
    <div className="px-root">
      <style>{CSS}</style>

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
            <Dot c="#fbbf24" t={interaction === "analyze" ? "selected" : chordDisplay === "voicing" ? "voicing note" : "chord tone"} />
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
                  <Seg options={[{ v: "tonic", l: "Tonic" }, { v: "root", l: interaction === "analyze" ? "Bass note" : "Chord root" }]} value={degRef} onChange={setDegRef} />
                </Field>
              </>
            )}
          </div>

          <div className="px-card">
            <div className="px-card-hrow">
              <h2 className="px-card-h">Chord</h2>
              <Seg small options={[{ v: "build", l: "Build" }, { v: "analyze", l: "Analyze" }]} value={interaction} onChange={setInteraction} />
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
            ) : (
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

                {analysis.empty && <div className="px-analyze-empty">No notes selected yet.</div>}
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

                {selected.length > 0 && (
                  <div className="px-analyze-btns">
                    <button className="px-play" onClick={playSelection}>{"\u25b6"} Play</button>
                    <button className="px-clear" onClick={() => setSelected([])}>Clear</button>
                  </div>
                )}
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

/* ------------------------------------------------------------------ */
/*  STYLES                                                             */
/* ------------------------------------------------------------------ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=JetBrains+Mono:wght@400;500;700&display=swap');

.px-root{
  --bg:#0a0c10; --ink:#e8edf4; --mut:#8893a4; --line:#1c2129;
  font-family:'JetBrains Mono',ui-monospace,monospace;
  background:
    radial-gradient(900px 500px at 78% -10%, rgba(45,212,191,.07), transparent 60%),
    radial-gradient(700px 500px at 0% 110%, rgba(165,180,252,.07), transparent 55%),
    #0a0c10;
  color:var(--ink); min-height:100%; padding:22px; box-sizing:border-box;
}
.px-root *{box-sizing:border-box;}

.px-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:20px;}
.px-kicker{font-size:10.5px;letter-spacing:.32em;color:var(--mut);margin-bottom:7px;}
.px-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:30px;line-height:.95;margin:0;letter-spacing:-.02em;background:linear-gradient(95deg,#fff 10%,#5eead4 55%,#a5b4fc 95%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
.px-readout{display:flex;flex-direction:column;align-items:flex-end;gap:3px;}
.px-ro-lbl{font-size:10px;letter-spacing:.22em;color:var(--mut);text-transform:uppercase;}
.px-ro-val{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:26px;color:#eef2ff;}
.px-ro-val sub{font-size:13px;color:var(--mut);font-weight:600;}

.px-body{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap;}
.px-stage{flex:1 1 560px;min-width:300px;max-width:1000px;}
.px-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:7px;padding:14px;border-radius:16px;border:1px solid var(--line);background:linear-gradient(180deg,#0d1016,#070809);box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 18px 40px -20px rgba(0,0,0,.9);aspect-ratio:1/1;}
.px-pad{position:relative;border-radius:9px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px;transition:transform .07s ease,box-shadow .12s ease,background .12s ease;outline:none;-webkit-tap-highlight-color:transparent;padding:0;}
.px-pad:hover{transform:translateY(-1px);}
.px-pad:active{transform:scale(.93);}
.px-pad-main{line-height:1;}
.px-pad-oct{position:absolute;bottom:4px;right:6px;font-size:8.5px;font-weight:500;opacity:.55;}
.px-pad-voice{position:absolute;top:4px;left:6px;font-size:9px;font-weight:700;color:#0a0c10;background:#fde68a;border-radius:50%;width:13px;height:13px;display:flex;align-items:center;justify-content:center;line-height:1;}

.px-stage-block{margin-bottom:18px;}
.px-block-cap{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--mut);margin-bottom:9px;}
.px-grid-wrap{width:clamp(240px,24vw,400px);max-width:100%;}
.px-grid-wrap .px-pad{font-size:clamp(11px,1.1vw,15px);}

.px-piano-scroll{overflow-x:auto;border-radius:16px;border:1px solid var(--line);background:linear-gradient(180deg,#0d1016,#070809);box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 18px 40px -20px rgba(0,0,0,.9);padding:16px 16px 18px;}
.px-piano{position:relative;margin:0 auto;}
.px-wkey,.px-bkey{position:absolute;top:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;font-family:'JetBrains Mono',monospace;font-weight:700;padding:0 0 8px;transition:transform .06s ease,box-shadow .12s ease,background .12s ease;-webkit-tap-highlight-color:transparent;outline:none;}
.px-wkey{background:#e9edf2;border:1px solid #aab4c2;border-radius:0 0 6px 6px;z-index:1;}
.px-wkey:hover{background:#dfe5ee;}
.px-wkey.lit:hover{filter:brightness(1.06);}
.px-bkey{background:linear-gradient(180deg,#23272f,#101319);border:1px solid #05070a;border-radius:0 0 5px 5px;z-index:2;color:#9aa4b2;box-shadow:0 4px 6px -2px rgba(0,0,0,.7);}
.px-bkey:hover{background:linear-gradient(180deg,#2c313a,#15181f);}
.px-wkey:active,.px-bkey:active{transform:translateY(1px);}
.px-key-lbl{font-size:11.5px;line-height:1;}
.px-bkey .px-key-lbl{font-size:10px;}
.px-key-oct{font-size:8px;font-weight:500;opacity:.6;margin-top:2px;}
.px-wkey .px-pad-voice,.px-bkey .px-pad-voice{top:6px;left:50%;transform:translateX(-50%);}

.px-legend{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:14px;font-size:11px;color:var(--mut);}
.px-leg-item{display:flex;align-items:center;gap:6px;}
.px-leg-dot{width:11px;height:11px;border-radius:3px;display:inline-block;}
.px-legend-note{margin-left:auto;color:#5eead4;font-size:10.5px;}

.px-panel{flex:1 1 300px;min-width:280px;column-width:240px;column-gap:13px;}
.px-card{border:1px solid var(--line);border-radius:13px;padding:14px;background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,0));break-inside:avoid;-webkit-column-break-inside:avoid;margin-bottom:13px;}
.px-card-mini{display:flex;flex-direction:column;gap:9px;}
.px-card-h{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#cdd6e4;margin:0 0 11px;}
.px-card-hrow{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px;}
.px-card-hrow.tight{margin-bottom:9px;}
.px-card-hrow .px-card-h{margin:0;}

.field{display:flex;flex-direction:column;gap:6px;margin-bottom:11px;}
.field:last-child{margin-bottom:0;}
.field-lbl{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);}

.seg{display:flex;gap:4px;flex-wrap:wrap;}
.seg.sm .seg-btn{padding:5px 10px;font-size:10.5px;flex:0 0 auto;}
.seg-btn{flex:1 1 auto;min-width:34px;padding:7px 6px;border-radius:7px;border:1px solid var(--line);background:#0e1117;color:var(--mut);font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;cursor:pointer;transition:all .12s ease;}
.seg-btn:hover{border-color:#2dd4bf;color:#bfeee6;}
.seg-btn.on{background:linear-gradient(180deg,#143b38,#0c2825);border-color:#2dd4bf;color:#7fffe9;box-shadow:0 0 10px rgba(45,212,191,.25);}

.sel-wrap{position:relative;}
.sel{width:100%;appearance:none;padding:9px 28px 9px 11px;border-radius:8px;border:1px solid var(--line);background:#0e1117;color:var(--ink);font-family:'JetBrains Mono',monospace;font-size:12.5px;cursor:pointer;}
.sel:focus{outline:none;border-color:#2dd4bf;}
.sel-arrow{position:absolute;right:11px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--mut);font-size:11px;}

.px-pcrow{display:flex;gap:4px;flex-wrap:wrap;}
.px-pc{width:30px;height:30px;border-radius:7px;border:1px solid var(--line);background:#0e1117;color:var(--mut);font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;cursor:pointer;transition:all .12s;padding:0;}
.px-pc:hover:not(.dis){border-color:#2dd4bf;color:#bfeee6;}
.px-pc.out{color:#f87171;border-color:#5b1d22;}
.px-pc.sel{background:linear-gradient(180deg,#4a2f06,#2a1c04);border-color:#fbbf24;color:#fde68a;box-shadow:0 0 10px rgba(251,191,36,.3);}
.px-pc.dis{opacity:.22;cursor:not-allowed;}

.px-qgroup{margin-bottom:9px;}
.px-qcat{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);display:block;margin-bottom:5px;}
.px-chips{display:flex;gap:4px;flex-wrap:wrap;}
.px-qchip{position:relative;padding:6px 9px;border-radius:7px;border:1px solid var(--line);background:#0e1117;color:var(--mut);font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;cursor:pointer;transition:all .12s;}
.px-qchip:hover:not(.dis){border-color:#2dd4bf;color:#bfeee6;}
.px-qchip.sel{background:linear-gradient(180deg,#143b38,#0c2825);border-color:#2dd4bf;color:#7fffe9;box-shadow:0 0 9px rgba(45,212,191,.25);}
.px-qchip.out.sel{background:linear-gradient(180deg,#4a1418,#2a0c0e);border-color:#ef4444;color:#fca5a5;box-shadow:0 0 9px rgba(239,68,68,.3);}
.px-qchip.dis{opacity:.26;cursor:not-allowed;}
.px-qdot{position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:#ef4444;}
.px-qdot.static{position:static;display:inline-block;margin-right:5px;}
.px-mini-legend{display:flex;align-items:center;font-size:10px;color:var(--mut);margin-top:6px;}

.px-tog{padding:5px 13px;border-radius:20px;border:1px solid var(--line);background:#0e1117;color:var(--mut);font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;letter-spacing:.1em;cursor:pointer;transition:all .12s;}
.px-tog.on{background:linear-gradient(180deg,#143b38,#0c2825);border-color:#2dd4bf;color:#7fffe9;}
.px-tog.wide{width:100%;padding:10px;border-radius:9px;letter-spacing:.06em;}
.px-dim{opacity:.4;pointer-events:none;filter:grayscale(.4);}

.px-chord-out{margin-top:13px;padding-top:13px;border-top:1px solid var(--line);}
.px-chord-sym{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:28px;color:#fde68a;margin-bottom:9px;}
.px-chord-notes{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;}
.px-chip{padding:5px 9px;border-radius:7px;border:1px solid #f59e0b;background:rgba(245,158,11,.1);color:#fde68a;font-size:12px;font-weight:600;}
.px-chip.click{cursor:pointer;}
.px-chip.click:hover{background:rgba(239,68,68,.18);border-color:#ef4444;}
.px-chip sub{font-size:9px;opacity:.7;}
.px-play{flex:1;padding:10px;border-radius:9px;border:1px solid #fbbf24;background:linear-gradient(180deg,#4a2f06,#2a1c04);color:#fde68a;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12.5px;letter-spacing:.06em;cursor:pointer;transition:all .12s;width:100%;}
.px-play:hover{box-shadow:0 0 16px rgba(251,191,36,.35);transform:translateY(-1px);}

.px-analyze .px-hint{font-size:10.5px;line-height:1.5;color:var(--mut);margin:0;}
.px-analyze-empty{margin-top:11px;padding:12px;border:1px dashed var(--line);border-radius:9px;color:var(--mut);font-size:11.5px;line-height:1.5;}
.px-cands{display:flex;flex-direction:column;gap:7px;margin-top:11px;}
.px-cand{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;border:1px solid var(--line);background:#0e1117;}
.px-cand.primary{border-color:#fbbf24;background:linear-gradient(180deg,#2a1c04,#160e02);}
.px-cand-name{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:18px;color:#fde68a;}
.px-cand-sub{font-size:10px;color:var(--mut);letter-spacing:.04em;text-align:right;}
.px-analyze-btns{display:flex;gap:8px;margin-top:12px;}
.px-clear{padding:10px 16px;border-radius:9px;border:1px solid var(--line);background:#0e1117;color:var(--mut);font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;cursor:pointer;}
.px-clear:hover{border-color:#ef4444;color:#fca5a5;}
.px-hint{font-size:10.5px;line-height:1.5;color:var(--mut);margin:0;}

@media (max-width:760px){
  .px-root{padding:14px;}
  .px-title{font-size:24px;}
  .px-pad{font-size:13px;}
  .px-grid{gap:5px;padding:10px;}
}
`;
