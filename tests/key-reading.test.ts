// keyReadingAt (lib/state/analysis.ts) — the data behind "competing key readings at
// the playhead". Its whole job is to expose what the displayed strip HIDES, so the
// invariants worth pinning are the disagreement cases: a sub-gate region the strip
// absorbed, and a structural band that differs from the engine's windowed reading.

import { test } from "node:test";
import assert from "node:assert/strict";
import { keyReadingAt, windowedKeyBands, KEY_MARGIN_GATE } from "../src/lib/state/analysis.ts";
import type { FileAnalysis } from "../src/lib/tonality/parse.ts";

const region = (startSec: number, endSec: number, tonicPc: number, mode: string, meanMargin: number) =>
  ({ startSec, endSec, tonicPc, mode, meanScore: 0.8, meanMargin });

/** C major, then a low-confidence B-minor blip, then C major again. */
const analysis = {
  key: { tonicPc: 0, mode: "major", score: 0.9, margin: 0.2, profileVersion: "kk-1982.1", candidates: [] },
  segments: [],
  keyRegions: [
    region(0, 10, 0, "major", 0.12),
    region(10, 12, 11, "minor", 0.0005), // a coin-flip the strip absorbs
    region(12, 20, 7, "major", 0.11),
  ],
  readLosses: [],
} as unknown as FileAnalysis;

test("reports the engine's raw reading even where the strip absorbed it", () => {
  const bands = windowedKeyBands(analysis);
  const r = keyReadingAt(analysis, bands, 11); // inside the blip
  assert.equal(r.raw?.tonicPc, 11);
  assert.equal(r.raw?.mode, "minor");
  assert.ok(r.belowGate, "0.0005 is under the gate");
  // the strip absorbed the blip into the preceding C major, so they disagree
  assert.equal(r.displayed?.tonicPc, 0);
  assert.equal(r.overridden, true);
});

test("no override where the strip agrees with the engine", () => {
  const bands = windowedKeyBands(analysis);
  const r = keyReadingAt(analysis, bands, 5);
  assert.equal(r.raw?.tonicPc, 0);
  assert.equal(r.displayed?.tonicPc, 0);
  assert.equal(r.overridden, false);
  assert.equal(r.belowGate, false);
});

test("a confident region is never marked below-gate, and survives into the strip", () => {
  const bands = windowedKeyBands(analysis);
  const r = keyReadingAt(analysis, bands, 15);
  assert.equal(r.raw?.tonicPc, 7);
  assert.equal(r.displayed?.tonicPc, 7, "0.11 clears the gate, so G major is its own band");
  assert.equal(r.overridden, false);
  assert.ok(r.raw!.meanMargin > KEY_MARGIN_GATE);
});

test("structural-style bands that disagree with the windowed track are flagged", () => {
  // The structural reduction absorbs a modulation into one home area — the engine
  // still read G major at t=15, so the view must say the two disagree.
  const structural = [{ startSec: 0, endSec: 20, tonicPc: 0, mode: "major", label: "C maj" }];
  const r = keyReadingAt(analysis, structural, 15);
  assert.equal(r.raw?.tonicPc, 7);
  assert.equal(r.displayed?.tonicPc, 0);
  assert.equal(r.overridden, true);
  assert.equal(r.belowGate, false, "it disagrees because of the structural reduction, not low confidence");
});

test("outside any region / no analysis degrades to nulls without throwing", () => {
  const bands = windowedKeyBands(analysis);
  const past = keyReadingAt(analysis, bands, 999);
  assert.equal(past.raw, null);
  assert.equal(past.displayed, null);
  assert.equal(past.overridden, false);

  const none = keyReadingAt(null, [], 5);
  assert.deepEqual(none, { raw: null, displayed: null, overridden: false, belowGate: false });
});
