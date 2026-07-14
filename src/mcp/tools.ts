// Audiology MCP — the tool layer (v1). Pure, transport-agnostic handlers over the
// React-free core (`lib/theory`): the server (server.ts) is a thin wrapper that
// registers these over stdio. Keeping the handlers here means they are Node-testable
// without a running MCP client, and a future HTTP transport reuses them unchanged.
//
// Boundary (per docs/proposals/audiology-mcp.md): these expose AUDIOLOGY's
// analysis/derivation layer (chord ID, the somatic colours, chirality, set-class
// identity, the local scale catalog). Where Tonality owns the deeper theory, a later
// version proxies the engine; v1 is the standalone-local surface. Representation
// (render_* → SVG) is v2 and needs the headless-renderer extraction.

import {
  analyzeSelection, SHARP,
  intervalVector, primeFormLocal, normalOrder, pcBitmask, setClassLabel,
  transpositionalSymmetry, inversionalAxes, complement, modesOf, exactNames,
  scalesContaining, chirality, consonanceF5, tonalColor, intervalColor,
} from "../lib/theory";
import { braceletSvg, keyboardSvg, staffSvg } from "../lib/render";

/** Version of the published data model — stamped on every result so consumers can
 *  pin it (the versioned-contract discipline; bump on any shape change).
 *  0.2.0: added the render_* tools (representation-as-SVG). */
export const MCP_MODEL_VERSION = "0.2.0";

const NAME = (pc: number) => SHARP[((pc % 12) + 12) % 12];
const norm = (pcs: number[]) => [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b);
const round = (n: number, d = 4) => Number(n.toFixed(d));

// ----- tool: identify_chord ----------------------------------------------------

export interface IdentifyChordInput { midis: number[] }

/** Name a set of MIDI notes as a chord — Audiology's `analyzeSelection`, normalized
 *  to plain JSON (candidates ranked, root-position first). */
export function identifyChord({ midis }: IdentifyChordInput) {
  if (!Array.isArray(midis) || midis.some((m) => !Number.isFinite(m))) {
    throw new Error("identify_chord: `midis` must be an array of MIDI note numbers");
  }
  const res = analyzeSelection(midis, NAME);
  return {
    input: { midis },
    ...("empty" in res
      ? { kind: "empty" as const }
      : "single" in res
        ? { kind: "single" as const, text: res.text }
        : "none" in res
          ? { kind: "none" as const, pcs: res.pcs, bassPc: res.bassPc, intervals: res.intervals }
          : {
              kind: "candidates" as const,
              pcs: res.pcs,
              bassPc: res.bassPc,
              voicing: "voicing" in res ? res.voicing : undefined,
              candidates: res.candidates.map((c) => ({ name: c.name, sub: c.sub, primary: !!c.primary })),
            }),
  };
}

// ----- tool: set_class_info ----------------------------------------------------

export interface SetClassInput { pcs: number[] }

/** Audiology's set-class identity for a pitch-class set — prime form + interval
 *  vector + symmetry PLUS the derivation layer Tonality doesn't serve: chirality,
 *  |f5| consonance, and the two somatic colours. */
export function setClassInfo({ pcs }: SetClassInput) {
  const u = norm(pcs);
  const trans = transpositionalSymmetry(u);
  const tc = tonalColor(u);
  const ic = intervalColor(u);
  return {
    input: { pcs: u },
    cardinality: u.length,
    normal_order: normalOrder(u),
    prime_form: primeFormLocal(u),
    interval_vector: intervalVector(u),
    set_class_steps: setClassLabel(u),
    mask: pcBitmask(u),
    symmetry: {
      transpositional_degree: trans.degree,
      transpositional_period: trans.period,
      inversional_axes: inversionalAxes(u),
      chiral: inversionalAxes(u) === 0,
    },
    chirality: round(chirality(u)),
    consonance_f5: round(consonanceF5(u)),
    complement: complement(u),
    colour: {
      tonal: { hue: Math.round(tc.hue), focus: round(tc.focus, 3), css: tc.css },
      interval: { hue: Math.round(ic.hue), focus: round(ic.focus, 3), css: ic.css },
    },
  };
}

// ----- tool: scales_containing -------------------------------------------------

export interface ScalesInput { pcs: number[] }

