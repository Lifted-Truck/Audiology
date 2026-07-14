// Tiny SVG string helpers — the headless renderers (lib/render/*) build portable
// SVG strings for the MCP `render_*` tools, so a consumer (e.g. the education app)
// can show a stimulus without importing Audiology's React. React-free, Node-safe.
// Deliberately minimal: no dependency, output is a self-contained <svg> string.

export type Attrs = Record<string, string | number | undefined>;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One element. `children` (already-serialized SVG) or `text` (escaped) — not both. */
export function el(tag: string, attrs: Attrs = {}, children = ""): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${typeof v === "string" ? esc(v) : v}"`)
    .join(" ");
  const open = a ? `${tag} ${a}` : tag;
  return children === "" ? `<${open}/>` : `<${open}>${children}</${open}>`;
}

export const text = (s: string, attrs: Attrs = {}): string => {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${typeof v === "string" ? esc(v) : v}"`)
    .join(" ");
  return `<text ${a}>${esc(s)}</text>`;
};

/** Wrap serialized children in a self-contained, viewBox'd root svg. */
export function svgRoot(width: number, height: number, children: string, bg?: string): string {
  const rect = bg ? el("rect", { x: 0, y: 0, width, height, fill: bg }) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${rect}${children}</svg>`;
}

export interface Rendered {
  svg: string;
  width: number;
  height: number;
}

// Shared palette — the app's vocabulary, so exported renders match the UI.
export const COLORS = {
  bg: "#0d1117",
  line: "#2a3340",
  faint: "#5b6675",
  inSet: "#5eead4", // teal
  inSetFill: "#0a2825",
  root: "#a5b4fc", // indigo
  accent: "#fbbf24", // amber
  ink: "#e6edf3",
  black: "#0c1016",
};

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const norm = (pcs: number[]): number[] => [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b);
