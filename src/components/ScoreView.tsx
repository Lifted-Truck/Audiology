// Score view — the loaded MIDI on a traditional grand staff, scrubbing exactly
// like the PianoRoll: same second-based x-axis, same follow-scroll, same
// click/drag-to-seek, shared playhead position. This is a PROPORTIONAL score
// (pitch engraved conventionally — staff position, accidentals, ledger lines,
// stems; x IS time), not print engraving: no rhythmic glyphs/rests in v1.
// Layout maths is React-free in lib/score/layout.ts (Node-tested).
//
// Canvas discipline mirrors PianoRoll: a static layer rasterized once (staves,
// clefs, barlines, noteheads) and a visible layer that blits it + draws the
// playhead and the sounding-note highlight. The static effect bumps
// `staticVersion`; the visible effect deps on it (the stale-blit invariant —
// new static inputs go in the STATIC dep array only).

import React, { useEffect, useRef, useState } from "react";
import type { Song } from "../lib/midi/types";
import { layoutScore, type ScoreLayout } from "../lib/score/layout";

const PLAYHEAD_X = 0.28; // same parking fraction as the roll
const LEFT_PAD = 34; // room for the clefs before t=0

const dpr = (): number => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

interface Props {
  song: Song | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  activeNotes: number[];
  onSeek: (t: number) => void;
  useFlats: boolean;
  pxPerSec?: number;
}

