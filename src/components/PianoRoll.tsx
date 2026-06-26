// Canvas piano-roll: pitch on the vertical axis (high at top), time on the
// horizontal axis, scrolling to follow the playhead. Two layers, as CLAUDE.md
// requires: the notes (and, when present, the Tonality key-region + chord-region
// strips) are rasterized once to an offscreen canvas and blitted each frame; the
// visible canvas adds only the moving playhead and the active-note glow on top.
// All pitch mapping goes through geometry/piano so it stays aligned with the Piano.

import React, { useEffect, useRef, useState } from "react";
import type { Song, Note } from "../lib/midi/types";
import { PIANO_LO, PIANO_HI, pitchToLane } from "../geometry/piano";
import { scaleDegreeLabel } from "../lib/theory/roman";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
/** MIDI number → note name + Ableton octave (C3 = 60 → octave 3). */
const noteName = (midi: number): string => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 2}`;

const LANES = PIANO_HI - PIANO_LO + 1; // semitone rows
const LANE_H_COMPACT = 5; // px per semitone (default / compact)
const LANE_H_EXPANDED = 9; // taller rows when the roll is expanded
const KEY_STRIP_H = 16; // local-key band strip height (0 when no key regions)
const PIVOT_STRIP_H = 13; // tonicization / pivot lane height (0 when no pivots)
const CHORD_STRIP_H = 17; // chord-label strip height (0 when no chord regions)
const RULER_H = 20; // bar/time ruler band height (0 when no song)
const PLAYHEAD_X = 0.28; // playhead screen position as a fraction of width

const fmtTime = (s: number): string => {
  if (!isFinite(s) || s < 0) s = 0;
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
};

export interface Region {
  startSec: number;
  endSec: number;
  /** Display label (omitted for spans used only for colouring, e.g. tonicizations). */
  label?: string;
  /** Key context (key bands only) — lets the roll colour out-of-key notes. */
  tonicPc?: number;
  mode?: string;
}

const MAJOR_PCS = [0, 2, 4, 5, 7, 9, 11];
// Minor "in key" = natural minor + the raised 6th & 7th. Harmonic/melodic minor are
// part of the minor key system, so the leading tone (used in nearly every minor
// cadence) and the melodic raised-6 shouldn't read as out-of-key. Leaves ♭2, ♮3, ♯4
// (the genuinely chromatic degrees) flagged.
const MINOR_PCS = [0, 2, 3, 5, 7, 8, 9, 10, 11];

interface Props {
  song: Song | null;
  currentTime: number;
  duration: number;
  /** Whether playback is running — the view auto-follows then (clears manual pan). */
  isPlaying: boolean;
  /** MIDI numbers sounding right now (for the glow). */
  activeNotes: number[];
  onSeek: (t: number) => void;
  /** Tonality per-segment chord labels, time-aligned (empty = no strip). */
  regions?: Region[];
  /** Tonality local-key regions, time-aligned (empty = no strip). */
  keyRegions?: Region[];
  /** Tonicizations (brief pivots) to flag distinctly on the key strip. */
  pivots?: Region[];
  /** Tonicization spans carrying their local key (tonicPc/mode) — notes inside one
   *  are coloured against that local key, not the coarse structural area. */
  tonicizations?: Region[];
  /** Playback tempo multiplier — the ruler's time labels reflect it. */
  tempoScale?: number;
  /** Horizontal zoom, pixels per second. */
  pxPerSec?: number;
}

const dpr = (): number => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
const isC = (midi: number): boolean => midi % 12 === 0;

/** Draw a horizontal strip of time-aligned regions (band + left divider + label). */
function drawStrip(
  ctx: CanvasRenderingContext2D,
  regions: Region[],
  yTop: number,
  h: number,
  fullH: number,
  pxPerSec: number,
  colors: { band: string; divider: string; text: string }
) {
  ctx.font = "600 10px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  for (const r of regions) {
    const x = r.startSec * pxPerSec;
    const w = (r.endSec - r.startSec) * pxPerSec;
    ctx.fillStyle = colors.band;
    ctx.fillRect(x, yTop, w, h);
    ctx.fillStyle = colors.divider;
    ctx.fillRect(x, 0, 1, fullH); // boundary divider, full height
    if (r.label && w > 16) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, yTop, w - 3, h);
      ctx.clip();
      ctx.fillStyle = colors.text;
      ctx.fillText(r.label, x + 4, yTop + h / 2 + 0.5);
      ctx.restore();
    }
  }
}

export default function PianoRoll({
  song,
  currentTime,
  duration,
  isPlaying,
  activeNotes,
  onSeek,
  regions = [],
  keyRegions = [],
  pivots = [],
  tonicizations = [],
  tempoScale = 1,
  pxPerSec = 60,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(600);
  const scrollXRef = useRef(0);
  const draggingRef = useRef(false);
  // Manual horizontal pan (px). null = follow the playhead. Set by the wheel,
  // cleared when playback starts so it resumes following.
  const [manualScroll, setManualScroll] = useState<number | null>(null);
  // Whether the view tracks the playhead. On (default): the roll scrolls to keep
  // the scrubber in view. Off: the view is frozen where you left it (wheel still
  // pans, clicking still seeks) — useful for studying a fixed span while it plays.
  const [follow, setFollow] = useState(true);
  const toggleFollow = () => {
    if (!follow) setManualScroll(null); // turning follow back on → recenter
    setFollow((f) => !f);
  };
  // Hover tooltip showing a strip label in full (un-truncated). null = hidden.
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  // Pinned note inspector (alt/option-click a note). null = hidden.
  const [inspect, setInspect] = useState<{ note: Note; x: number; y: number } | null>(null);
  // Expandable row height — taller lanes are easier to read and click.
  const [expanded, setExpanded] = useState(false);
  const laneH = expanded ? LANE_H_EXPANDED : LANE_H_COMPACT;
  const laneY = (midi: number): number => pitchToLane(midi) * laneH;
  const noteH = LANES * laneH;
  // Live values the (once-attached) wheel handler reads.
  const liveRef = useRef({ width, duration, manualScroll, time: currentTime });
  liveRef.current = { width, duration, manualScroll, time: currentTime };

  const rulerH = song && song.barStarts?.length ? RULER_H : 0;
  const keyStripH = keyRegions.length ? KEY_STRIP_H : 0;
  const pivotStripH = pivots.length ? PIVOT_STRIP_H : 0;
  const chordStripH = regions.length ? CHORD_STRIP_H : 0;
  const topH = rulerH + keyStripH + pivotStripH + chordStripH;
  const height = topH + noteH;

  // Resume following when playback starts (only if follow is on).
  useEffect(() => {
    if (isPlaying && follow) setManualScroll(null);
  }, [isPlaying, follow]);

  /* measure the container width */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(120, Math.floor(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* wheel over the roll PANS the view (look ahead) without moving the playhead;
     the playhead is only moved by clicking. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      const { width: w, duration: dur, manualScroll: ms, time } = liveRef.current;
      if (dur <= 0) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const playheadX = w * PLAYHEAD_X;
      const base = ms ?? Math.max(0, time * pxPerSec - playheadX);
      const maxScroll = Math.max(0, dur * pxPerSec - w * 0.3);
      setManualScroll(Math.max(0, Math.min(maxScroll, base + d)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [pxPerSec]);

  /* static layer (strips + notes) — rebuilt only when its inputs change */
  useEffect(() => {
    if (!song) {
      staticRef.current = null;
      return;
    }
    const ratio = dpr();
    const songW = Math.max(1, Math.ceil(duration * pxPerSec));
    const c = document.createElement("canvas");
    c.width = songW * ratio;
    c.height = height * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);

    // Bar/time ruler (Ableton-style): faint bar gridlines through the note area,
    // and a top band with bar numbers + tempo-accurate time. Scrolls (static layer).
    if (rulerH && song.barStarts.length) {
      ctx.textBaseline = "middle";
      let lastBar = -1e9, lastTime = -1e9;
      const bars = song.barStarts;
      for (let i = 0; i < bars.length; i++) {
        const x = bars[i] * pxPerSec;
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(x, topH, 1, noteH); // gridline through the notes
        ctx.fillStyle = "rgba(255,255,255,0.13)";
        ctx.fillRect(x, 0, 1, rulerH); // ruler tick
        if (x - lastBar >= 26) {
          ctx.font = "600 9px 'JetBrains Mono', ui-monospace, monospace";
          ctx.fillStyle = "rgba(199,210,254,0.72)";
          ctx.fillText(String(i + 1), x + 3, rulerH * 0.32);
          lastBar = x;
        }
        if (x - lastTime >= 60) {
          ctx.font = "500 8.5px 'JetBrains Mono', ui-monospace, monospace";
          ctx.fillStyle = "rgba(136,147,164,0.85)";
          ctx.fillText(fmtTime(bars[i] / tempoScale), x + 3, rulerH * 0.76);
          lastTime = x;
        }
      }
    }

    if (keyStripH) {
      drawStrip(ctx, keyRegions, rulerH, keyStripH, height, pxPerSec, {
        band: "rgba(165,180,252,0.13)",
        divider: "rgba(165,180,252,0.35)",
        text: "#c7d2fe",
      });
    }
    if (chordStripH) {
      drawStrip(ctx, regions, rulerH + keyStripH + pivotStripH, chordStripH, height, pxPerSec, {
        band: "rgba(251,191,36,0.07)",
        divider: "rgba(165,180,252,0.16)",
        text: "#fbbf24",
      });
    }

    // faint C-row guide lines
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let m = PIANO_LO; m <= PIANO_HI; m++) {
      if (isC(m)) ctx.fillRect(0, topH + laneY(m), songW, laneH);
    }

    // Key context at a time, for out-of-key colouring (key bands carry tonicPc/mode).
    // A note inside a tonicization span is judged against that LOCAL key, so a
    // legitimate secondary-key detour within a section doesn't read as out-of-key.
    const bandAt = (t: number): Region | null => {
      for (const r of tonicizations) if (t >= r.startSec && t < r.endSec && r.tonicPc != null && r.mode) return r;
      for (const r of keyRegions) if (t >= r.startSec && t < r.endSec) return r;
      return null;
    };
    const inKey = (pc: number, band: Region | null): boolean => {
      if (!band || band.tonicPc == null || !band.mode) return true; // no key ref → don't flag
      const scale = band.mode === "minor" ? MINOR_PCS : MAJOR_PCS;
      return scale.includes(((pc - band.tonicPc) % 12 + 12) % 12);
    };

    // notes — coloured by harmonic role: teal in-key, red out-of-key (chromatic),
    // grey for drums (channel 10, unpitched). Surfaces breakouts on the roll.
    for (const n of song.notes) {
      if (n.midi < PIANO_LO || n.midi > PIANO_HI) continue;
      const x = n.time * pxPerSec;
      const w = Math.max(1.5, n.duration * pxPerSec);
      const y = topH + laneY(n.midi);
      const a = 0.45 + 0.45 * Math.max(0, Math.min(1, n.velocity));
      let body: string, edge: string;
      if (n.drum) {
        body = `rgba(148,163,184,${(a * 0.7).toFixed(3)})`; edge = "rgba(203,213,225,0.45)";
      } else if (inKey(((n.midi % 12) + 12) % 12, bandAt(n.time))) {
        body = `rgba(45,212,191,${a.toFixed(3)})`; edge = "rgba(126,255,233,0.5)";
      } else {
        body = `rgba(248,113,113,${a.toFixed(3)})`; edge = "rgba(252,165,165,0.6)"; // chromatic / out-of-key
      }
      ctx.fillStyle = body;
      ctx.fillRect(x, y + 0.5, w, laneH - 1);
      ctx.fillStyle = edge;
      ctx.fillRect(x, y + 0.5, Math.min(w, 1.5), laneH - 1);
    }

    // Tonicization / pivot lane: orange spans + a roman numeral (relative to the
    // parent key) for each brief key-breakout the structural reduction absorbed —
    // acknowledged distinctly, below the structural key strip.
    if (pivotStripH) {
      const yTop = rulerH + keyStripH;
      ctx.fillStyle = "rgba(251,146,60,0.06)";
      ctx.fillRect(0, yTop, songW, pivotStripH); // lane background
      ctx.font = "600 9px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textBaseline = "middle";
      let lastLabel = -1e9;
      for (const p of pivots) {
        const x = p.startSec * pxPerSec;
        const w = Math.max(2.5, (p.endSec - p.startSec) * pxPerSec);
        ctx.fillStyle = "rgba(251,146,60,0.9)"; // orange — distinct from indigo keys / amber chords
        ctx.fillRect(x, yTop + pivotStripH - 2.5, w, 2.5);
        if (p.label && x - lastLabel >= 16) {
          ctx.fillStyle = "#fdba74";
          ctx.fillText(p.label, x + 2, yTop + (pivotStripH - 2.5) / 2);
          lastLabel = x;
        }
      }
    }

    staticRef.current = c;
  }, [song, duration, pxPerSec, regions, keyRegions, pivots, tonicizations, keyStripH, pivotStripH, chordStripH, rulerH, topH, height, tempoScale, laneH]);

  /* visible layer — playhead, blit, active glow; runs whenever position changes */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = dpr();
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    ctx.fillStyle = "#070809";
    ctx.fillRect(0, 0, width, height);

    const playheadX = width * PLAYHEAD_X;
    if (!draggingRef.current) {
      // manual pan (wheel) wins; else track the playhead when following; else freeze
      scrollXRef.current =
        manualScroll !== null
          ? manualScroll
          : follow
            ? Math.max(0, currentTime * pxPerSec - playheadX)
            : scrollXRef.current;
    }
    const scrollX = scrollXRef.current;

    const s = staticRef.current;
    if (s) {
      const sx = scrollX * ratio;
      const sw = Math.min(width * ratio, s.width - sx);
      if (sw > 0) ctx.drawImage(s, sx, 0, sw, s.height, 0, 0, sw / ratio, height);
    }

    if (song) {
      ctx.save();
      ctx.shadowColor = "rgba(251,191,36,0.9)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#fde68a";
      for (const n of song.notes) {
        if (n.time <= currentTime && currentTime < n.endTime && n.midi >= PIANO_LO && n.midi <= PIANO_HI) {
          const x = n.time * pxPerSec - scrollX;
          const w = Math.max(1.5, n.duration * pxPerSec);
          ctx.fillRect(x, topH + laneY(n.midi) + 0.5, w, laneH - 1);
        }
      }
      ctx.restore();
    }

    const headX = currentTime * pxPerSec - scrollX;
    ctx.fillStyle = "#a5b4fc";
    ctx.fillRect(headX - 0.5, 0, 1.5, height);

    void activeNotes;
    // tempoScale + the strip inputs (regions/keyRegions/pivots) are deps so any
    // change that rebuilds the static layer also re-blits it here — otherwise the
    // screen keeps the stale blit until an unrelated repaint (the roman↔names /
    // tempo "needs a scroll to refresh" bug).
  }, [song, currentTime, duration, width, pxPerSec, activeNotes, topH, height, manualScroll, follow, tempoScale, regions, keyRegions, pivots, laneH]);

  /* click / drag to seek */
  const timeFromEvent = (clientX: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left + scrollXRef.current;
    return Math.max(0, Math.min(duration, x / pxPerSec));
  };
  // Full (un-truncated) strip label under a point — for the hover tooltip, so
  // labels the bar clips (chord names, keys, pivots) can still be read.
  const labelAt = (yLocal: number, clientX: number): string | null => {
    const t = timeFromEvent(clientX);
    const find = (rs: Region[]): string | null => {
      const r = rs.find((r) => t >= r.startSec && t < r.endSec);
      return r && r.label ? r.label : null;
    };
    const keyTop = rulerH, pivotTop = rulerH + keyStripH, chordTop = rulerH + keyStripH + pivotStripH;
    if (keyStripH && yLocal >= keyTop && yLocal < keyTop + keyStripH) return find(keyRegions);
    if (pivotStripH && yLocal >= pivotTop && yLocal < pivotTop + pivotStripH) return find(pivots);
    if (chordStripH && yLocal >= chordTop && yLocal < chordTop + chordStripH) return find(regions);
    return null;
  };
  // The note whose rendered rectangle contains a point — for the inspector.
  // Honors the same geometry the draw loop uses (incl. the 1.5px min width).
  const noteAt = (clientX: number, yLocal: number): Note | null => {
    if (!song) return null;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const staticX = clientX - rect.left + scrollXRef.current;
    let hit: Note | null = null;
    for (const n of song.notes) {
      if (n.midi < PIANO_LO || n.midi > PIANO_HI) continue;
      const y = topH + laneY(n.midi);
      if (yLocal < y || yLocal >= y + laneH) continue;
      const x = n.time * pxPerSec;
      const w = Math.max(1.5, n.duration * pxPerSec);
      if (staticX >= x && staticX <= x + w) hit = n; // last match = topmost drawn
    }
    return hit;
  };
  // Local key at a time (structural key band), and a note's degree/in-key in it.
  const keyBandAt = (t: number): Region | null =>
    keyRegions.find((r) => t >= r.startSec && t < r.endSec && r.tonicPc != null && r.mode) ?? null;

  const onDown = (e: React.MouseEvent) => {
    if (!song) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const note = rect ? noteAt(e.clientX, e.clientY - rect.top) : null;
    if ((e.altKey || e.metaKey) && rect) {
      // Inspect a note instead of seeking — don't fight click-to-seek.
      setInspect(note ? { note, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
      setTip(null);
      return;
    }
    draggingRef.current = true;
    setTip(null);
    setInspect(null); // a plain seek dismisses the inspector
    // Clicking a note (or any note of a chord) snaps the scrubber to its onset;
    // clicking empty space seeks to the cursor time. Dragging then scrubs freely.
    onSeek(note ? note.time : timeFromEvent(e.clientX));
  };
  const onMove = (e: React.MouseEvent) => {
    if (draggingRef.current) {
      onSeek(timeFromEvent(e.clientX));
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const yLocal = e.clientY - rect.top;
    const text = labelAt(yLocal, e.clientX);
    setTip(text ? { x: e.clientX - rect.left, y: yLocal, text } : null);
  };
  const onUp = () => {
    draggingRef.current = false;
  };
  const onLeave = () => {
    draggingRef.current = false;
    setTip(null);
  };

  return (
    <div className="px-roll" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="px-roll-canvas"
        style={{ width: "100%", height }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onLeave}
      />
      {tip && (
        <div className="px-roll-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
      {inspect && song && (() => {
        const n = inspect.note;
        const pc = ((n.midi % 12) + 12) % 12;
        const { bar, beat } = song.timeToBarBeat(n.time);
        const band = keyBandAt(n.time);
        let harmonic: string;
        if (n.drum) {
          harmonic = "unpitched (drums)";
        } else if (band && band.tonicPc != null && band.mode) {
          const scale = band.mode === "minor" ? MINOR_PCS : MAJOR_PCS;
          const fits = scale.includes(((pc - band.tonicPc) % 12 + 12) % 12);
          const deg = scaleDegreeLabel(pc, band.tonicPc, band.mode);
          harmonic = `${fits ? "in key" : "chromatic"} · ${deg} of ${NOTE_NAMES[band.tonicPc]} ${band.mode}`;
        } else {
          harmonic = "—";
        }
        const rows: [string, string][] = [
          ["position", `bar ${bar}, beat ${beat.toFixed(2)}`],
          ["duration", `${n.durationBeats.toFixed(2)} beat${n.durationBeats === 1 ? "" : "s"} · ${Math.round(n.duration * 1000)} ms`],
          ["velocity", `${Math.round(n.velocity * 127)} (${n.velocity.toFixed(2)})`],
          ["harmony", harmonic],
          ["source", `ch ${n.channel ?? "—"}${n.instrument ? ` · ${n.instrument}` : n.track ? ` · ${n.track}` : ""}`],
        ];
        // Keep the popout fully in view: flip left/above the cursor when it would
        // overflow the roll, then clamp. (~206×150 incl. padding/border.)
        const PW = 206, PH = 150, GAP = 10;
        const left = inspect.x + GAP + PW <= width ? inspect.x + GAP : inspect.x - PW - GAP;
        const top = inspect.y + GAP + PH <= height ? inspect.y + GAP : inspect.y - PH - GAP;
        const clamp = (v: number, max: number) => Math.max(4, Math.min(v, Math.max(4, max)));
        return (
          <div className="px-roll-inspect" style={{ left: clamp(left, width - PW - 4), top: clamp(top, height - PH - 4) }}>
            <div className="px-roll-inspect-head">
              <span>{noteName(n.midi)}<span className="px-roll-inspect-midi"> · MIDI {n.midi}</span></span>
              <button className="px-roll-inspect-x" onClick={() => setInspect(null)} title="Close">×</button>
            </div>
            {rows.map(([k, v]) => (
              <div className="px-roll-inspect-row" key={k}>
                <span className="px-roll-inspect-k">{k}</span>
                <span className="px-roll-inspect-v">{v}</span>
              </div>
            ))}
          </div>
        );
      })()}
      {song && (
        <button
          className={"px-roll-follow" + (follow ? " on" : "")}
          onClick={toggleFollow}
          title={follow ? "Following the scrubber — click to freeze the view" : "View frozen — click to follow the scrubber"}
        >
          {follow ? "⊙ Follow" : "⊘ Manual"}
        </button>
      )}
      {song && (
        <button
          className={"px-roll-follow px-roll-expand" + (expanded ? " on" : "")}
          onClick={() => setExpanded((x) => !x)}
          title={expanded ? "Compact rows" : "Expand rows — taller lanes, easier to read & click"}
        >
          {expanded ? "⤡ Compact" : "⤢ Expand"}
        </button>
      )}
      {song && !inspect && <div className="px-roll-hint">⌥-click a note to inspect</div>}
      {!song && <div className="px-roll-empty">Load a MIDI file to see the piano roll.</div>}
    </div>
  );
}
