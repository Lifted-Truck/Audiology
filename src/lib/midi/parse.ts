// Turn a raw MIDI file into our flat, time-sorted `Song`. This is the only
// module that touches @tonejs/midi; everything downstream speaks `Song`/`Note`.

import { Midi } from "@tonejs/midi";
import type { Note, Song } from "./types";

/** Parse a MIDI file (from a File/fetch ArrayBuffer) into a `Song`. */
export function parseMidi(data: ArrayBuffer, fallbackName = "Untitled"): Song {
  const midi = new Midi(data);
  const ppq = midi.header.ppq;
  const notes: Note[] = [];
  for (const track of midi.tracks) {
    // GM convention: channel 10 (0-indexed 9) is percussion — @tonejs also sets
    // instrument.percussion. These notes are unpitched (drum map), not harmony.
    const drum = track.instrument?.percussion === true || track.channel === 9;
    const trackName = track.name || undefined;
    const instrument = track.instrument?.name || undefined;
    for (const n of track.notes) {
      notes.push({
        midi: n.midi,
        time: n.time,
        duration: n.duration,
        endTime: n.time + n.duration,
        velocity: n.velocity,
        beats: n.ticks / ppq,
        durationBeats: n.durationTicks / ppq,
        drum,
        channel: track.channel,
        track: trackName,
        instrument,
      });
    }
  }
  // Sort by onset; tie-break on pitch for stable, predictable ordering.
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);

  // Active time-signature numerator at a (0-indexed) measure, from the meter map.
  const sigs = midi.header.timeSignatures;
  const numeratorAt = (measure: number): number => {
    let num = 4;
    for (const s of sigs) {
      if ((s.measures ?? 0) <= measure) num = s.timeSignature[0];
      else break;
    }
    return num;
  };

  // Bar-start times (seconds) for the roll ruler: walk each time-signature
  // segment, stepping one bar of ticks at a time, converting via the tempo map.
  const segs = [...sigs].sort((a, b) => a.ticks - b.ticks);
  if (segs.length === 0) segs.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
  const totalTicks = midi.durationTicks;
  const barStarts: number[] = [];
  for (let i = 0; i < segs.length; i++) {
    const [num, den] = segs[i].timeSignature;
    const ticksPerBar = ppq * (4 / den) * num;
    const end = i + 1 < segs.length ? segs[i + 1].ticks : totalTicks;
    for (let t = segs[i].ticks; ticksPerBar > 0 && t < end; t += ticksPerBar) {
      barStarts.push(midi.header.ticksToSeconds(t));
    }
  }

  return {
    name: midi.name || fallbackName,
    notes,
    duration: midi.duration,
    // Exact tempo-map-aware conversion (handles tempo changes), so engine
    // beat-extents land at the right x on the second-aligned roll.
    beatsToSeconds: (beats: number) => midi.header.ticksToSeconds(beats * ppq),
    // Musical position via @tonejs's tempo+meter maps. ticksToMeasures returns a
    // 0-indexed fractional measure across tempo/meter changes; we render it as a
    // 1-indexed bar + beat-in-bar (beat scaled by the active numerator).
    timeToBarBeat: (seconds: number) => {
      const measure = midi.header.ticksToMeasures(midi.header.secondsToTicks(Math.max(0, seconds)));
      const whole = Math.floor(measure);
      const beat = Math.floor((measure - whole) * numeratorAt(whole)) + 1;
      return { bar: whole + 1, beat };
    },
    barStarts,
  };
}