export default function ScoreView({ song, currentTime, duration, isPlaying, activeNotes, onSeek, useFlats, pxPerSec = 60 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<ScoreLayout | null>(null);
  const [staticVersion, setStaticVersion] = useState(0);
  const [width, setWidth] = useState(600);
  const scrollXRef = useRef(0);
  const draggingRef = useRef(false);
  const [manualScroll, setManualScroll] = useState<number | null>(null);
  const liveRef = useRef({ width, duration, manualScroll, time: currentTime });
  liveRef.current = { width, duration, manualScroll, time: currentTime };

  const LINE_GAP = 8;
  const layout = song ? layoutRef.current : null;
  const height = (layout?.height ?? 180) + 8;

  useEffect(() => {
    if (isPlaying) setManualScroll(null); // resume follow on play
  }, [isPlaying]);

  /* container width */
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

  /* wheel pans the view without moving the playhead (parity with the roll) */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      const { width: w, duration: dur, manualScroll: ms, time } = liveRef.current;
      if (dur <= 0) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const base = ms ?? Math.max(0, time * pxPerSec - w * PLAYHEAD_X);
      const maxScroll = Math.max(0, dur * pxPerSec - w * 0.3);
      setManualScroll(Math.max(0, Math.min(maxScroll, base + d)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [pxPerSec]);

  /* static layer: staves, clefs, barlines, notes */
  useEffect(() => {
    if (!song) {
      staticRef.current = null;
      layoutRef.current = null;
      setStaticVersion((v) => v + 1);
      return;
    }
    const lay = layoutScore(song.notes, { pxPerSec, useFlats, lineGap: LINE_GAP });
    layoutRef.current = lay;
    const ratio = dpr();
    const songW = LEFT_PAD + Math.max(1, Math.ceil(duration * pxPerSec)) + 40;
    const H = lay.height + 8;
    const c = document.createElement("canvas");
    c.width = songW * ratio;
    c.height = H * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);

    // staves
    ctx.strokeStyle = "rgba(230,237,243,0.5)";
    ctx.lineWidth = 1;
    for (const ys of [lay.trebleLines, lay.bassLines]) {
      for (const y of ys) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(songW, y + 0.5);
        ctx.stroke();
      }
    }
    // clefs (unicode; system fonts carry them on target platforms)
    ctx.fillStyle = "rgba(230,237,243,0.85)";
    ctx.font = "34px serif";
    ctx.textBaseline = "middle";
    ctx.fillText("\u{1D11E}", 4, lay.trebleLines[2] + 1); // 𝄞 centred on G line
    ctx.font = "26px serif";
    ctx.fillText("\u{1D122}", 6, lay.bassLines[1] + 3); // 𝄢 on F line
    // brace-less system barlines from the meter map
    ctx.strokeStyle = "rgba(165,180,252,0.25)";
    for (const bt of song.barStarts) {
      const x = LEFT_PAD + bt * pxPerSec;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, lay.trebleLines[0]);
      ctx.lineTo(x + 0.5, lay.bassLines[4]);
      ctx.stroke();
    }
    // middle-C guide (faint) between the staves
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, lay.middleCY + 0.5);
    ctx.lineTo(songW, lay.middleCY + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // notes
    const half = LINE_GAP / 2;
    for (const g of lay.glyphs) {
      const x = LEFT_PAD + g.x + g.xOffset;
      const inKeyColor = "rgba(94,234,212,0.95)"; // teal noteheads (app vocabulary)
      // ledger lines
      ctx.strokeStyle = "rgba(230,237,243,0.45)";
      for (const ly of g.ledgerYs) {
        ctx.beginPath();
        ctx.moveTo(x - 7, ly + 0.5);
        ctx.lineTo(x + 7, ly + 0.5);
        ctx.stroke();
      }
      // stem (a plain line one octave-ish tall; no beams/flags in v1)
      ctx.strokeStyle = inKeyColor;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      if (g.stemDir === 1) {
        ctx.moveTo(x + 4.4, g.y - 1);
        ctx.lineTo(x + 4.4, g.y - LINE_GAP * 3.2);
      } else {
        ctx.moveTo(x - 4.4, g.y + 1);
        ctx.lineTo(x - 4.4, g.y + LINE_GAP * 3.2);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      // notehead (slightly oblique ellipse)
      ctx.fillStyle = inKeyColor;
      ctx.save();
      ctx.translate(x, g.y);
      ctx.rotate(-0.35);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.8, half - 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // accidental
      if (g.accidental !== 0) {
        ctx.fillStyle = "rgba(251,191,36,0.95)";
        ctx.font = "700 11px 'JetBrains Mono', monospace";
        ctx.fillText(g.accidental === 1 ? "♯" : "♭", x - 14, g.y + 1);
      }
    }

    staticRef.current = c;
    setStaticVersion((v) => v + 1); // re-blit (the stale-blit invariant)
  }, [song, duration, pxPerSec, useFlats]);

  /* visible layer: blit + playhead + sounding highlight */
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
      scrollXRef.current =
        manualScroll !== null ? manualScroll : Math.max(0, currentTime * pxPerSec - playheadX);
    }
    const scrollX = scrollXRef.current;

    const s = staticRef.current;
    if (s) {
      const sx = scrollX * ratio;
      const sw = Math.min(width * ratio, s.width - sx);
      if (sw > 0) ctx.drawImage(s, sx, 0, sw, s.height, 0, 0, sw / ratio, height);
    }

    // sounding noteheads glow (same amber as the roll's active glow)
    const lay = layoutRef.current;
    if (lay && song) {
      const active = new Set(activeNotes);
      ctx.save();
      ctx.shadowColor = "rgba(251,191,36,0.9)";
      ctx.shadowBlur = 7;
      ctx.fillStyle = "#fde68a";
      for (const g of lay.glyphs) {
        if (!active.has(g.note.midi)) continue;
        if (!(g.note.time <= currentTime && currentTime < g.note.endTime)) continue;
        const x = LEFT_PAD + g.x + g.xOffset - scrollX;
        ctx.beginPath();
        ctx.ellipse(x, g.y, 4.8, LINE_GAP / 2 - 0.6, -0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const headX = LEFT_PAD + currentTime * pxPerSec - scrollX;
    ctx.fillStyle = "#a5b4fc";
    ctx.fillRect(headX - 0.5, 0, 1.5, height);
  }, [song, currentTime, duration, width, height, pxPerSec, activeNotes, manualScroll, staticVersion]);

  /* click / drag to seek (same as the roll) */
  const timeFromEvent = (clientX: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left + scrollXRef.current - LEFT_PAD;
    return Math.max(0, Math.min(duration, x / pxPerSec));
  };
  const onDown = (e: React.MouseEvent) => {
    if (!song) return;
    draggingRef.current = true;
    onSeek(timeFromEvent(e.clientX));
  };
  const onMove = (e: React.MouseEvent) => {
    if (draggingRef.current) onSeek(timeFromEvent(e.clientX));
  };
  const stopDrag = () => {
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
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      />
      {!song && <div className="px-roll-empty">Load a MIDI file to see the score.</div>}
      {song && (
        <div className="px-roll-hint">proportional notation — x is time; no rhythm glyphs (v1)</div>
      )}
    </div>
  );
}
