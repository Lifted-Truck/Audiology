// Analysis console — the verbose textual/numerical Tonality view ("deeper
// analysis" mode). Four granularity scopes behind a segmented control:
//   Chord   — everything known about the current chord: set-class identity, the
//             full DFT, the chirality family, colours, and the engine's complete
//             naming (chosen + every alternative with scores) or the local fallback.
//   Now     — the playhead instant: position, sounding notes, and the key band /
//             raw windowed region / tonicization / chord region under the cursor.
//   Regions — every raw windowed key region INCLUDING the sub-gate ones the strip
//             absorbs (with honest margins), structural areas, tonicizations, and
//             the per-segment chord list.
//   File    — the whole-file induction: every ranked key candidate, the structural
//             home, song stats, and the engine's itemized MIDI-read losses.
// Data comes from state App already holds (first consumer of the lib/state
// derivation layer); this component only formats. Copy button per scope; a JSON
// toggle shows the underlying objects verbatim.

import React, { useMemo, useState } from "react";
import type { Song } from "../lib/midi/types";
import type { SetClassInfo, StructuralArea } from "../lib/tonality/bridge";
import type { ChordNaming } from "../lib/tonality/bridge";
import type { FileAnalysis } from "../lib/tonality/parse";
import { qualitySymbol } from "../lib/tonality";
import type { KeyBand, LabelSpan, TonicizationSpan } from "../lib/state";
import {
  analyzeSelection, intervalVector, intervalVectorFromMagnitudes, dft,
  chirality, consonanceF5, stepGapChirality, primeForm, pcBitmask, setClassLabel,
  tonalColor, intervalColor,
} from "../lib/theory";

const C = {
  panel: "#11151b",
  border: "#1c2129",
  border2: "#2a3340",
  text: "#e6edf3",
  dim: "#94a3b8",
  faint: "#5b6675",
  accent: "#fbbf24",
  teal: "#2dd4bf",
  red: "#f87171",
};

const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const midiName = (m: number) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 2); // Ableton C3=60
const fmtT = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return m + ":" + (s - m * 60).toFixed(1).padStart(4, "0");
};
const f3 = (n: number) => n.toFixed(3);
const degOf = (rad: number) => Math.round((rad * 180) / Math.PI) + "°";
const modeWord = (m: string) => (m === "major" ? "maj" : m === "minor" ? "min" : m);

type Scope = "chord" | "now" | "regions" | "file";
type Row = [string, string];
interface Section {
  title: string;
  rows: Row[];
  /** Rows that would overwhelm the copy text keep a cap note instead. */
  note?: string;
}

