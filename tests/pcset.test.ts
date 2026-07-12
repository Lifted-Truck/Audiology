// Pc-set set-theory invariants (lib/theory/pcset.ts) — the Layer-0 deterministic
// gate for the maths behind the Pc-set lab. Known-answer tests against standard
// music-theory facts; anything here failing means wrong output, not style.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalOrder, primeFormLocal, transpositionalSymmetry, inversionalAxes,
  complement, invert, transpose, exactNames, modesOf,
} from "../src/lib/theory/pcset.ts";
import { intervalVector } from "../src/lib/theory/chord-anatomy.ts";

test("prime form: major/minor triads share [0,3,7]", () => {
  assert.deepEqual(primeFormLocal([0, 4, 7]), [0, 3, 7]);
  assert.deepEqual(primeFormLocal([0, 3, 7]), [0, 3, 7]);
});

test("prime form: major scale = [0,1,3,5,6,8,10]", () => {
  assert.deepEqual(primeFormLocal([0, 2, 4, 5, 7, 9, 11]), [0, 1, 3, 5, 6, 8, 10]);
});

test("normal order: major scale packs to [11,0,2,4,5,7,9]", () => {
  assert.deepEqual(normalOrder([0, 2, 4, 5, 7, 9, 11]), [11, 0, 2, 4, 5, 7, 9]);
});

test("interval vector: major scale [2,5,4,3,6,1]; major triad [0,0,1,1,1,0]", () => {
  assert.deepEqual(intervalVector([0, 2, 4, 5, 7, 9, 11]), [2, 5, 4, 3, 6, 1]);
  assert.deepEqual(intervalVector([0, 4, 7]), [0, 0, 1, 1, 1, 0]);
});

test("transpositional symmetry: whole-tone 6-fold/period-2, aug 3/4, dim7 4/3, triad none", () => {
  assert.deepEqual(transpositionalSymmetry([0, 2, 4, 6, 8, 10]), { degree: 6, period: 2 });
  assert.deepEqual(transpositionalSymmetry([0, 4, 8]), { degree: 3, period: 4 });
  assert.deepEqual(transpositionalSymmetry([0, 3, 6, 9]), { degree: 4, period: 3 });
  assert.deepEqual(transpositionalSymmetry([0, 4, 7]), { degree: 1, period: null });
});

test("inversional axes: triad chiral (0), major scale 1, whole-tone 6", () => {
  assert.equal(inversionalAxes([0, 4, 7]), 0);
  assert.equal(inversionalAxes([0, 2, 4, 5, 7, 9, 11]), 1);
  assert.equal(inversionalAxes([0, 2, 4, 6, 8, 10]), 6);
});

test("complement of the major scale is the black-key pentatonic", () => {
  assert.deepEqual(complement([0, 2, 4, 5, 7, 9, 11]), [1, 3, 6, 8, 10]);
});

test("invert/transpose round-trips", () => {
  assert.deepEqual(invert(invert([0, 4, 7], 5), 5), [0, 4, 7]);
  assert.deepEqual(transpose(transpose([0, 4, 7], 5), -5), [0, 4, 7]);
});

test("exactNames: C major scale matches all seven diatonic modes, Push-flagged", () => {
  const scaleNames = exactNames([0, 2, 4, 5, 7, 9, 11]).filter((m) => m.kind === "scale");
  assert.equal(scaleNames.length, 7);
  assert.ok(scaleNames.every((m) => m.pushAvailable));
  assert.ok(scaleNames.some((m) => m.name === "Major" && m.rootPc === 0));
  assert.ok(scaleNames.some((m) => m.name === "Dorian" && m.rootPc === 2));
});

test("modesOf: 7 rotations of the diatonic set, all named", () => {
  const modes = modesOf([0, 2, 4, 5, 7, 9, 11]);
  assert.equal(modes.length, 7);
  assert.ok(modes.every((m) => m.name !== null));
});
