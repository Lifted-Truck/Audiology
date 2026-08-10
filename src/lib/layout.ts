// Stage layout — which surface blocks the stage shows, in what order, at what width.
// Pure + React-free + Node-tested, like lib/patch (which serializes this).
//
// The blocks are the draggable units of the stage. They are NOT the same list as
// App's ViewKey: bracelet / tonnetz / circle share one "diagrams" block (they live
// in a shared row), so a view can be toggled independently of where its block sits.
// Splitting those into their own blocks is the next step toward the freeform
// canvas — the block list is the seam that makes it a local change.
//
// The load-bearing invariant is in `sanitizeBlockOrder`: whatever a stored patch
// says, the result must be a PERMUTATION of every known block. A stored order that
// dropped a key would silently make that surface unreachable — the view toggle
// would turn it on and nothing would appear.

export const BLOCK_KEYS = [
  "transport", "pianoRoll", "score", "grid", "piano", "diagrams",
  "anatomy", "console", "interpret", "pcset", "instruments",
] as const;
export type BlockKey = (typeof BLOCK_KEYS)[number];

/** Human labels for the layout controls (the stage captions stay where they are). */
export const BLOCK_LABELS: Record<BlockKey, string> = {
  transport: "Transport",
  pianoRoll: "Piano roll",
  score: "Score",
  grid: "Push grid",
  piano: "Piano",
  diagrams: "Diagrams",
  anatomy: "Chord anatomy",
  console: "Analysis console",
  interpret: "Interpretations",
  pcset: "Pc-set lab",
  instruments: "Instruments",
};

/** The order the stage has always rendered in — the default, so nothing moves on upgrade. */
export const DEFAULT_BLOCK_ORDER: BlockKey[] = [...BLOCK_KEYS];

export type BlockWidth = "full" | "half";

/** Everything full-width = today's single-column stage, exactly. */
export const DEFAULT_BLOCK_WIDTHS: Record<BlockKey, BlockWidth> =
  Object.fromEntries(BLOCK_KEYS.map((k) => [k, "full"])) as Record<BlockKey, BlockWidth>;

/**
 * Coerce a stored order into a valid one: drop unknown keys, drop duplicates, and
 * append any missing blocks in their default position. The result always contains
 * every block exactly once — see the note above on why that matters.
 */
export function sanitizeBlockOrder(raw: unknown): BlockKey[] {
  const seen = new Set<BlockKey>();
  const out: BlockKey[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && (BLOCK_KEYS as readonly string[]).includes(v) && !seen.has(v as BlockKey)) {
        seen.add(v as BlockKey);
        out.push(v as BlockKey);
      }
    }
  }
  for (const k of DEFAULT_BLOCK_ORDER) if (!seen.has(k)) out.push(k);
  return out;
}

/** Coerce stored widths; unknown keys dropped, missing/invalid default to full. */
export function sanitizeBlockWidths(raw: unknown): Record<BlockKey, BlockWidth> {
  const out = { ...DEFAULT_BLOCK_WIDTHS };
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if ((BLOCK_KEYS as readonly string[]).includes(k) && (v === "full" || v === "half")) {
        out[k as BlockKey] = v;
      }
    }
  }
  return out;
}

/**
 * Move `key` to the slot currently held by `before` (dropping onto a block puts the
 * dragged block *in front of* it). Returns a new array; a no-op move returns an
 * equal-order array rather than throwing.
 */
export function moveBlock(order: BlockKey[], key: BlockKey, before: BlockKey | null): BlockKey[] {
  const without = order.filter((k) => k !== key);
  if (before == null || before === key) return [...without, key]; // dropped past the end
  const at = without.indexOf(before);
  if (at < 0) return [...without, key];
  return [...without.slice(0, at), key, ...without.slice(at)];
}
