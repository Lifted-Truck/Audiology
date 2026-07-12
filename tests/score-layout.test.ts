// Score-layout invariants (lib/score/layout.ts) — staff positions, spelling-
// dependent steps, ledger lines, stems, cluster offsets, drum exclusion. These
// pin the engraving geometry the Score view draws from.

import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutScore, diatonicStep } from "../src/lib/score/layout.ts";
import type { Note } from "../src/lib/midi/types.ts";

const mk = (midi: number, time = 0, drum = false): Note => ({
  midi, time, duration: 0.5, endTime: time + 0.5, velocity: 0.8,
  beats: 0, durationBeats: 1, drum,
});
const OPTS = { pxPerSec: 60, useFlats: false, lineGap: 8, top: 24, staffGap: 40 };
const lay = layoutScore([mk(64), mk(60), mk(77), mk(81), mk(59), mk(36), mk(70)], OPTS);
const g = (midi: number) => lay.glyphs.find((x) => x.note.midi === midi)!;

test("staff lines: treble [24..56], gap 8", () => {
  assert.deepEqual(lay.trebleLines, [24, 32, 40, 48, 56]);
});

test("E4 sits on the treble bottom line with no ledgers", () => {
  assert.equal(g(64).y, 56);
  assert.equal(g(64).ledgerYs.length, 0);
  assert.equal(g(64).staff, "treble");
});

test("middle C takes one ledger line below the treble staff", () => {
  assert.equal(g(60).y, 64);
  assert.deepEqual(g(60).ledgerYs, [64]);
});

test("F5 on the top line (no ledger); A5 one ledger above", () => {
  assert.equal(g(77).y, 24);
  assert.equal(g(77).ledgerYs.length, 0);
  assert.deepEqual(g(81).ledgerYs, [16]);
});

test("B3 goes to the bass staff (space above the top line, no ledger)", () => {
  assert.equal(g(59).staff, "bass");
  assert.equal(g(59).y, 92);
  assert.equal(g(59).ledgerYs.length, 0);
});

test("C2 needs two ledger lines below the bass staff", () => {
  assert.equal(g(36).ledgerYs.length, 2);
});

test("spelling changes staff position: A#4 (step 33, ♯) vs Bb4 (step 34, ♭)", () => {
  assert.deepEqual(diatonicStep(70, false), { step: 33, accidental: 1 });
  assert.deepEqual(diatonicStep(70, true), { step: 34, accidental: -1 });
});

test("stem direction: below the middle line → up", () => {
  assert.equal(g(70).stemDir, 1); // A#4 below the treble middle line (B4)
});

test("chord seconds offset one notehead", () => {
  const l2 = layoutScore([mk(60, 1), mk(62, 1)], OPTS);
  assert.deepEqual(l2.glyphs.map((x) => x.xOffset > 0), [false, true]);
});

test("drums are excluded (unpitched)", () => {
  assert.equal(layoutScore([mk(60, 0, true)], OPTS).glyphs.length, 0);
});
