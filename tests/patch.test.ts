// Patch serialization invariants (lib/patch.ts) — the save/load contract. A patch
// must round-trip losslessly, and a partial / old / garbage patch must load into a
// complete valid state (defaults for anything missing or invalid) rather than crash.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePatch, toPatch, DEFAULT_PATCH, PATCH_VERSION, VIEW_KEYS } from "../src/lib/patch.ts";

test("round-trip: sanitize(JSON(toPatch(state))) === state", () => {
  const state = {
    ...DEFAULT_PATCH,
    root: 7, scaleName: "Dorian", mode: "inkey" as const, followKey: true,
    views: { ...DEFAULT_PATCH.views, score: true, console: true },
    channelPresets: { 0: "bass" as const, 3: "strings" as const }, drumChannels: [9],
    livePreset: "organ" as const, coalesceWindow: null, inversion: 2,
  };
  const wire = JSON.parse(JSON.stringify(toPatch(state, "my patch")));
  assert.equal(wire.patchVersion, PATCH_VERSION);
  assert.equal(wire.name, "my patch");
  assert.deepEqual(sanitizePatch(wire), state);
});

test("empty / non-object input yields the full default state", () => {
  assert.deepEqual(sanitizePatch({}), DEFAULT_PATCH);
  assert.deepEqual(sanitizePatch(null), DEFAULT_PATCH);
  assert.deepEqual(sanitizePatch("nope"), DEFAULT_PATCH);
});

test("invalid enum / out-of-range values fall back to defaults", () => {
  const p = sanitizePatch({ scaleName: "Bogus", mode: "sideways", root: 99, inversion: -4, livePreset: "kazoo" });
  assert.equal(p.scaleName, DEFAULT_PATCH.scaleName);
  assert.equal(p.mode, DEFAULT_PATCH.mode);
  assert.equal(p.root, 11); // clamped into 0..11
  assert.equal(p.inversion, 0); // clamped into 0..6
  assert.equal(p.livePreset, DEFAULT_PATCH.livePreset);
});

test("partial patch fills the rest from defaults; unknown fields ignored", () => {
  const p = sanitizePatch({ followKey: true, bogusField: 123 });
  assert.equal(p.followKey, true);
  assert.equal(p.showScaleColors, DEFAULT_PATCH.showScaleColors);
  assert.ok(!("bogusField" in p));
});

test("views: known keys kept, unknown dropped, missing defaulted", () => {
  const p = sanitizePatch({ views: { score: true, transport: false, nope: true } });
  assert.equal(p.views.score, true);
  assert.equal(p.views.transport, false);
  assert.equal(p.views.piano, DEFAULT_PATCH.views.piano); // missing → default
  assert.ok(!("nope" in p.views));
  assert.deepEqual(Object.keys(p.views).sort(), [...VIEW_KEYS].sort());
});

test("channelPresets: bad channels/presets filtered out", () => {
  const p = sanitizePatch({ channelPresets: { 0: "bass", 1: "notapreset", x: "piano" } });
  assert.deepEqual(p.channelPresets, { 0: "bass" });
});

test("coalesceWindow: null stays null, valid number kept, junk → default", () => {
  assert.equal(sanitizePatch({ coalesceWindow: null }).coalesceWindow, null);
  assert.equal(sanitizePatch({ coalesceWindow: 0.25 }).coalesceWindow, 0.25);
  assert.equal(sanitizePatch({ coalesceWindow: "x" }).coalesceWindow, DEFAULT_PATCH.coalesceWindow);
});
