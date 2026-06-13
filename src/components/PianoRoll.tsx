// Canvas piano-roll: pitch on the vertical axis (high at top), time on the
// horizontal axis, scrolling to follow the playhead. Two layers, as CLAUDE.md
// requires: the notes (and, when present, the Tonality chord-region strip) are
// rasterized once to an offscreen canvas and blitted each frame; the visible
// canvas adds only the moving playhead and the active-note glow on top. All
// pitch mapping goes through geometry/piano so it stays aligned with the Piano.

import React, { useEffect, useRef, useState } from "react";
import type { Song } from "../lib/midi/types";
import { PIANO_LO, PIANO_HI, pitchToLane } from "../geometry/piano";

const LANES = PIANO_HI - PIANO_LO + 1; // semitone rows
const LANE_H = 5; // px per semitone
const NOTE_H = LANES * LANE_H; // note-area height (css px)
const STRIP_H = 17; // chord-region label strip height (0 when no regions)
const PLAYHEAD_X = 0.28; // playhead screen position as a fraction of width

export interface ChordRegion {
  startSec: number;
  endSec: number;
  label: string;
}

interface Props {
  song: Song | null;
  currentTime: number;
  duration: number;
  /** MIDI numbers sounding right now (for the glow). */
  activeNotes: number[];
  onSeek: (t: number) => void;
  /** Tonality per-segment chord labels, time-aligned (empty = no strip). */
  regions?: ChordRegion[];
  /** Horizontal zoom, pixels per second. */
  pxPerSec?: number;
}

const dpr = (): number => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
const laneY = (midi: number): number => pitchToLane(midi) * LANE_H;
const isC = (midi: number): boolean => midi % 12 === 0;

export default function PianoRoll({
  song,
  currentTime,
  duration,
  activeNotes,
  onSeek,
  regions = [],
  pxPerSec = 60,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(600);
  const scrollXRef = useRef(0);
  const draggingRef = useRef(false);

  const stripH = regions.length ? STRIP_H : 0;
  const height = stripH + NOTE_H;

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

  /* static layer (region strip + notes) — rebuilt only when its inputs change */
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

    // chord-region strip + full-height segment dividers
    if (stripH) {
      ctx.font = "600 10px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textBaseline = "middle";
      for (const r of regions) {
        const x = r.startSec * pxPerSec;
        const w = (r.endSec - r.startSec) * pxPerSec;
        ctx.fillStyle = "rgba(165,180,252,0.10)"; // strip band
        ctx.fillRect(x, 0, w, stripH);
        ctx.fillStyle = "rgba(165,180,252,0.16)"; // segment divider, full height
        ctx.fillRect(x, 0, 1, height);
        if (r.label && w > 16) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + 2, 0, w - 3, stripH);
          ctx.clip();
          ctx.fillStyle = "#c7d2fe";
          ctx.fillText(r.label, x + 4, stripH / 2 + 0.5);
          ctx.restore();
        }
      }
    }

    // faint C-row guide lines
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let m = PIANO_LO; m <= PIANO_HI; m++) {
      if (isC(m)) ctx.fillRect(0, stripH + laneY(m), songW, LANE_H);
    }

    // notes
    for (const n of song.notes) {
      if (n.midi < PIANO_LO || n.midi > PIANO_HI) continue;
      const x = n.time * pxPerSec;
      const w = Math.max(1.5, n.duration * pxPerSec);
      const y = stripH + laneY(n.midi);
      const a = 0.45 + 0.45 * Math.max(0, Math.min(1, n.velocity));
      ctx.fillStyle = `rgba(45,212,191,${a.toFixed(3)})`;
      ctx.fillRect(x, y + 0.5, w, LANE_H - 1);
      ctx.fillStyle = "rgba(126,255,233,0.5)";
      ctx.fillRect(x, y + 0.5, Math.min(w, 1.5), LANE_H - 1);
    }

    staticRef.current = c;
  }, [song, duration, pxPerSec, regions, stripH, height]);

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
      scrollXRef.current = Math.max(0, currentTime * pxPerSec - playheadX);
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
          ctx.fillRect(x, stripH + laneY(n.midi) + 0.5, w, LANE_H - 1);
        }
      }
      ctx.restore();
    }

    const headX = currentTime * pxPerSec - scrollX;
    ctx.fillStyle = "#a5b4fc";
    ctx.fillRect(headX - 0.5, 0, 1.5, height);

    void activeNotes;
  }, [song, currentTime, duration, width, pxPerSec, activeNotes, stripH, height]);

  /* click / drag to seek */
  const timeFromEvent = (clientX: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left + scrollXRef.current;
    return Math.max(0, Math.min(duration, x / pxPerSec));
  };
  const onDown = (e: React.MouseEvent) => {
    if (!song) return;
    draggingRef.current = true;
    onSeek(timeFromEvent(e.clientX));
  };
  const onMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    onSeek(timeFromEvent(e.clientX));
  };
  const endDrag = () => {
    draggingRef.current = false;
  };

  return (
    <div className="px-roll" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="px-roll-canvas"
        style={{ width: "100%", height }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      />
      {!song && <div className="px-roll-empty">Load a MIDI file to see the piano roll.</div>}
    </div>
  );
}
