// Numeric transport controls (no visuals yet — the PianoRoll lands in Phase 3).
// Purely presentational: it drives the usePlayback API and reads its state.

import React from "react";
import type { Playback } from "../hooks/usePlayback";

const fmt = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
};

export default function TransportBar({
  playback,
  onLoadAnalysis,
  onMidiLoaded,
  onAnalyzeViaBridge,
  bridgeConnected,
  analyzing,
  hasAnalysis,
  analysisError,
}: {
  playback: Playback;
  onLoadAnalysis: (file: File) => void;
  onMidiLoaded: (buf: ArrayBuffer) => void;
  onAnalyzeViaBridge: () => void;
  bridgeConnected: boolean;
  analyzing: boolean;
  hasAnalysis: boolean;
  analysisError: string | null;
}) {
  const { song, isPlaying, currentTime, duration, tempoScale, loop } = playback;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    onMidiLoaded(buf); // hand the raw bytes up before load, for bridge analysis
    playback.load(buf, file.name.replace(/\.midi?$/i, ""));
    e.target.value = ""; // allow re-loading the same file
  };

  const onAnalysisFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadAnalysis(file);
    e.target.value = "";
  };

  const hasSong = !!song;

  return (
    <div className="px-transport">
      <div className="px-tp-row">
        <label className="px-tp-file">
          <input type="file" accept=".mid,.midi" onChange={onFile} />
          <span>{"↑"} Load MIDI</span>
        </label>
        <span className="px-tp-name" title={song?.name}>
          {song ? song.name : "No file loaded"}
        </span>
        {bridgeConnected ? (
          // Engine connected: analyze the loaded file on demand (auto-runs on load too).
          <button
            className={"px-tp-analysis" + (hasAnalysis ? " on" : "") + (hasSong ? "" : " dis")}
            onClick={onAnalyzeViaBridge}
            disabled={!hasSong || analyzing}
            title="Analyze the loaded file with the Tonality engine"
          >
            <span>{analyzing ? "Analyzing…" : hasAnalysis ? "✓ Tonality" : "↻ Analyze"}</span>
          </button>
        ) : (
          // Engine offline: load a pre-computed analysis JSON (scripts/tonality-analyze.py).
          <label
            className={"px-tp-analysis" + (hasAnalysis ? " on" : "") + (hasSong ? "" : " dis")}
            title="Load a Tonality analysis (.json) — or start scripts/tonality-serve.py to analyze on demand"
          >
            <input type="file" accept=".json,application/json" onChange={onAnalysisFile} disabled={!hasSong} />
            <span>{hasAnalysis ? "✓ Tonality" : "+ Tonality"}</span>
          </label>
        )}
      </div>
      {analysisError && <div className="px-tp-analysis-err">{analysisError}</div>}

      <div className="px-tp-row">
        <button className="px-tp-btn" onClick={playback.stepBack} disabled={!hasSong} title="Previous onset">
          {"⏮"}
        </button>
        <button
          className={"px-tp-btn play" + (isPlaying ? " on" : "")}
          onClick={isPlaying ? playback.pause : playback.play}
          disabled={!hasSong}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button className="px-tp-btn" onClick={playback.stepForward} disabled={!hasSong} title="Next onset">
          {"⏭"}
        </button>
        <button
          className={"px-tp-btn loop" + (loop ? " on" : "")}
          onClick={() => playback.setLoop(!loop)}
          disabled={!hasSong}
          title={loop ? "Loop on" : "Loop off"}
        >
          {"⟲"}
        </button>

        <input
          className="px-tp-seek"
          type="range"
          min={0}
          max={Math.max(duration, 0.001)}
          step={0.01}
          value={Math.min(currentTime, duration)}
          onChange={(e) => playback.seek(parseFloat(e.target.value))}
          disabled={!hasSong}
        />
        <span className="px-tp-time">
          {fmt(currentTime)} <span className="px-tp-dim">/ {fmt(duration)}</span>
        </span>
      </div>

      <div className="px-tp-row">
        <span className="px-tp-lbl">Tempo</span>
        <input
          className="px-tp-tempo"
          type="range"
          min={0.25}
          max={2}
          step={0.05}
          value={tempoScale}
          onChange={(e) => playback.setTempoScale(parseFloat(e.target.value))}
          disabled={!hasSong}
        />
        <span className="px-tp-time">{tempoScale.toFixed(2)}{"×"}</span>
      </div>
    </div>
  );
}
