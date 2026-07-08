// Instrument panel — per-channel timbre assignment for the loaded MIDI file plus
// the live/tap sound. Each channel shows its detected GM instrument and note
// count with a preset picker (auditioned on change) and a "drums" toggle; drum
// channels route to the synth kit and offer a few audition pads. Auto-assigned
// from the file's GM programs on load (see lib/state autoAssign); everything is
// overridable here for files that aren't GM-normalized.

import React from "react";
import type { ChannelInfo } from "../lib/state";
import { PRESETS, PRESET_ORDER, type PresetKey } from "../audio/instruments";

const C = {
  border: "#1c2129", border2: "#2a3340", text: "#e6edf3", dim: "#94a3b8",
  faint: "#5b6675", accent: "#fbbf24", teal: "#2dd4bf", indigo: "#a5b4fc",
};

// A few representative drum pads for auditioning a drum channel (GM note → label).
const DRUM_PADS: { midi: number; label: string }[] = [
  { midi: 36, label: "Kick" }, { midi: 38, label: "Snare" }, { midi: 42, label: "Hat" },
  { midi: 46, label: "Open" }, { midi: 45, label: "Tom" }, { midi: 49, label: "Crash" },
];

function PresetSelect({ value, onChange }: { value: PresetKey; onChange: (k: PresetKey) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PresetKey)}
      style={{
        background: "#0e1218", color: C.text, border: `1px solid ${C.border2}`, borderRadius: 6,
        padding: "4px 8px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer",
      }}
    >
      {PRESET_ORDER.map((k) => (
        <option key={k} value={k}>{PRESETS[k].label}</option>
      ))}
    </select>
  );
}

export default function InstrumentPanel({
  channels, channelPresets, drumChannels, livePreset,
  onSetPreset, onToggleDrum, onSetLivePreset, onAuditionDrum,
}: {
  channels: ChannelInfo[];
  channelPresets: Record<number, PresetKey>;
  drumChannels: number[];
  livePreset: PresetKey;
  onSetPreset: (channel: number, key: PresetKey) => void;
  onToggleDrum: (channel: number, drum: boolean) => void;
  onSetLivePreset: (key: PresetKey) => void;
  onAuditionDrum: (midi: number) => void;
}) {
  const drumSet = new Set(drumChannels);
  const pad: React.CSSProperties = {
    padding: "3px 8px", fontSize: 10.5, cursor: "pointer", borderRadius: 5,
    border: `1px solid ${C.border2}`, background: "transparent", color: C.dim,
  };

  return (
    <div style={{ color: C.text, fontSize: 11.5 }}>
      {/* Live / tap sound */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: C.faint, minWidth: 96 }}>Tap / Live sound</span>
        <PresetSelect value={livePreset} onChange={onSetLivePreset} />
        <span style={{ color: C.faint, fontSize: 10 }}>used by pad taps, "play chord", and Live mode</span>
      </div>

      {channels.length === 0 ? (
        <div style={{ color: C.faint, padding: "4px 0" }}>
          Load a MIDI file to assign an instrument to each of its channels.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: C.faint, fontSize: 10, letterSpacing: ".04em" }}>
            {channels.length} channel{channels.length === 1 ? "" : "s"} · auto-assigned from the file's General MIDI programs
          </div>
          {channels.map((c) => {
            const isDrum = drumSet.has(c.channel);
            const name = c.instrument || c.track || (c.channel === 9 ? "Percussion" : "—");
            return (
              <div
                key={c.channel}
                style={{
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  padding: "7px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: "#0d1117",
                }}
              >
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: C.indigo, minWidth: 34 }}>
                  {c.channel < 0 ? "ch·" : "ch" + (c.channel + 1)}
                </span>
                <span style={{ flex: "1 1 120px", minWidth: 90, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={name}>
                  {name}
                  <span style={{ color: C.faint, fontSize: 10 }}> · {c.noteCount}</span>
                </span>

                {isDrum ? (
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    {DRUM_PADS.map((d) => (
                      <button key={d.midi} style={pad} onClick={() => onAuditionDrum(d.midi)} title={"Audition " + d.label}>{d.label}</button>
                    ))}
                  </div>
                ) : (
                  <PresetSelect value={channelPresets[c.channel] ?? "piano"} onChange={(k) => onSetPreset(c.channel, k)} />
                )}

                <button
                  onClick={() => onToggleDrum(c.channel, !isDrum)}
                  title={isDrum ? "Treat as a pitched instrument" : "Treat this channel as drums (for non-GM files)"}
                  style={{
                    ...pad,
                    border: `1px solid ${isDrum ? C.teal : C.border2}`,
                    color: isDrum ? C.teal : C.dim,
                    background: isDrum ? "rgba(45,212,191,.12)" : "transparent",
                  }}
                >
                  {isDrum ? "🥁 Drums" : "Drums?"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
