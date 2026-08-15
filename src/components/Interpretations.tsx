// Interpretations — the epistemic-humility surface. Instead of collapsing the
// current chord to a single "the answer", it shows the analytical readings side
// by side, uncollapsed: Tonality's ranked field (with each reading's score as a
// visible confidence bar + the margin between the top two), the local analyzer's
// candidates in parallel, and an honest banner when the engine flags the call as
// a near-tie. Making uncertainty visible is the point — a top pick that only just
// edged out the runner-up should look that way. (Integration policy rule 7:
// consume plural outputs — keep the ranked candidates + ambiguity, don't discard.)
//
// v1 is chord-naming interpretations (drives off engineNaming + local analyze).
// Competing *key* interpretations at the playhead — where the margin data is
// richest — are the noted v2 extension.

import { useMemo } from "react";
import { analyzeSelection, spellInKey } from "../lib/theory";
import { qualitySymbol, type ChordNaming, type FileAnalysis } from "../lib/tonality";
import { keyReadingAt, KEY_MARGIN_GATE, type KeyBand } from "../lib/state";

interface Props {
  /** Current chord's pitch classes (folded). */
  pcs: number[];
  /** The realized (register-specific) MIDI, when there is one — drives voicing/position. */
  realizationMidi: number[];
  /** Tonality's naming (chosen + ranked alternatives + ambiguity), or null if offline/absent. */
  naming: ChordNaming | null;
  bridgeConnected: boolean;
  noteName: (pc: number) => string;
  /** Engine file analysis — drives the competing-KEY readings. */
  analysis: FileAnalysis | null;
  /** The key strip actually drawn on the roll (structural or windowed). */
  keyBands: KeyBand[];
  currentTime: number;
  hasSong: boolean;
}

/** Strip an inversion slash ("C/E" → "C") so engine (pc-level) and local
 *  (realization-level) names can be loosely compared for agreement. */
const baseName = (n: string) => n.split("/")[0].trim();

