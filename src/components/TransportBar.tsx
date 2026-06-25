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
  onStartEngine,
  onStopEngine,
  engineStarting,
  engineError,
  coalesceWindow,
  onCoalesceChange,
  disambigRelKeys,
  onDisambigChange,
  smoothRegions,
  onSmoothChange,
  followKey,
  onFollowKeyChange,
  canFollowKey,
}: {
  playback: Playback;
  onLoadAnalysis: (file: File) => void;
  onMidiLoaded: (buf: ArrayBuffer) => void;
  onAnalyzeViaBridge: () => void;
  bridgeConnected: boolean;
  analyzing: boolean;
  hasAnalysis: boolean;
  analysisError: string | null;
  onStartEngine: () => void;
  onStopEngine: () => void;
  engineStarting: boolean;
  engineError: string | null;
  coalesceWindow: number | null;
  onCoalesceChange: (w: number | null) => void;
  disambigRelKeys: boolean;
  onDisambigChange: (v: boolean) => void;
  smoothRegions: boolean;
  onSmoothChange: (v: boolean) => void;
  followKey: boolean;
  onFollowKeyChange: (v: boolean) => void;
  canFollowKey: boolean;
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
            title="Load a Tonality analysis (.json) — or start the engine to analyze on demand"
          >
            <input type="file" accept=".json,application/json" onChange={onAnalysisFile} disabled={!hasSong} />
            <span>{hasAnalysis ? "✓ Tonality" : "+ Tonality"}</span>
          </label>
        )}
        <button
          className={"px-tp-engine" + (bridgeConnected ? " on" : "") + (engineStarting ? " busy" : "")}
          onClick={bridgeConnected ? onStopEngine : onStartEngine}
          disabled={engineStarting}
          title={
            bridgeConnected
              ? "Stop the Tonality engine"
              : "Start the Tonality engine (runs python -m mts.mcp.bridge via the dev server)"
          }
        >
          <span className="px-tp-engine-dot" />
          <span>{bridgeConnected ? "◼ Engine" : engineStarting ? "Starting…" : "⏻ Start engine"}</span>
        </button>
      </div>
      {bridgeConnected && (
        <div className="px-tp-row px-tp-subrow">
          <span className="px-tp-lbl" title="Coalesce near-simultaneous onsets before analysis — heals performed/humanized timing that otherwise over-segments. Off = exact (quantized files).">
            Coalesce
          </span>
          <select
            className="px-tp-coalesce"
            value={coalesceWindow ?? "off"}
            onChange={(e) => onCoalesceChange(e.target.value === "off" ? null : parseFloat(e.target.value))}
            disabled={analyzing}
            title="Performed-timing window (beats) for file analysis"
          >
            <option value="off">Off · exact</option>
            <option value="0.25">1/16 · 0.25</option>
            <option value="0.5">1/8 · 0.5</option>
            <option value="1">1/4 · 1.0</option>
          </select>
          <button
            className={"px-tp-opt" + (disambigRelKeys ? " on" : "")}
            onClick={() => onDisambigChange(!disambigRelKeys)}
            disabled={analyzing}
            title="Relative-key disambiguation — apply the relative major/minor tie-breaker (better Eb-vs-Cm style calls). Tonality response-3, Finding B."
          >
            Rel-key
          </button>
          <button
            className={"px-tp-opt" + (smoothRegions ? " on" : "")}
            onClick={() => onSmoothChange(!smoothRegions)}
            disabled={analyzing}
            title="Smooth key regions — absorb short, low-confidence modulation blips (engine hysteresis). Tonality response-3, Finding C."
          >
            Smooth
          </button>
          {analyzing && <span className="px-tp-dim">re-analyzing…</span>}
        </div>
      )}
      {canFollowKey && (
        <div className="px-tp-row px-tp-subrow">
          <button
            className={"px-tp-opt" + (followKey ? " on" : "")}
            onClick={() => onFollowKeyChange(!followKey)}
            title="Follow the key — auto-switch the explorer's root + scale to the playing segment's local key as the playhead moves. See the Circle of 5ths view."
          >
            ⟳ Follow key
          </button>
          <span className="px-tp-dim">{followKey ? "root + scale track the playing key" : "root + scale follow the playing key"}</span>
        </div>
      )}
      {analysisError && <div className="px-tp-analysis-err">{analysisError}</div>}
      {engineError && <div className="px-tp-analysis-err">{engineError}</div>}

      <div className="px-tp-row">
        <button className="px-tp-btn" onClick={() => playback.seek(0)} disabled={!hasSong} title="Restart (to start)">
          {"⇤"}
        </button>
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
        <span className="px-tp-time" title="Playback time at the current tempo">
          {fmt(currentTime / tempoScale)} <span className="px-tp-dim">/ {fmt(duration / tempoScale)}</span>
        </span>
        {song && (() => {
          const pos = song.timeToBarBeat(currentTime);
          const total = song.timeToBarBeat(duration).bar;
          return (
            <span className="px-tp-time px-tp-bar" title="Bar · beat (tempo- & meter-map aware)">
              bar {pos.bar}<span className="px-tp-dim">·{pos.beat} / {total}</span>
            </span>
          );
        })()}
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
