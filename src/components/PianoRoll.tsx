// Canvas piano-roll: pitch on the vertical axis (high at top), time on the
// horizontal axis, scrolling to follow the playhead. Two layers, as CLAUDE.md
// requires: the notes are rasterized once to an offscreen canvas (redrawn only
// when the song / zoom / size change) and blitted each frame; the visible
// canvas adds only the moving playhead and the active-note glow on top. All
// pitch mapping goes through geometry/piano so it stays aligned with the Piano.

import React, { useEffect, useRef, useState } from "react";
import type { Song } from "../lib/midi/types";
import { PIANO_LO, PIANO_HI, pitchToLane } from "../geometry/piano";

const LANES = PIANO_HI - PIANO_LO + 1; // semitone rows
const LANE_H = 5; // px per semitone
const HEIGHT = LANES * LANE_H; // canvas height (css px)
const PLAYHEAD_X = 0.28; // playhead screen position as a fraction of width

interface Props {
  song: Song | null;
  currentTime: number;
  duration: number;
  /** MIDI numbers sounding right now (for the glow). */
  activeNotes: number[];
  onSeek: (t: number) => void;
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
  pxPerSec = 60,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(600);
  // Scroll offset (css px). Frozen while dragging so seeking doesn't fight the cursor.
  const scrollXRef = useRef(0);
  const draggingRef = useRef(false);

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

  /* static note layer — rebuilt only when the inputs that affect it change */
  useEffect(() => {
    if (!song) {
      staticRef.current = null;
      return;
    }
    const ratio = dpr();
    const songW = Math.max(1, Math.ceil(duration * pxPerSec));
    const c = document.createElement("canvas");
    c.width = songW * ratio;
    c.height = HEIGHT * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);

    // faint C-row guide lines
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let m = PIANO_LO; m <= PIANO_HI; m++) {
      if (isC(m)) ctx.fillRect(0, laneY(m), songW, LANE_H);
    }

    // notes
    for (const n of song.notes) {
      if (n.midi < PIANO_LO || n.midi > PIANO_HI) continue;
      const x = n.time * pxPerSec;
      const w = Math.max(1.5, n.duration * pxPerSec);
      const y = laneY(n.midi);
      const a = 0.45 + 0.45 * Math.max(0, Math.min(1, n.velocity));
      ctx.fillStyle = `rgba(45,212,191,${a.toFixed(3)})`;
      ctx.fillRect(x, y + 0.5, w, LANE_H - 1);
      ctx.fillStyle = "rgba(126,255,233,0.5)";
      ctx.fillRect(x, y + 0.5, Math.min(w, 1.5), LANE_H - 1); // left edge accent
    }

    staticRef.current = c;
  }, [song, duration, pxPerSec]);

  /* visible layer — playhead, blit, active glow; runs whenever position changes */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = dpr();
    canvas.width = width * ratio;
    canvas.height = HEIGHT * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); // draw in css px

    // background
    ctx.fillStyle = "#070809";
    ctx.fillRect(0, 0, width, HEIGHT);

    const playheadX = width * PLAYHEAD_X;
    if (!draggingRef.current) {
      scrollXRef.current = Math.max(0, currentTime * pxPerSec - playheadX);
    }
    const scrollX = scrollXRef.current;

    // blit the cached notes (source rect in device px, dest in css px)
    const s = staticRef.current;
    if (s) {
      const sx = scrollX * ratio;
      const sw = Math.min(width * ratio, s.width - sx);
      if (sw > 0) {
        ctx.drawImage(s, sx, 0, sw, s.height, 0, 0, sw / ratio, HEIGHT);
      }
    }

    // active-note glow (notes sounding at currentTime)
    if (song) {
      ctx.save();
      ctx.shadowColor = "rgba(251,191,36,0.9)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#fde68a";
      for (const n of song.notes) {
        if (n.time <= currentTime && currentTime < n.endTime && n.midi >= PIANO_LO && n.midi <= PIANO_HI) {
          const x = n.time * pxPerSec - scrollX;
          const w = Math.max(1.5, n.duration * pxPerSec);
          ctx.fillRect(x, laneY(n.midi) + 0.5, w, LANE_H - 1);
        }
      }
      ctx.restore();
    }

    // playhead — sits on the true current-time position (which equals the fixed
    // screen fraction only once the view has started scrolling)
    const headX = currentTime * pxPerSec - scrollX;
    ctx.fillStyle = "#a5b4fc";
    ctx.fillRect(headX - 0.5, 0, 1.5, HEIGHT);

    // void the unused activeNotes dep without a render cost (glow derives from notes)
    void activeNotes;
  }, [song, currentTime, duration, width, pxPerSec, activeNotes]);

  /* click / drag to seek */
  const timeFromEvent = (clientX: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left + scrollXRef.current;
    return Math.max(0, Math.min(duration, x / pxPerSec));
  };
  const onDown = (e: React.MouseEvent) => {
    if (!song) return;
    draggingRef.current = true; // freeze scroll during the drag
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
        style={{ width: "100%", height: HEIGHT }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      />
      {!song && <div className="px-roll-empty">Load a MIDI file to see the piano roll.</div>}
    </div>
  );
}