export default function Interpretations({
  pcs, realizationMidi, naming, bridgeConnected, noteName,
  analysis, keyBands, currentTime, hasSong,
}: Props) {
  const keyRead = useMemo(() => keyReadingAt(analysis, keyBands, currentTime), [analysis, keyBands, currentTime]);
  const keyLabel = (tonicPc: number, mode: string) => spellInKey(tonicPc, tonicPc, mode) + (mode === "major" ? " maj" : mode === "minor" ? " min" : " " + mode);
  const keyCands = analysis?.key.candidates ?? [];
  const keyMax = keyCands.reduce((m, c) => Math.max(m, c.score), 0) || 1;

  const local = useMemo(
    () => analyzeSelection(realizationMidi.length >= 2 ? realizationMidi : pcs.map((p) => 60 + p), noteName),
    [pcs, realizationMidi, noteName]
  );
  const localReadings = "candidates" in local ? local.candidates : [];

  const engineReadings = naming?.chosen ? [naming.chosen, ...naming.alternatives] : [];
  const engName = (r: { rootPc: number; quality: string }) => noteName(r.rootPc) + qualitySymbol(r.quality);
  const maxScore = engineReadings.reduce((m, r) => Math.max(m, r.score), 0) || 1;
  const margin = engineReadings.length >= 2 ? engineReadings[0].score - engineReadings[1].score : null;

  // Loose agreement check between the two engines' top pick.
  const engTop = engineReadings[0] ? engName(engineReadings[0]) : null;
  const locTop = localReadings.find((c) => c.primary)?.name ?? localReadings[0]?.name ?? null;
  const disagree = engTop != null && locTop != null && baseName(engTop) !== baseName(locTop);

  // The KEY section stands on its own — it depends on the playhead + file analysis,
  // not on a chord being held — so it renders even when there's nothing to name.
  const keySection = hasSong && (
    <section className="px-interp-keys">
      <h3 className="px-interp-col-h">
        <span className="px-interp-dot engine" />
        Key at the playhead
      </h3>

      {!analysis && (
        <p className="px-interp-none">
          No engine analysis — start the engine (or load a Tonality JSON) to see competing key readings.
        </p>
      )}

      {analysis && keyRead.overridden && (
        <div className="px-interp-ambig">
          <span className="px-interp-ambig-dot" />
          The strip shows <strong>{keyRead.displayed && keyLabel(keyRead.displayed.tonicPc, keyRead.displayed.mode)}</strong>{" "}
          here, but Tonality read this window as{" "}
          <strong>{keyRead.raw && keyLabel(keyRead.raw.tonicPc, keyRead.raw.mode)}</strong>
          {keyRead.belowGate ? (
            <> — absorbed because its margin ({keyRead.raw?.meanMargin.toFixed(4)}) is under the {KEY_MARGIN_GATE} confidence gate.</>
          ) : (
            <> — the structural reduction folds it into the surrounding key area.</>
          )}
        </div>
      )}

      {analysis && (
        <div className="px-interp-keyrow">
          <div className="px-interp-keycell">
            <span className="px-interp-sub">shown on the strip</span>
            <span className="px-interp-name">
              {keyRead.displayed ? keyLabel(keyRead.displayed.tonicPc, keyRead.displayed.mode) : "—"}
            </span>
          </div>
          <div className="px-interp-keycell">
            <span className="px-interp-sub">Tonality, this window</span>
            <span className="px-interp-name">
              {keyRead.raw ? keyLabel(keyRead.raw.tonicPc, keyRead.raw.mode) : "—"}
            </span>
            {keyRead.raw && (
              <span className={"px-interp-sub" + (keyRead.belowGate ? " weak" : "")}>
                margin {keyRead.raw.meanMargin.toFixed(4)}
                {keyRead.belowGate && " · below the confidence gate"}
              </span>
            )}
          </div>
        </div>
      )}

      {keyCands.length > 0 && (
        <>
          <h3 className="px-interp-col-h mt">
            <span className="px-interp-dot engine" />
            Whole file — ranked key candidates
          </h3>
          {keyCands.slice(0, 6).map((c, i) => (
            <div key={i} className={"px-interp-card engine" + (i === 0 ? " top" : "")}>
              <div className="px-interp-row">
                <span className="px-interp-name">{keyLabel(c.tonicPc, c.mode)}</span>
                <span className="px-interp-score">{c.score.toFixed(3)}</span>
              </div>
              <div className="px-interp-meter">
                <span className="px-interp-meter-fill" style={{ width: Math.max(2, Math.round((Math.max(0, c.score) / keyMax) * 100)) + "%" }} />
              </div>
              {i === 0 && (
                <div className="px-interp-sub">
                  margin over runner-up {analysis?.key.margin.toFixed(4)} · profile {analysis?.key.profileVersion}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );

  if (pcs.length < 2) {
    return (
      <div className="px-interp">
        <p className="px-interp-lead">Play or build a chord (2+ notes) to see how it can be read.</p>
        {keySection}
      </div>
    );
  }

  return (
    <div className="px-interp">
      <p className="px-interp-lead">
        Every way the current chord can be read, side by side — not just the top pick. Confidence is
        shown, not hidden.
      </p>

      {naming?.isAmbiguous && engineReadings.length >= 2 && (
        <div className="px-interp-ambig">
          <span className="px-interp-ambig-dot" />
          Near-tie — Tonality flags this as <strong>ambiguous</strong>: {engName(engineReadings[0])} vs{" "}
          {engName(engineReadings[1])}
          {margin != null && <> (margin {margin.toFixed(2)})</>}.
        </div>
      )}
      {!naming?.isAmbiguous && disagree && (
        <div className="px-interp-ambig differ">
          <span className="px-interp-ambig-dot" />
          The readings differ: Tonality hears <strong>{engTop}</strong>, the local analyzer hears{" "}
          <strong>{locTop}</strong>.
        </div>
      )}

      <div className="px-interp-cols">
        {/* Tonality — ranked, with confidence bars */}
        <section className="px-interp-col engine">
          <h3 className="px-interp-col-h">
            <span className="px-interp-dot engine" />
            Tonality {bridgeConnected ? "· ranked by score" : "· offline"}
          </h3>
          {engineReadings.length === 0 && !naming?.unmatched && (
            <p className="px-interp-none">
              {bridgeConnected ? "No engine reading for this set." : "Engine offline — start it for ranked confidence + alternatives."}
            </p>
          )}

          {/* No registered chord quality matches — but the engine still knows plenty
              about the set. Two kinds of reading, deliberately kept apart: what it
              CONTAINS (partial readings of what was played) vs what it ALMOST IS
              (one pc swap away). Collapsing them would answer the wrong question. */}
          {engineReadings.length === 0 && naming?.unmatched && (() => {
            const u = naming.unmatched;
            const q = (r: { rootPc: number; quality: string }) => noteName(r.rootPc) + qualitySymbol(r.quality);
            return (
              <div className="px-unmatched">
                <p className="px-interp-none">
                  No registered chord quality matches this set — the engine won&apos;t invent one. Here is
                  what it does know:
                </p>

                <div className="px-unmatched-ident">
                  prime form [{u.primeForm.join(" ")}] · normal order [{u.normalOrder.join(" ")}] ·
                  interval vector [{u.intervalVector.join(" ")}]
                </div>

                {u.qualitySubsets.length > 0 && (
                  <>
                    <div className="px-unmatched-h">contains</div>
                    {u.qualitySubsets.map((s, i) => (
                      <div key={i} className="px-interp-card engine">
                        <div className="px-interp-row">
                          <span className="px-interp-name">{q(s)}</span>
                          <span className="px-interp-score">
                            + {s.addedPcs.map((p) => noteName(p)).join(" ")}
                          </span>
                        </div>
                        <div className="px-interp-sub">
                          a {q(s)} plus {s.addedPcs.length === 1 ? "an unexplained tone" : "unexplained tones"}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {u.nearQualities.length > 0 && (
                  <>
                    <div className="px-unmatched-h">
                      one note away
                      {u.nearQualityCount > u.nearQualities.length && (
                        <span className="px-unmatched-more"> · showing {u.nearQualities.length} of {u.nearQualityCount}</span>
                      )}
                    </div>
                    <div className="px-unmatched-chips">
                      {u.nearQualities.map((n, i) => (
                        <span key={i} className="px-unmatched-chip" title={`Swap ${noteName(n.swapFromPc)} → ${noteName(n.swapToPc)}`}>
                          {q(n)}
                          <span className="px-unmatched-swap">{noteName(n.swapFromPc)}→{noteName(n.swapToPc)}</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {u.containingScales.length > 0 && (
                  <>
                    <div className="px-unmatched-h">
                      sits inside
                      {u.containingScaleCount > u.containingScales.length && (
                        <span className="px-unmatched-more"> · showing {u.containingScales.length} of {u.containingScaleCount}</span>
                      )}
                    </div>
                    <div className="px-unmatched-chips">
                      {u.containingScales.map((c, i) => (
                        <span key={i} className={"px-unmatched-chip scale" + (i === 0 ? " lead" : "")}>
                          {noteName(c.rootPc)} {c.name}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
          {engineReadings.map((r, i) => {
            const pct = Math.max(2, Math.round((Math.max(0, r.score) / maxScore) * 100));
            return (
              <div key={i} className={"px-interp-card engine" + (i === 0 ? " top" : "")}>
                <div className="px-interp-row">
                  <span className="px-interp-name">{engName(r)}</span>
                  <span className="px-interp-score">{r.score.toFixed(2)}</span>
                </div>
                <div className="px-interp-meter">
                  <span className="px-interp-meter-fill" style={{ width: pct + "%" }} />
                </div>
                <div className="px-interp-sub">
                  {r.functionalRole || "—"}
                  {i === 0 && margin != null && <span className="px-interp-margin"> · margin {margin.toFixed(2)}</span>}
                </div>
              </div>
            );
          })}
        </section>

        {/* Local analyzer — parallel candidates */}
        <section className="px-interp-col local">
          <h3 className="px-interp-col-h">
            <span className="px-interp-dot local" />
            Local analyzer
          </h3>
          {localReadings.length === 0 && <p className="px-interp-none">No standard name locally.</p>}
          {localReadings.map((c, i) => (
            <div key={i} className={"px-interp-card local" + (c.primary ? " top" : "")}>
              <div className="px-interp-row">
                <span className="px-interp-name">{c.name}</span>
              </div>
              {c.sub && <div className="px-interp-sub">{c.sub}</div>}
            </div>
          ))}
          {"voicing" in local && local.voicing && (
            <div className="px-interp-voicing">
              <span className="px-interp-voicing-lbl">Voicing</span> {local.voicing}
            </div>
          )}
        </section>
      </div>

      {keySection}
    </div>
  );
}
