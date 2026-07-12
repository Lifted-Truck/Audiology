// Interval-vector recovery from DFT magnitudes (lib/theory/chord-anatomy.ts) —
// the exactness proof behind the engine-consume path (the engine returns DFT
// magnitudes but not the interval vector; ChordAnatomy/PcSetLab reconstruct it).
// Exhaustive over all 4095 non-empty pc-sets: recovery must equal the direct
// pairwise count everywhere, or the engine-connected histogram silently lies.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dft, intervalVector, intervalVectorFromMagnitudes } from "../src/lib/theory/chord-anatomy.ts";

test("IV recovered from |f1..f6| + cardinality is exact for all 4095 pc-sets", () => {
  for (let mask = 1; mask < 4096; mask++) {
    const pcs: number[] = [];
    for (let p = 0; p < 12; p++) if (mask & (1 << p)) pcs.push(p);
    const mags = dft(pcs).slice(1).map((c) => c.mag); // |f1..f6|
    const got = intervalVectorFromMagnitudes(mags, pcs.length);
    const want = intervalVector(pcs);
    assert.deepEqual(got, want, `mismatch at pcs {${pcs.join(",")}}`);
  }
});
