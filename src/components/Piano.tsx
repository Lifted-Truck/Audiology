// The C2–C6 piano keyboard. White keys are laid out left-to-right; black keys
// are absolutely positioned after their white neighbour. App supplies the per-
// key accent + label; this renders the markup (unchanged from the monolith).

import React from "react";
import { octOf } from "../lib/theory";
import { WW, BW, WH, BH } from "../geometry/piano";
import type { Cell, WhiteKey, BlackKey, KeyAccent, LabelMode } from "../ui/types";

export default function Piano({
  whites,
  blacks,
  accentOf,
  label,
  labelMode,
  onPad,
}: {
  whites: WhiteKey[];
  blacks: BlackKey[];
  accentOf: (c: Cell) => KeyAccent | null;
  label: (c: Cell) => string;
  labelMode: LabelMode;
  onPad: (c: Cell) => void;
}) {
  return (
    <div className="px-piano-scroll">
      <div className="px-piano" style={{ width: whites.length * WW, height: WH }}>
        {whites.map((p, i) => {
          const a = accentOf(p);
          const lit = !!a && !a.dashed;
          return (
            <button
              key={p.midi}
              className={"px-wkey" + (lit ? " lit" : "") + (a && a.strong ? " strong" : "")}
              style={{
                left: i * WW,
                width: WW,
                height: WH,
                background: lit ? a!.c : undefined,
                boxShadow: a && a.strong ? "0 0 14px " + a.c : undefined,
                ...(a && a.dashed ? { borderColor: a.c, borderStyle: "dashed" } : {}),
              }}
              onClick={() => onPad(p)}
            >
              {a && a.badge && <span className="px-pad-voice">{a.badge}</span>}
              <span className="px-key-lbl" style={{ color: lit ? "#0a0c10" : a && a.dashed ? a.c : "#2a3340" }}>
                {label(p)}
              </span>
              {labelMode === "note" && (
                <span className="px-key-oct" style={{ color: lit ? "#0a0c10" : "#9aa4b2" }}>
                  {octOf(p.midi)}
                </span>
              )}
            </button>
          );
        })}
        {blacks.map((p) => {
          const a = accentOf(p);
          const lit = !!a && !a.dashed;
          return (
            <button
              key={p.midi}
              className={"px-bkey" + (lit ? " lit" : "") + (a && a.strong ? " strong" : "")}
              style={{
                left: (p.after + 1) * WW - BW / 2,
                width: BW,
                height: BH,
                background: lit ? a!.c : undefined,
                boxShadow: a && a.strong ? "0 0 14px " + a.c : undefined,
                ...(a && a.dashed ? { borderColor: a.c, borderStyle: "dashed" } : {}),
              }}
              onClick={() => onPad(p)}
            >
              {a && a.badge && <span className="px-pad-voice">{a.badge}</span>}
              <span className="px-key-lbl" style={{ color: lit ? "#0a0c10" : a && a.dashed ? a.c : "#9aa4b2" }}>
                {label(p)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
