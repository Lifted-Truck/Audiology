// Views panel — a Layers-style list of the stage's surfaces, in the order they
// actually appear on the stage. Replaces the old flat chip bar, which listed views
// in a FIXED order that stopped matching reality once blocks became draggable.
//
// Each row is a block: visibility toggle, name, width toggle, drag grip. The
// `diagrams` block groups three surfaces (bracelet / Tonnetz / circle), so it
// renders as a parent row with three child toggles — its own visibility follows
// from whether any child is on.
//
// Reordering here and reordering on the stage are the same operation (`moveBlock`
// over the shared `blockOrder`), so the two can never disagree.

import { BLOCK_LABELS, BLOCK_VIEWS, VIEW_LABELS, type BlockKey, type BlockWidth } from "../lib/layout";

interface Props {
  order: BlockKey[];
  widths: Record<BlockKey, BlockWidth>;
  views: Record<string, boolean>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onToggleView: (view: string) => void;
  onSetWidth: (k: BlockKey, w: BlockWidth) => void;
  onMove: (dragged: BlockKey, before: BlockKey) => void;
  dragKey: BlockKey | null;
  overKey: BlockKey | null;
  onDragKey: (k: BlockKey | null) => void;
  onOverKey: (k: BlockKey | null) => void;
  /** Right-aligned actions (patch / bundle buttons) — kept visible when collapsed. */
  actions?: React.ReactNode;
}

export default function ViewsPanel({
  order, widths, views, open, onOpenChange, onToggleView, onSetWidth,
  onMove, dragKey, overKey, onDragKey, onOverKey, actions,
}: Props) {
  const shownCount = order.filter((k) => BLOCK_VIEWS[k].some((v) => views[v])).length;

  return (
    <div className="px-layers">
      <div className="px-layers-head">
        <button
          className="px-layers-toggle"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          title={open ? "Collapse the views list" : "Expand the views list"}
        >
          <span className="px-layers-caret">{open ? "▾" : "▸"}</span>
          Views
          <span className="px-layers-count">{shownCount}/{order.length}</span>
        </button>
        {actions}
      </div>

      {open && (
        <ul className="px-layers-list">
          {order.map((k) => {
            const viewKeys = BLOCK_VIEWS[k];
            const grouped = viewKeys.length > 1;
            const anyOn = viewKeys.some((v) => views[v]);
            return (
              <li
                key={k}
                className={
                  "px-layer" +
                  (anyOn ? " on" : "") +
                  (dragKey === k ? " dragging" : "") +
                  (overKey === k && dragKey !== k ? " dragover" : "")
                }
                onDragOver={(e) => {
                  if (!dragKey) return;
                  e.preventDefault();
                  if (overKey !== k) onOverKey(k);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragKey) onMove(dragKey, k);
                  onDragKey(null);
                  onOverKey(null);
                }}
              >
                <div className="px-layer-row">
                  <div
                    className="px-layer-grip"
                    draggable
                    onDragStart={(e) => {
                      onDragKey(k);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", k); // Firefox needs a payload
                    }}
                    onDragEnd={() => { onDragKey(null); onOverKey(null); }}
                    title={`Drag to move ${BLOCK_LABELS[k]}`}
                    role="button"
                    aria-label={`Move ${BLOCK_LABELS[k]}`}
                  >
                    ⠿
                  </div>

                  {/* A grouped block has no single view to toggle — its children do. */}
                  <button
                    className={"px-layer-eye" + (anyOn ? " on" : "")}
                    onClick={() => {
                      if (grouped) {
                        // Turn the whole group off, or restore all of it.
                        viewKeys.forEach((v) => { if (views[v] === anyOn) onToggleView(v); });
                      } else {
                        onToggleView(viewKeys[0]);
                      }
                    }}
                    title={anyOn ? `Hide ${BLOCK_LABELS[k]}` : `Show ${BLOCK_LABELS[k]}`}
                    aria-pressed={anyOn}
                  >
                    {anyOn ? "◉" : "○"}
                  </button>

                  <span className="px-layer-name">{BLOCK_LABELS[k]}</span>

                  <button
                    className="px-layer-width"
                    onClick={() => onSetWidth(k, widths[k] === "half" ? "full" : "half")}
                    title={widths[k] === "half" ? "Half width — click for full" : "Full width — click for half"}
                  >
                    {widths[k] === "half" ? "◧" : "▭"}
                  </button>
                </div>

                {grouped && (
                  <div className="px-layer-kids">
                    {viewKeys.map((v) => (
                      <button
                        key={v}
                        className={"px-layer-kid" + (views[v] ? " on" : "")}
                        onClick={() => onToggleView(v)}
                        aria-pressed={!!views[v]}
                      >
                        <span className="px-layer-kid-dot">{views[v] ? "◉" : "○"}</span>
                        {VIEW_LABELS[v] ?? v}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