/** Which catalog scales/chords a pc-set IS (exact, up to transposition) or sits
 *  inside, plus its modes. Local catalog (the standalone fallback); a later version
 *  proxies Tonality's `scale_names` for full breadth. */
export function scalesContainingTool({ pcs }: ScalesInput) {
  const u = norm(pcs);
  return {
    input: { pcs: u },
    exact: exactNames(u).map((m) => ({ kind: m.kind, name: m.name, root_pc: m.rootPc, push_available: m.pushAvailable })),
    contained_by: scalesContaining(u)
      .filter((m) => !m.exact)
      .slice(0, 12)
      .map((m) => ({ scale: m.scale, root_pc: m.root, extra_notes: m.extra })),
    modes:
      u.length >= 2 && u.length <= 8
        ? modesOf(u).map((m) => ({ degree: m.degree, root_pc: m.rootPc, intervals: m.intervals, name: m.name }))
        : [],
    note: "local catalog (standalone fallback); Tonality's scale_names gives the authoritative breadth",
  };
}

// ----- registry ----------------------------------------------------------------

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: any) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const pcsSchema = {
  type: "object",
  properties: { pcs: { type: "array", items: { type: "integer" }, description: "Pitch classes (any integers; folded to 0..11)" } },
  required: ["pcs"],
};

/** Wrap a handler's result in the versioned envelope. */
export function envelope(tool: string, result: unknown) {
  return { audiology_mcp_version: MCP_MODEL_VERSION, tool, result };
}

export const TOOLS: ToolDef[] = [
  {
    name: "identify_chord",
    description: "Name a set of MIDI notes as a chord (ranked candidates, inversions, bass).",
    inputSchema: {
      type: "object",
      properties: { midis: { type: "array", items: { type: "integer" }, description: "MIDI note numbers (C3=60)" } },
      required: ["midis"],
    },
    handler: identifyChord,
  },
  {
    name: "set_class_info",
    description: "Set-class identity for a pitch-class set: prime form, normal order, interval vector, mask, transpositional + inversional symmetry, chirality, |f5| consonance, complement, and the two somatic colours.",
    inputSchema: pcsSchema,
    handler: setClassInfo,
  },
  {
    name: "scales_containing",
    description: "Which catalog scales/chords a pc-set IS (exact) or sits inside, plus its modes.",
    inputSchema: pcsSchema,
    handler: scalesContainingTool,
  },
  {
    name: "render_bracelet",
    description: "Render a pitch-class set as a bracelet (pitch-class clock) — a portable, self-contained SVG string. `rootPc` marks a tonic; `useFlats` spells with flats.",
    inputSchema: {
      type: "object",
      properties: {
        pcs: { type: "array", items: { type: "integer" }, description: "Pitch classes (folded to 0..11)" },
        rootPc: { type: "integer", description: "Optional tonic to ring" },
        useFlats: { type: "boolean" },
      },
      required: ["pcs"],
    },
    handler: (a: { pcs: number[]; rootPc?: number; useFlats?: boolean }) => braceletSvg(a.pcs, { rootPc: a.rootPc, useFlats: a.useFlats }),
  },
  {
    name: "render_keyboard",
    description: "Render a piano keyboard with notes highlighted — a portable SVG string. Highlight by `midis` (register-specific) and/or `pcs` (every octave); `lo`/`hi` set the MIDI range (default 60..83).",
    inputSchema: {
      type: "object",
      properties: {
        midis: { type: "array", items: { type: "integer" } },
        pcs: { type: "array", items: { type: "integer" } },
        lo: { type: "integer" },
        hi: { type: "integer" },
      },
    },
    handler: (a: { midis?: number[]; pcs?: number[]; lo?: number; hi?: number }) => keyboardSvg(a),
  },
  {
    name: "render_staff",
    description: "Engrave MIDI notes as one simultaneity (chord/interval) on a grand staff — a portable SVG string. Proportional notation, no rhythm glyphs. `useFlats` spells with flats.",
    inputSchema: {
      type: "object",
      properties: {
        midis: { type: "array", items: { type: "integer" }, description: "MIDI note numbers to engrave together" },
        useFlats: { type: "boolean" },
      },
      required: ["midis"],
    },
    handler: (a: { midis: number[]; useFlats?: boolean }) => staffSvg(a.midis, { useFlats: a.useFlats }),
  },
];
