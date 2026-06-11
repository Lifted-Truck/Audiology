// The 8×8 Push pad grid. Presentational: App computes the cell data + styling
// functions; this just renders. Rows are drawn bottom-up (reversed) so row 0 is
// the bottom row, matching the hardware.

import React from "react";
import { octOf } from "../lib/theory";
import type { Cell, GridCell, LabelMode } from "../ui/types";

export default function Grid({
  rows,
  styleOf,
  label,
  labelMode,
  onPad,
}: {
  rows: GridCell[][];
  styleOf: (c: Cell) => React.CSSProperties;
  label: (c: Cell) => string;
  labelMode: LabelMode;
  onPad: (c: Cell) => void;
}) {
  return (
    <div className="px-grid-wrap">
      <div className="px-grid">
        {rows
          .slice()
          .reverse()
          .map((row) =>
            row.map((p) => (
              <button key={p.r + "-" + p.c} className="px-pad" style={styleOf(p)} onClick={() => onPad(p)}>
                <span className="px-pad-main">{label(p)}</span>
                {labelMode === "note" && <span className="px-pad-oct">{octOf(p.midi)}</span>}
                {p.isVoice && <span className="px-pad-voice">{p.voiceNum}</span>}
              </button>
            ))
          )}
      </div>
    </div>
  );
}