export default function AnalysisConsole({
  pcs, rootPc, realizationMidi, facts, naming,
  song, currentTime, activeNotes, analysis,
  keyBands, structuralAreas, tonicizationSpans, structuralHome, chordRegions,
  bridgeConnected, noteName,
}: {
  pcs: number[];
  rootPc: number | null;
  realizationMidi: number[];
  facts: SetClassInfo | null;
  naming: ChordNaming | null;
  song: Song | null;
  currentTime: number;
  activeNotes: number[];
  analysis: FileAnalysis | null;
  keyBands: KeyBand[];
  structuralAreas: StructuralArea[] | null;
  tonicizationSpans: TonicizationSpan[];
  structuralHome: { tonicPc: number; mode: string } | null;
  chordRegions: LabelSpan[];
  bridgeConnected: boolean;
  noteName: (pc: number) => string;
}) {
  const [scope, setScope] = useState<Scope>("chord");
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const uniq = useMemo(() => [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b), [pcs]);

  /* ----- scope builders: sections for the text view + a raw object for JSON ----- */

  const chordScope = useMemo((): { sections: Section[]; raw: unknown } => {
    if (uniq.length < 2) {
      return {
        sections: [{ title: "chord", rows: [["status", uniq.length === 1 ? NOTE[uniq[0]] + " — single note; play 2+ for the full analysis" : "waiting for notes"]] }],
        raw: { pcs: uniq },
      };
    }
    const eng = facts;
    const src = eng ? "engine" : "local";
    const iv = eng && eng.dftMagnitudes.length >= 6 ? intervalVectorFromMagnitudes(eng.dftMagnitudes, uniq.length) : intervalVector(uniq);
    const localDft = dft(uniq); // f0..f6
    const mags = eng ? eng.dftMagnitudes : localDft.slice(1).map((c) => c.mag);
    const phases = eng ? eng.dftPhases : localDft.slice(1).map((c) => c.phase);
    const pf = eng ? eng.primeForm : primeForm(uniq);
    const mask = eng ? eng.mask : pcBitmask(uniq);
    const genCh = eng ? eng.generalChirality : chirality(uniq);
    const chSign = eng ? eng.chiralitySign : Math.sign(genCh);
    const triCh = eng ? eng.trichordChirality : stepGapChirality(uniq);
    const f5 = eng ? eng.consonanceF5 : consonanceF5(uniq);
    const tc = tonalColor(uniq, realizationMidi);
    const ic = intervalColor(uniq);

    const identity: Section = {
      title: "identity · " + src,
      rows: [
        ["notes", uniq.map((p) => NOTE[p]).join(" ") + (rootPc != null ? ` · bass ${NOTE[((rootPc % 12) + 12) % 12]}` : "")],
        ["pcs", "{" + uniq.join(", ") + "}"],
        ["realization", realizationMidi.length ? realizationMidi.map(midiName).join(" ") : "—"],
        ["prime form", "[" + pf.join(" ") + "]"],
        ["mask", mask.toString(2).padStart(12, "0") + " · " + mask],
        ["interval vector", "[" + iv.join(" ") + "]"],
        ["set-class steps", setClassLabel(uniq) ?? "—"],
      ],
    };
    const dftSec: Section = {
      title: "dft (f1..f6) · " + src,
      rows: [
        ["|f_k|", mags.map((m) => f3(m)).join("  ")],
        ["arg f_k", phases.map((p) => degOf(p)).join("  ")],
        ["|f5| consonance", f3(f5)],
        ["tonal colour", `hue ${Math.round(tc.hue)}° · focus ${tc.focus.toFixed(2)} (arg f5 / |f5|/n)`],
        ["interval colour", `hue ${Math.round(ic.hue)}° · focus ${ic.focus.toFixed(2)} (root-blind)`],
      ],
    };
    const chir: Section = {
      title: "chirality · " + src,
      rows: [
        ["general (bispectrum)", f3(genCh)],
        ["sign (complete)", String(chSign) + (chSign === 0 ? " · achiral" : chSign < 0 ? " · major-side" : " · minor-side")],
        ["trichord (step-gap)", triCh == null ? "— (not a trichord)" : f3(triCh)],
      ],
    };
    const nameRows: Row[] = [];
    if (naming && naming.chosen) {
      const n = naming.chosen;
      nameRows.push(["chosen", noteName(n.rootPc) + qualitySymbol(n.quality) + ` · ${n.functionalRole ?? "—"} · score ${f3(n.score)}` + (naming.isAmbiguous ? " · AMBIGUOUS" : "")]);
      naming.alternatives.forEach((a, i) =>
        nameRows.push([`alt ${i + 1}`, noteName(a.rootPc) + qualitySymbol(a.quality) + ` · ${a.functionalRole ?? "—"} · score ${f3(a.score)}`])
      );
    } else {
      const res = analyzeSelection(realizationMidi.length >= 2 ? realizationMidi : uniq.map((p) => 60 + p), noteName);
      if ("candidates" in res) res.candidates.forEach((c, i) => nameRows.push([i === 0 ? "chosen (local)" : `alt ${i}`, c.name + (c.sub ? " · " + c.sub : "")]));
      else nameRows.push(["naming", "no reading (local)"]);
    }
    const nameSec: Section = { title: "naming · " + (naming && naming.chosen ? "engine (name_pcs)" : "local fallback"), rows: nameRows };
    return {
      sections: [identity, dftSec, chir, nameSec],
      raw: { pcs: uniq, realizationMidi, facts: eng, naming },
    };
  }, [uniq, facts, naming, realizationMidi, rootPc, noteName]);

  const nowScope = useMemo((): { sections: Section[]; raw: unknown } => {
    if (!song) return { sections: [{ title: "now", rows: [["status", "load a MIDI file"]] }], raw: null };
    const t = currentTime;
    const { bar, beat } = song.timeToBarBeat(t);
    const band = keyBands.find((b) => t >= b.startSec && t < b.endSec) ?? null;
    const rawRegion = analysis?.keyRegions.find((r) => t >= r.startSec && t < r.endSec) ?? null;
    const ton = tonicizationSpans.find((s) => t >= s.startSec && t < s.endSec) ?? null;
    const chord = chordRegions.find((r) => t >= r.startSec && t < r.endSec) ?? null;
    const sections: Section[] = [
      {
        title: "playhead",
        rows: [
          ["position", `${fmtT(t)} / ${fmtT(song.duration)} · bar ${bar}, beat ${beat.toFixed(2)}`],
          ["sounding", activeNotes.length ? [...activeNotes].sort((a, b) => a - b).map(midiName).join(" ") : "—"],
        ],
      },
      {
        title: "harmonic context under the cursor",
        rows: [
          ["key band (strip)", band ? band.label : "—"],
          ["raw windowed region", rawRegion ? `${NOTE[rawRegion.tonicPc]} ${modeWord(rawRegion.mode)} · score ${f3(rawRegion.meanScore)} · margin ${f3(rawRegion.meanMargin)}` : "—"],
          ["tonicization", ton ? `${NOTE[ton.tonicPc]} ${modeWord(ton.mode)} (${ton.parentRoman} of parent)` : "—"],
          ["chord region", chord?.label || "—"],
        ],
      },
    ];
    return { sections, raw: { t, bar, beat, activeNotes, band, rawRegion, tonicization: ton, chordRegion: chord } };
  }, [song, currentTime, activeNotes, keyBands, analysis, tonicizationSpans, chordRegions]);

  const regionsScope = useMemo((): { sections: Section[]; raw: unknown } => {
    if (!analysis) return { sections: [{ title: "regions", rows: [["status", song ? "no engine analysis (start the engine or load a Tonality JSON)" : "load a MIDI file"]] }], raw: null };
    const GATE = 0.03; // the strip's absorb threshold — shown here, not applied
    const windowed: Section = {
      title: `windowed key regions · all ${analysis.keyRegions.length} (strip absorbs margin < ${GATE})`,
      rows: analysis.keyRegions.map((r) => [
        `${fmtT(r.startSec)}–${fmtT(r.endSec)}`,
        `${NOTE[r.tonicPc]} ${modeWord(r.mode)} · score ${f3(r.meanScore)} · margin ${f3(r.meanMargin)}${r.meanMargin < GATE ? "  ◦ sub-gate (absorbed in strip)" : ""}`,
      ]),
    };
    const structural: Section = {
      title: `structural key areas · ${structuralAreas?.length ?? 0}`,
      rows: (structuralAreas ?? []).map((a) => [
        song ? `${fmtT(Math.max(0, song.beatsToSeconds(a.startBeats)))}–${fmtT(song.beatsToSeconds(a.endBeats))}` : `beats ${a.startBeats}–${a.endBeats}`,
        `${NOTE[a.tonicPc]} ${modeWord(a.mode)}`,
      ]),
    };
    const tons: Section = {
      title: `tonicizations (absorbed pivots) · ${tonicizationSpans.length}`,
      rows: tonicizationSpans.map((s) => [`${fmtT(s.startSec)}–${fmtT(s.endSec)}`, `${NOTE[s.tonicPc]} ${modeWord(s.mode)} · ${s.parentRoman} of parent`]),
    };
    const CAP = 300;
    const segs: Section = {
      title: `chord segments · ${analysis.segments.length}`,
      rows: analysis.segments.slice(0, CAP).map((s) => [
        `${fmtT(s.startSec)}–${fmtT(s.endSec)}`,
        (s.rootPc != null && s.quality != null ? noteName(s.rootPc) + qualitySymbol(s.quality) : s.pcs.map((p) => NOTE[p]).join(" ")) +
          `  {${s.pcs.join(",")}}` +
          (s.interpretations.length > 1 ? ` · ${s.interpretations.length} readings` : ""),
      ]),
      note: analysis.segments.length > CAP ? `… +${analysis.segments.length - CAP} more (see JSON)` : undefined,
    };
    return { sections: [windowed, structural, tons, segs], raw: { keyRegions: analysis.keyRegions, structuralAreas, tonicizationSpans, segments: analysis.segments } };
  }, [analysis, structuralAreas, tonicizationSpans, song, noteName]);

  const fileScope = useMemo((): { sections: Section[]; raw: unknown } => {
    if (!song) return { sections: [{ title: "file", rows: [["status", "load a MIDI file"]] }], raw: null };
    const drums = song.notes.filter((n) => n.drum).length;
    const songSec: Section = {
      title: "song",
      rows: [
        ["name", song.name || "—"],
        ["duration", `${fmtT(song.duration)} · ${song.barStarts.length} bars`],
        ["notes", `${song.notes.length}${drums ? ` (${drums} drum)` : ""}`],
        ["trimmed lead-in", song.trimSec > 0 ? `${song.trimSec.toFixed(2)}s (${song.trimBeats.toFixed(2)} beats)` : "none"],
      ],
    };
    if (!analysis) {
      return { sections: [songSec, { title: "engine analysis", rows: [["status", "not loaded (start the engine or load a Tonality JSON)"]] }], raw: { song: { name: song.name } } };
    }
    const k = analysis.key;
    const keySec: Section = {
      title: `key induction · profile ${k.profileVersion} · margin ${f3(k.margin)}`,
      rows: analysis.key.candidates.map((c, i) => [i === 0 ? "inferred" : `#${i + 1}`, `${NOTE[c.tonicPc]} ${modeWord(c.mode)} · score ${f3(c.score)}`]),
    };
    const structSec: Section = {
      title: "structural reduction",
      rows: [
        ["home key", structuralHome ? `${NOTE[structuralHome.tonicPc]} ${modeWord(structuralHome.mode)} (frame-weighted)` : "—"],
        ["areas / tonicizations", `${structuralAreas?.length ?? 0} / ${tonicizationSpans.length}`],
      ],
    };
    const losses: Section = {
      title: `midi read losses · ${analysis.readLosses.length}`,
      rows: analysis.readLosses.length
        ? analysis.readLosses.slice(0, 20).map((l, i) => [`loss ${i + 1}`, JSON.stringify(l)])
        : [["status", "none — every note in the file is accounted for"]],
      note: analysis.readLosses.length > 20 ? `… +${analysis.readLosses.length - 20} more (see JSON)` : undefined,
    };
    const counts: Section = {
      title: "analysis size",
      rows: [
        ["chord segments", String(analysis.segments.length)],
        ["windowed key regions", String(analysis.keyRegions.length)],
      ],
    };
    return { sections: [songSec, keySec, structSec, counts, losses], raw: { key: analysis.key, structuralHome, readLosses: analysis.readLosses } };
  }, [song, analysis, structuralHome, structuralAreas, tonicizationSpans]);

  const scopes: Record<Scope, { sections: Section[]; raw: unknown }> = { chord: chordScope, now: nowScope, regions: regionsScope, file: fileScope };
  const cur = scopes[scope];

  const copyText = () => {
    const text = showJson
      ? JSON.stringify(cur.raw, null, 2)
      : cur.sections.map((s) => `## ${s.title}\n` + s.rows.map(([k, v]) => `${k.padEnd(22)} ${v}`).join("\n") + (s.note ? `\n${s.note}` : "")).join("\n\n");
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const chipStyle = (on: boolean): React.CSSProperties => ({
    padding: "4px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 7, textTransform: "capitalize",
    border: `1px solid ${on ? C.accent : C.border2}`,
    background: on ? "rgba(251,191,36,.12)" : "transparent",
    color: on ? C.accent : C.dim,
  });

  return (
    <div style={{ color: C.text }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 10, alignItems: "center" }}>
        {(["chord", "now", "regions", "file"] as Scope[]).map((s) => (
          <button key={s} onClick={() => setScope(s)} style={chipStyle(scope === s)}>{s}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span
          title={bridgeConnected ? "engine connected — engine determinations preferred" : "engine offline — local fallbacks"}
          style={{ fontSize: 9.5, letterSpacing: "0.05em", padding: "1px 6px", borderRadius: 5, border: `1px solid ${bridgeConnected ? C.teal : C.border2}`, color: bridgeConnected ? C.teal : C.faint }}
        >
          {bridgeConnected ? "engine" : "local"}
        </span>
        <button onClick={() => setShowJson((j) => !j)} style={chipStyle(showJson)} title="Show the underlying objects verbatim">json</button>
        <button onClick={copyText} style={chipStyle(false)} title="Copy this scope as text">{copied ? "copied ✓" : "copy"}</button>
      </div>

      <div style={{ maxHeight: 480, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 8, background: "#0b0e12", padding: "10px 12px", fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, lineHeight: 1.65 }}>
        {showJson ? (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", color: C.dim }}>{JSON.stringify(cur.raw, null, 2)}</pre>
        ) : (
          cur.sections.map((s) => (
            <div key={s.title} style={{ marginBottom: 14 }}>
              <div style={{ color: C.accent, fontSize: 10.5, letterSpacing: "0.04em", marginBottom: 3 }}>{s.title}</div>
              {s.rows.map(([k, v], i) => (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: C.faint, minWidth: 158, flexShrink: 0 }}>{k}</span>
                  <span style={{ color: v.includes("sub-gate") ? C.faint : C.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{v}</span>
                </div>
              ))}
              {s.note && <div style={{ color: C.faint }}>{s.note}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
