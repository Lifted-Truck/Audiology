// Stage-layout invariants (lib/layout.ts). The load-bearing one is that a stored
// order ALWAYS sanitizes to a permutation of every block — a dropped key would make
// that surface unreachable (its view toggle would turn on and nothing would appear),
// which is exactly the kind of silent data loss a saved patch could carry forever.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCK_KEYS, DEFAULT_BLOCK_ORDER, DEFAULT_BLOCK_WIDTHS,
  sanitizeBlockOrder, sanitizeBlockWidths, moveBlock,
} from "../src/lib/layout.ts";

const isPermutation = (o: readonly string[]) =>
  o.length === BLOCK_KEYS.length && new Set(o).size === BLOCK_KEYS.length && o.every((k) => (BLOCK_KEYS as readonly string[]).includes(k));

test("default order is the full block set, in the stage's historical order", () => {
  assert.deepEqual(DEFAULT_BLOCK_ORDER, [...BLOCK_KEYS]);
  assert.ok(isPermutation(DEFAULT_BLOCK_ORDER));
  assert.equal(DEFAULT_BLOCK_ORDER[0], "transport", "transport stays first by default");
});

test("sanitizeBlockOrder always returns a permutation of every block", () => {
  for (const input of [
    undefined, null, [], "nonsense", {},
    ["pcset"],                                   // partial
    ["pcset", "pcset", "pcset"],                 // duplicates
    ["bogus", "pcset", "alsoBogus"],             // unknown keys
    [...BLOCK_KEYS].reverse(),                   // full but reordered
    [...BLOCK_KEYS, "extra", "pcset"],           // full + junk + dupe
  ]) {
    const out = sanitizeBlockOrder(input);
    assert.ok(isPermutation(out), `not a permutation for ${JSON.stringify(input)}: ${out.join(",")}`);
  }
});

test("a partial stored order keeps its stated blocks first, then fills the rest", () => {
  const out = sanitizeBlockOrder(["interpret", "pcset"]);
  assert.equal(out[0], "interpret");
  assert.equal(out[1], "pcset");
  assert.ok(isPermutation(out));
  // the remainder keeps default relative order
  const rest = out.slice(2);
  const expectedRest = DEFAULT_BLOCK_ORDER.filter((k) => k !== "interpret" && k !== "pcset");
  assert.deepEqual(rest, expectedRest);
});

test("duplicates collapse to the first occurrence (order is stable, not last-wins)", () => {
  const out = sanitizeBlockOrder(["pcset", "transport", "pcset"]);
  assert.equal(out[0], "pcset");
  assert.equal(out[1], "transport");
  assert.equal(out.filter((k) => k === "pcset").length, 1);
});

test("round-trip: a valid order survives sanitize unchanged", () => {
  const custom = ["interpret", "pianoRoll", "transport", ...DEFAULT_BLOCK_ORDER.filter(
    (k) => !["interpret", "pianoRoll", "transport"].includes(k))] as typeof DEFAULT_BLOCK_ORDER;
  assert.deepEqual(sanitizeBlockOrder(custom), custom);
});

test("widths: defaults are all full (today's single-column stage)", () => {
  assert.ok(Object.values(DEFAULT_BLOCK_WIDTHS).every((w) => w === "full"));
  assert.deepEqual(Object.keys(DEFAULT_BLOCK_WIDTHS).sort(), [...BLOCK_KEYS].sort());
});

test("widths: junk and unknown keys are ignored, valid ones kept", () => {
  const w = sanitizeBlockWidths({ pcset: "half", grid: "wide", nope: "half", piano: 3 });
  assert.equal(w.pcset, "half");
  assert.equal(w.grid, "full", "invalid value falls back to full");
  assert.equal(w.piano, "full");
  assert.ok(!("nope" in w));
  assert.deepEqual(Object.keys(w).sort(), [...BLOCK_KEYS].sort());
});

test("moveBlock: drops the block in front of the target", () => {
  const order = sanitizeBlockOrder(null);
  const moved = moveBlock(order, "pcset", "transport");
  assert.equal(moved[0], "pcset");
  assert.equal(moved[1], "transport");
  assert.ok(isPermutation(moved));
});

test("moveBlock: null target appends to the end; self-drop is a no-op permutation", () => {
  const order = sanitizeBlockOrder(null);
  const toEnd = moveBlock(order, "transport", null);
  assert.equal(toEnd[toEnd.length - 1], "transport");
  assert.ok(isPermutation(toEnd));

  const self = moveBlock(order, "pcset", "pcset");
  assert.ok(isPermutation(self));
});

test("moveBlock never loses or duplicates a block, over many moves", () => {
  let order = sanitizeBlockOrder(null);
  // deterministic shuffle: walk pairs, no RNG (reproducible-core rule)
  for (let i = 0; i < BLOCK_KEYS.length; i++) {
    for (let j = 0; j < BLOCK_KEYS.length; j++) {
      order = moveBlock(order, BLOCK_KEYS[i], BLOCK_KEYS[j]);
      assert.ok(isPermutation(order), `broke moving ${BLOCK_KEYS[i]} before ${BLOCK_KEYS[j]}`);
    }
  }
});
