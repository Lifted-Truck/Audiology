// The right-hand control panel: Key & Scale, MIDI-file key analysis, Layout,
// Labels, the Chord card (build / analyze / live), and the sound toggle. App
// owns the state; this renders it and computes the panel-only derived values
// (chord identification, key-fit, scale matches).

import React, { useMemo } from "react";
import {
  SCALES, QUALITIES, QUAL_CATS, DEG_NUM, DEG_ROM, DEG_SOL,
  mod, pcOf, octOf, analyzeSelection, spellInKey,
  pitchClassesOf, pcsFitScale, outOfScale, scalesContaining,
} from "../lib/theory";
import type { ScaleName, QualityKey } from "../lib/theory/constants";
import type { Voicing } from "../lib/theory/types";
import { KEY_TO_SEMITONE, OCTAVE_DOWN_KEY, OCTAVE_UP_KEY } from "../lib/midi/input";
import { WHITE_PCS } from "../geometry/piano";
import { ALL_INPUTS, type LiveInput } from "../hooks/useLiveInput";
import type { Song } from "../lib/midi/types";
import { modeToScaleName, qualitySymbol, type FileAnalysis, type ChordNaming } from "../lib/tonality";
import { Field, Seg, Sel, PcChips } from "../ui/primitives";
import type {
  Interaction, GridMode, Layout, Orient, LabelMode, NoteNotation,
  DegNotation, DegRef, ChordDisplay, BuiltChord,
} from "../ui/types";

export interface ControlPanelsProps {
  root: number;
  setRoot: (n: number) => void;
  scaleName: ScaleName;
  setScaleName: (s: string) => void;
  mode: GridMode;
  setMode: (m: GridMode) => void;
  fixed: boolean;
  setFixed: (b: boolean) => void;
  layout: Layout;
  setLayout: (l: Layout) => void;
  orient: Orient;
  setOrient: (o: Orient) => void;
  labelMode: LabelMode;
  setLabelMode: (l: LabelMode) => void;
  noteNot: NoteNotation;
  setNoteNot: (n: NoteNotation) => void;
  degNot: DegNotation;
  setDegNot: (d: DegNotation) => void;
  degRef: DegRef;
  setDegRef: (d: DegRef) => void;
  interaction: Interaction;
  setInteraction: (i: Interaction) => void;
  chordOn: boolean;
  setChordOn: (b: boolean) => void;
  tapChord: boolean;
  setTapChord: (b: boolean) => void;
  adaptToScale: boolean;
  setAdaptToScale: (b: boolean) => void;
  chordRootPc: number;
  setChordRootPc: (n: number) => void;
  chordQuality: QualityKey;
  setChordQuality: (k: QualityKey) => void;
  inversion: number;
  setInversion: (n: number) => void;
  voicing: Voicing;
  setVoicing: (v: Voicing) => void;
  chordDisplay: ChordDisplay;
  setChordDisplay: (c: ChordDisplay) => void;
  selected: number[];
  setSelected: React.Dispatch<React.SetStateAction<number[]>>;
  sound: boolean;
  setSound: (b: boolean) => void;
  // derived / helpers from App
  noteName: (pc: number) => string;
  inScalePc: (pc: number) => boolean;
  isLive: boolean;
  chord: BuiltChord;
  highlightSel: number[];
  liveNotes: number[];
  litSet: Set<number>;
  live: LiveInput;
  song: Song | null;
  playMidi: (m: number, dur?: number, when?: number, gMul?: number) => void;
  analysis: FileAnalysis | null;
  /** Follow-the-key state: when on, the MIDI-file-key card headlines the local
   *  (windowed) key under the playhead instead of the global inferred key. */
  followKey: boolean;
  segmentKey: { tonicPc: number; mode: string } | null;
  /** Whether the Push grid is visible — its config card hides when it isn't. */
  showLayout: boolean;
  /** The Push grid's bottom-left (origin) pad — shown as a readout in its card. */
  bottomLeft: { pc: number; midi: number };
  showScaleColors: boolean;
  setShowScaleColors: (b: boolean) => void;
  /** Engine-backed naming for the Live set (null = none / use local analyzer). */
  engineNaming: ChordNaming | null;
  /** Whether the Tonality bridge is connected (drives the Live status chip). */
  bridgeConnected: boolean;
}

