// MCP/HTTP tool-layer contract (src/mcp/tools.ts) — the published data model both
// transports serve. If a shape here changes, MCP_MODEL_VERSION must bump (these
// tests are the tripwire for accidental contract drift).

import { test } from "node:test";
import assert from "node:assert/strict";
import { identifyChord, setClassInfo, scalesContainingTool, envelope, TOOLS, MCP_MODEL_VERSION } from "../src/mcp/tools.ts";

test("model version is 0.2.0 (bumped when render_* landed)", () => {
  assert.equal(MCP_MODEL_VERSION, "0.2.0");
});

test("registry: the published tool set (drift here ⇒ bump MCP_MODEL_VERSION)", () => {
  assert.deepEqual(TOOLS.map((t) => t.name), [
    "identify_chord", "set_class_info", "scales_containing",
    "render_bracelet", "render_keyboard", "render_staff",
  ]);
  assert.ok(TOOLS.every((t) => t.inputSchema && typeof t.handler === "function"));
});

test("render_* tools return self-contained SVG with dimensions", () => {
  const byName = (n: string) => TOOLS.find((t) => t.name === n)!;
  const b = byName("render_bracelet").handler({ pcs: [0, 4, 7] }) as { svg: string; width: number; height: number };
  assert.ok(b.svg.startsWith("<svg") && b.svg.includes("</svg>") && b.width > 0 && b.height > 0);
  assert.ok(b.svg.includes("<polygon")); // the set is joined into a bracelet
  const k = byName("render_keyboard").handler({ pcs: [0, 4, 7], lo: 60, hi: 71 }) as { svg: string };
  assert.ok(k.svg.startsWith("<svg") && k.svg.includes("<rect"));
  const s = byName("render_staff").handler({ midis: [60, 64, 67, 71] }) as { svg: string };
  assert.equal((s.svg.match(/<ellipse/g) || []).length, 4); // four noteheads
  // spelling reaches the render
  const flat = byName("render_staff").handler({ midis: [70], useFlats: true }) as { svg: string };
  assert.ok(flat.svg.includes("♭"));
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
