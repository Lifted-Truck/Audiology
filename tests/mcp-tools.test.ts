// MCP/HTTP tool-layer contract (src/mcp/tools.ts) — the published data model both
// transports serve. If a shape here changes, MCP_MODEL_VERSION must bump (these
// tests are the tripwire for accidental contract drift).

import { test } from "node:test";
import assert from "node:assert/strict";
import { identifyChord, setClassInfo, scalesContainingTool, envelope, TOOLS, MCP_MODEL_VERSION } from "../src/mcp/tools.ts";

test("registry: three v1 tools, each with a schema and handler", () => {
  assert.deepEqual(TOOLS.map((t) => t.name), ["identify_chord", "set_class_info", "scales_containing"]);
  assert.ok(TOOLS.every((t) => t.inputSchema && typeof t.handler === "function"));
});

test("envelope stamps the model version and tool name", () => {
  const e = envelope("set_class_info", { x: 1 });
  assert.equal(e.audiology_mcp_version, MCP_MODEL_VERSION);
  assert.equal(e.tool, "set_class_info");
  assert.deepEqual(e.result, { x: 1 });
});

test("identify_chord: Cmaj7 root position; dom7 voicing reads C7", () => {
  const a = identifyChord({ midis: [60, 64, 67, 71] });
  assert.equal(a.kind, "candidates");
  assert.equal((a as any).candidates[0].name, "Cmaj7");
  const b = identifyChord({ midis: [60, 64, 67, 70] });
  assert.equal((b as any).candidates[0].name, "C7");
});

test("identify_chord rejects non-numeric input", () => {
  assert.throws(() => identifyChord({ midis: ["x"] as unknown as number[] }));
});

test("set_class_info: major triad — prime [0,3,7], chiral, |f5|≈1.93, complement 9 pcs", () => {
  const r = setClassInfo({ pcs: [0, 4, 7] });
  assert.deepEqual(r.prime_form, [0, 3, 7]);
  assert.equal(r.symmetry.chiral, true);
  assert.ok(Math.abs(r.consonance_f5 - 1.9319) < 0.001);
  assert.equal(r.complement.length, 9);
  assert.ok(r.colour.tonal.css.startsWith("oklch("));
});

test("scales_containing: C major triad is the maj chord; sits inside C Major Pentatonic", () => {
  const r = scalesContainingTool({ pcs: [0, 4, 7] });
  assert.ok(r.exact.some((m) => m.kind === "chord" && m.name === "maj" && m.root_pc === 0));
  assert.ok(r.contained_by.some((m) => m.scale === "Major Pentatonic" && m.root_pc === 0));
});