export default function ControlPanels(p: ControlPanelsProps) {
  const { noteName, inScalePc, isLive, chord, highlightSel } = p;

  const analysis = useMemo(() => analyzeSelection(highlightSel, noteName), [highlightSel, noteName]);

  const keyCheck = useMemo(() => {
    const pcs = Array.from(new Set(highlightSel.map(pcOf)));
    if (pcs.length === 0) return null;
    const out = pcs.filter((pc) => !inScalePc(pc));
    return { inKey: out.length === 0, out };
  }, [highlightSel, inScalePc]);

  const songPcs = useMemo(
    () => (p.song ? pitchClassesOf(p.song.notes.map((n) => n.midi)) : []),
    [p.song]
  );
  const songFit = useMemo(
    () =>
      songPcs.length
        ? { fits: pcsFitScale(songPcs, p.root, p.scaleName), out: outOfScale(songPcs, p.root, p.scaleName) }
        : null,
    [songPcs, p.root, p.scaleName]
  );
  const songMatches = useMemo(() => scalesContaining(songPcs), [songPcs]);

  const ivCount = QUALITIES[p.chordQuality].iv.length;
  const qualFits = (k: QualityKey) => QUALITIES[k].iv.every((i) => inScalePc(mod(p.chordRootPc + i, 12)));
  const degLabel = (rel: number) =>
    p.degNot === "roman" ? DEG_ROM[rel] : p.degNot === "solfege" ? DEG_SOL[rel] : DEG_NUM[rel];

  const playChord = () => chord.voicing.forEach((m, i) => p.playMidi(m, 1.1, i * 0.04, 0.85));
  const playSelection = () =>
    [...p.selected].sort((a, b) => a - b).forEach((m, i) => p.playMidi(m, 1.1, i * 0.04, 0.85));

  const keyHints = Object.entries(KEY_TO_SEMITONE)
    .filter(([, s]) => WHITE_PCS.includes(mod(s, 12)))
    .map(([k]) => k.toUpperCase());

  // In/out-of-key indicator, shared by the local and engine readouts.
  const keyCheckEl = keyCheck && (
    <div className={"px-keycheck" + (keyCheck.inKey ? " in" : " out")}>
      <span className="px-keycheck-dot" />
      {keyCheck.inKey
        ? "In key — " + noteName(p.root) + " " + p.scaleName
        : "Out of key: " + keyCheck.out.map(noteName).join(", ")}
    </div>
  );

  // Engine-backed reading (Live, bridge connected). It ADDS to the local readout
  // (candidates + voicing + position, still rendered) rather than replacing it:
  // Tonality's contribution is the functional role, the ranked alternatives, and
  // the ambiguity flag — the human-friendly voicing/position stays local (it's a
  // property of the realized MIDI, which the engine doesn't see).
  const engineName = (r: { rootPc: number; quality: string }) => noteName(r.rootPc) + qualitySymbol(r.quality);
  const renderEngineFunctional = () => {
    const en = p.engineNaming;
    if (!en || !en.chosen) return null;
    return (
      <div className="px-engine-read">
        <div className="px-engine-lbl">
          <span className="px-engine-dot" />
          Tonality reading{en.isAmbiguous ? " · ambiguous" : ""}
        </div>
        <div className="px-cands">
          <div className="px-cand primary engine">
            <span className="px-cand-name">{engineName(en.chosen)}</span>
            <span className="px-cand-sub">{en.chosen.functionalRole || "chosen"}</span>
          </div>
          {en.alternatives.slice(0, 3).map((a, i) => (
            <div key={i} className="px-cand engine">
              <span className="px-cand-name">{engineName(a)}</span>
              <span className="px-cand-sub">{a.functionalRole || "alternative"}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Shared local analysis readout (Analyze + Live fallback), fixed-min-height.
  const renderAnalysis = () => (
    <div className="px-analysis-slot">
      {keyCheckEl}
      {"empty" in analysis && (
        <div className="px-analyze-empty">{isLive ? "Play some notes to identify them." : "No notes selected yet."}</div>
      )}
      {"single" in analysis && <div className="px-analyze-empty">{analysis.text}</div>}
      {"none" in analysis && (
        <div className="px-analyze-empty">
          No standard name. Bass {noteName(analysis.bassPc)}; intervals from bass: {analysis.intervals.join(", ")} semitones.
        </div>
      )}
      {"candidates" in analysis && (
        <div className="px-cands">
          {analysis.candidates.map((c, i) => (
            <div key={i} className={"px-cand" + (c.primary ? " primary" : "")}>
              <span className="px-cand-name">{c.name}</span>
              <span className="px-cand-sub">{c.sub}</span>
            </div>
          ))}
        </div>
      )}
      {"candidates" in analysis && analysis.voicing && (
        <div className="px-voicing">
          <span className="px-voicing-lbl">Voicing</span>
          {analysis.voicing}
        </div>
      )}
    </div>
  );

  return (
    <aside className="px-panel">
      <div className="px-card">
        <h2 className="px-card-h">Key &amp; Scale</h2>
        <Field label="Root / tonic">
          <PcChips value={p.root} onChange={p.setRoot} noteName={noteName} />
        </Field>
        <Field label="Scale">
          <Sel value={p.scaleName} onChange={p.setScaleName}>
            {Object.keys(SCALES).map((s) => (<option key={s} value={s}>{s}</option>))}
          </Sel>
        </Field>
      </div>

      {p.song && (p.analysis || songFit) && (
        <div className="px-card">
          <h2 className="px-card-h">MIDI file key</h2>

          {p.analysis && (() => {
            const k = p.analysis.key;
            const apply = (tonicPc: number, mode: string) => {
              p.setRoot(tonicPc);
              const sn = modeToScaleName(mode);
              if (sn) p.setScaleName(sn);
            };
            // Spell each candidate key in its OWN key (Bb major reads "Bb",
            // not "A#") rather than the user's currently-selected root spelling.
            const label = (pc: number, mode: string) =>
              spellInKey(pc, pc, mode) + " " + mode.charAt(0).toUpperCase() + mode.slice(1);
            const following = p.followKey && p.segmentKey;
            return (
              <div className="px-inferkey">
                {following && (
                  <div className="px-inferkey-follow">
                    <span className="px-inferkey-cap">⟳ Following local key</span>
                    <span className="px-inferkey-local">{label(p.segmentKey!.tonicPc, p.segmentKey!.mode)}</span>
                  </div>
                )}
                <div className="px-inferkey-top">
                  <span className="px-inferkey-cap">{following ? "Global key · Tonality" : "Inferred key · Tonality"}</span>
                  <button className="px-apply" onClick={() => apply(k.tonicPc, k.mode)}>Apply</button>
                </div>
                <div className="px-inferkey-main">{label(k.tonicPc, k.mode)}</div>
                <div className="px-inferkey-sub">
                  score {k.score.toFixed(2)} · margin {k.margin.toFixed(2)} · {k.profileVersion}
                </div>
                {k.candidates.length > 1 && (
                  <div className="px-inferkey-alts">
                    {k.candidates.slice(1, 4).map((c, i) => (
                      <button key={i} className="px-scale-chip" title={"score " + c.score.toFixed(2)} onClick={() => apply(c.tonicPc, c.mode)}>
                        {label(c.tonicPc, c.mode)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {songFit && (
            <div className={"px-keyfit " + (songFit.fits ? "in" : "out")}>
              <span className="px-keyfit-dot" />
              {songFit.fits
                ? "Fits " + noteName(p.root) + " " + p.scaleName
                : "Doesn't fit " + noteName(p.root) + " " + p.scaleName}
            </div>
          )}
          {songFit && !songFit.fits && (
            <div className="px-keyfit-out">Outside notes: {songFit.out.map((pc) => noteName(pc)).join(", ")}</div>
          )}
          <Field label={"Fits these scales (tap to apply) · " + songPcs.length + " notes"}>
            {songMatches.length === 0 ? (
              <div className="px-analyze-empty">No scale in the list contains every note.</div>
            ) : (
              <>
                <div className="px-scale-matches">
                  {songMatches.slice(0, 24).map((m) => {
                    const sel = m.root === p.root && m.scale === p.scaleName;
                    return (
                      <button
                        key={m.root + ":" + m.scale}
                        className={"px-scale-chip" + (sel ? " sel" : "") + (m.exact ? " exact" : "")}
                        title={m.exact ? "exact fit" : m.extra + " extra note(s)"}
                        onClick={() => { p.setRoot(m.root); p.setScaleName(m.scale); }}
                      >
                        {noteName(m.root)} {m.scale}
                      </button>
                    );
                  })}
                </div>
                {songMatches.length > 24 && (
                  <span className="px-mini-legend">+{songMatches.length - 24} more</span>
                )}
              </>
            )}
          </Field>
        </div>
      )}

      {p.showLayout && (
      <div className="px-card">
        <h2 className="px-card-h">Push grid</h2>
        <p className="px-card-note">How the Push grid maps notes onto its pads.</p>
        <Field label="Pad notes">
          <Seg options={[{ v: "inkey", l: "In Key" }, { v: "chromatic", l: "Chromatic" }]} value={p.mode} onChange={p.setMode} />
        </Field>
        <Field label="Origin">
          <Seg options={[{ v: false, l: "Relative" }, { v: true, l: "Fixed (C)" }]} value={p.fixed} onChange={p.setFixed} />
        </Field>
        <Field label="Transposition">
          <Seg options={[{ v: "4ths", l: "4ths" }, { v: "3rds", l: "3rds" }, { v: "seq", l: "Seq." }]} value={p.layout} onChange={p.setLayout} />
        </Field>
        <Field label="Direction">
          <Seg options={[{ v: "vert", l: "Vertical" }, { v: "horiz", l: "Horizontal" }]} value={p.orient} onChange={p.setOrient} />
        </Field>
        <Field label="Bottom-left pad">
          <span className="px-pad-readout">{noteName(p.bottomLeft.pc)}<sub>{octOf(p.bottomLeft.midi)}</sub></span>
        </Field>
      </div>
      )}

      <div className="px-card">
        <h2 className="px-card-h">Labels</h2>
        <Field label="Show pads as">
          <Seg options={[{ v: "note", l: "Notes" }, { v: "degree", l: "Degrees" }]} value={p.labelMode} onChange={p.setLabelMode} />
        </Field>
        {p.labelMode === "note" ? (
          <Field label="Notation">
            <Seg options={[{ v: "auto", l: "Auto" }, { v: "sharp", l: "♯" }, { v: "flat", l: "♭" }]} value={p.noteNot} onChange={p.setNoteNot} />
          </Field>
        ) : (
          <>
            <Field label="Notation">
              <Seg options={[{ v: "number", l: "1–7" }, { v: "roman", l: "I–VII" }, { v: "solfege", l: "Do–Ti" }]} value={p.degNot} onChange={p.setDegNot} />
            </Field>
            <Field label="Relative to">
              <Seg options={[{ v: "tonic", l: "Tonic" }, { v: "root", l: p.interaction === "analyze" || isLive ? "Bass note" : "Chord root" }]} value={p.degRef} onChange={p.setDegRef} />
            </Field>
          </>
        )}
        <Field label="Scale colours">
          <Seg options={[{ v: true, l: "On" }, { v: false, l: "Off" }]} value={p.showScaleColors} onChange={p.setShowScaleColors} />
        </Field>
      </div>

      <div className="px-card">
        <div className="px-card-hrow">
          <h2 className="px-card-h">Chord</h2>
          <Seg small options={[{ v: "build", l: "Build" }, { v: "analyze", l: "Analyze" }, { v: "live", l: "Live" }]} value={p.interaction} onChange={p.setInteraction} />
        </div>

        {p.interaction === "build" ? (
          <>
            <div className="px-card-hrow tight">
              <span className="field-lbl">Highlight chord</span>
              <button className={"px-tog" + (p.chordOn ? " on" : "")} onClick={() => p.setChordOn(!p.chordOn)}>{p.chordOn ? "ON" : "OFF"}</button>
            </div>
            <div className={p.chordOn ? "" : "px-dim"}>
              <div className="px-card-hrow tight">
                <span className="field-lbl">Tap pad plays chord</span>
                <button className={"px-tog" + (p.tapChord ? " on" : "")} onClick={() => p.setTapChord(!p.tapChord)}>{p.tapChord ? "ON" : "OFF"}</button>
              </div>
              {p.mode === "inkey" ? (
                <div className="px-card-hrow tight px-dim">
                  <span className="field-lbl">Adapt chord to scale</span>
                  <button className="px-tog on" disabled title="In-Key mode always adapts the chord to the scale.">ON</button>
                </div>
              ) : (
                <div className="px-card-hrow tight">
                  <span className="field-lbl">Adapt chord to scale</span>
                  <button className={"px-tog" + (p.adaptToScale ? " on" : "")} onClick={() => p.setAdaptToScale(!p.adaptToScale)} title="Snap the chord quality to one that fits the current scale, even in Chromatic mode.">{p.adaptToScale ? "ON" : "OFF"}</button>
                </div>
              )}
              <Field label="Root (or tap a pad)">
                <PcChips
                  value={p.chordRootPc}
                  onChange={p.setChordRootPc}
                  noteName={noteName}
                  disabledFn={(pc) => p.mode === "inkey" && !inScalePc(pc)}
                  outFn={(pc) => !inScalePc(pc)}
                />
              </Field>

              <Field label="Quality">
                {QUAL_CATS.map((cat) => (
                  <div className="px-qgroup" key={cat}>
                    <span className="px-qcat">{cat}</span>
                    <div className="px-chips">
                      {(Object.keys(QUALITIES) as QualityKey[]).filter((k) => QUALITIES[k].cat === cat).map((k) => {
                        const fits = qualFits(k);
                        const dis = p.mode === "inkey" && !fits;
                        return (
                          <button
                            key={k}
                            disabled={dis}
                            title={fits ? "in scale" : "contains out-of-scale note(s)"}
                            className={"px-qchip" + (p.chordQuality === k ? " sel" : "") + (!fits ? " out" : "") + (dis ? " dis" : "")}
                            onClick={() => p.setChordQuality(k)}
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
                <Seg options={Array.from({ length: ivCount }, (_, i) => ({ v: i, l: i === 0 ? "Root" : i + (["st", "nd", "rd"][i - 1] || "th") }))} value={p.inversion} onChange={p.setInversion} />
              </Field>
              <Field label="Voicing">
                <Seg options={[{ v: "close", l: "Close" }, { v: "drop2", l: "Drop 2" }, { v: "drop3", l: "Drop 3" }, { v: "spread", l: "Spread" }, { v: "wide", l: "Wide" }]} value={p.voicing} onChange={p.setVoicing} />
              </Field>
              <Field label="Show on grid">
                <Seg options={[{ v: "tones", l: "Tones (all)" }, { v: "voicing", l: "Voicing (exact)" }]} value={p.chordDisplay} onChange={p.setChordDisplay} />
              </Field>

              <div className="px-chord-out">
                <div className="px-chord-sym">{chord.symbol}</div>
                <div className="px-chord-notes">
                  {chord.voicing.map((m, i) => (<span key={i} className="px-chip">{noteName(pcOf(m))}<sub>{octOf(m)}</sub></span>))}
                </div>
                <button className="px-play" onClick={playChord}>{"▶"} Play chord</button>
              </div>
            </div>
          </>
        ) : p.interaction === "analyze" ? (
          <div className="px-analyze">
            <p className="px-hint">Tap pads to add them to the selection; tap again to remove. Identification updates live and surfaces multiple readings when they overlap.</p>
            {p.selected.length > 0 && (
              <div className="px-chord-notes" style={{ marginTop: 10 }}>
                {[...p.selected].sort((a, b) => a - b).map((m, i) => (
                  <span key={i} className="px-chip click" onClick={() => p.setSelected((s) => s.filter((x) => x !== m))}>
                    {noteName(pcOf(m))}<sub>{octOf(m)}</sub> {"×"}
                  </span>
                ))}
              </div>
            )}

            {renderAnalysis()}

            {p.selected.length > 0 && (
              <div className="px-analyze-btns">
                <button className="px-play" onClick={playSelection}>{"▶"} Play</button>
                <button className="px-clear" onClick={() => p.setSelected([])}>Clear</button>
              </div>
            )}
          </div>
        ) : (
          <div className="px-analyze">
            <p className="px-hint">
              Identifies whatever is sounding in real time — your computer keyboard, a connected MIDI controller, or the playing MIDI file. Notes light up the grid &amp; piano and are named below.
            </p>

            <div className={"px-engine-chip" + (p.bridgeConnected ? " on" : "")} title="Tonality engine bridge (python -m mts.mcp.bridge) — start it from the transport">
              <span className="px-engine-dot" />
              {p.bridgeConnected ? "Tonality engine — naming live" : "Local analyzer (engine bridge offline)"}
            </div>

            {p.live.midiSupported ? (
              <Field label="MIDI input">
                <Sel value={p.live.midiInputId} onChange={p.live.setMidiInputId}>
                  <option value={ALL_INPUTS}>All inputs</option>
                  {p.live.midiDevices.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                </Sel>
              </Field>
            ) : (
              <p className="px-hint px-live-warn">Web MIDI isn't available in this browser — computer keyboard still works.</p>
            )}
            {p.live.midiSupported && !p.live.midiEnabled && (
              <p className="px-hint px-live-warn">Waiting for MIDI access{"…"} (allow it if your browser prompts).</p>
            )}
            {p.live.midiSupported && p.live.midiEnabled && p.live.midiDevices.length === 0 && (
              <p className="px-hint">No MIDI controllers detected — connect one or use the keyboard.</p>
            )}

            <div className="px-live-row">
              <span className="field-lbl">Octave</span>
              <div className="px-oct">
                <button className="px-oct-btn" onClick={() => p.live.setOctaveOffset(p.live.octaveOffset - 1)} title={"Octave down (" + OCTAVE_DOWN_KEY.toUpperCase() + ")"}>{"–"}</button>
                <span className="px-oct-val">C{3 + p.live.octaveOffset}</span>
                <button className="px-oct-btn" onClick={() => p.live.setOctaveOffset(p.live.octaveOffset + 1)} title={"Octave up (" + OCTAVE_UP_KEY.toUpperCase() + ")"}>+</button>
              </div>
            </div>

            <div className="px-keyhint">
              <span className="px-keyhint-keys">{keyHints.join(" ")}</span> = white keys{" · "}
              <span className="px-keyhint-keys">W E T Y U</span> = black{" · "}
              <span className="px-keyhint-keys">{OCTAVE_DOWN_KEY.toUpperCase()} / {OCTAVE_UP_KEY.toUpperCase()}</span> = octave
            </div>

            <div className="px-chord-notes px-live-held">
              {p.liveNotes.map((m, i) => (
                <span key={i} className={"px-chip" + (p.litSet.has(m) ? " file" : "")}>
                  {noteName(pcOf(m))}<sub>{octOf(m)}</sub>
                </span>
              ))}
            </div>

            {renderAnalysis()}
            {renderEngineFunctional()}
          </div>
        )}
      </div>

      <div className="px-card px-card-mini">
        <button className={"px-tog wide" + (p.sound ? " on" : "")} onClick={() => p.setSound(!p.sound)}>{p.sound ? "🔊 Sound on" : "🔇 Sound off"}</button>
      </div>
    </aside>
  );
}
