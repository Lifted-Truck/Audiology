// Chord identifier. Takes any set of MIDI notes (manual selection in Analyze
// mode, or currently-sounding notes in Live mode) and returns a tagged union.

import { mod, pcOf } from "./pitch";
import { FORMULAS, INTERVAL_NAMES } from "./constants";
import type { AnalysisResult, ChordCandidate } from "./types";

export function analyzeSelection(
  midis: number[],
  noteName: (pc: number) => string
): AnalysisResult {
  if (midis.length === 0) return { empty: true };
  const pcs = Array.from(new Set(midis.map(pcOf))).sort((a, b) => a - b);
  const bassPc = pcOf(Math.min(...midis));

  if (pcs.length === 1)
    return { single: true, text: noteName(pcs[0]) + " — single note" };

  if (pcs.length === 2) {
    const other = pcs[0] === bassPc ? pcs[1] : pcs[0];
    const gap = mod(other - bassPc, 12);
    const cands: ChordCandidate[] = [
      { name: noteName(bassPc) + "–" + noteName(other), sub: INTERVAL_NAMES[gap] || "interval", primary: true },
    ];
    if (gap === 7 || gap === 5)
      cands.push({ name: noteName(gap === 7 ? bassPc : other) + "5", sub: "power chord", primary: false });
    return { candidates: cands, pcs, bassPc };
  }

  const raw: { root: number; suffix: string; isRoot: boolean }[] = [];
  for (const r of pcs) {
    const iv = pcs.map((p) => mod(p - r, 12)).sort((a, b) => a - b).join(",");
    if (FORMULAS[iv] !== undefined) raw.push({ root: r, suffix: FORMULAS[iv], isRoot: r === bassPc });
  }
  if (raw.length === 0) {
    const intervals = pcs.map((p) => mod(p - bassPc, 12)).sort((a, b) => a - b);
    return { none: true, pcs, bassPc, intervals };
  }
  raw.sort((a, b) => (b.isRoot ? 1 : 0) - (a.isRoot ? 1 : 0));
  const candidates: ChordCandidate[] = raw.map((c) => ({
    name: noteName(c.root) + c.suffix + (c.isRoot ? "" : "/" + noteName(bassPc)),
    sub: c.isRoot ? "root position" : "slash / inversion",
    primary: c.isRoot,
  }));
  return { candidates, pcs, bassPc };
}
