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
import { analyzeSelection } from "../lib/theory";
import { qualitySymbol, type ChordNaming } from "../lib/tonality";

interface Props {
  /** Current chord's pitch classes (folded). */
  pcs: number[];
  /** The realized (register-specific) MIDI, when there is one — drives voicing/position. */
  realizationMidi: number[];
  /** Tonality's naming (chosen + ranked alternatives + ambiguity), or null if offline/absent. */
  naming: ChordNaming | null;
  bridgeConnected: boolean;
  noteName: (pc: number) => string;
}

/** Strip an inversion slash ("C/E" → "C") so engine (pc-level) and local
 *  (realization-level) names can be loosely compared for agreement. */
const baseName = (n: string) => n.split("/")[0].trim();

export default function Interpretations({ pcs, realizationMidi, naming, bridgeConnected, noteName }: Props) {
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

  if (pcs.length < 2) {
    return (
      <div className="px-interp">
        <p className="px-interp-lead">Play or build a chord (2+ notes) to see how it can be read.</p>
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
          {engineReadings.length === 0 && (
            <p className="px-interp-none">
              {bridgeConnected ? "No engine reading for this set." : "Engine offline — start it for ranked confidence + alternatives."}
            </p>
          )}
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
    </div>
  );
}
