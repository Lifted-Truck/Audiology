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
  const barTicks: number[] = [];
  for (let i = 0; i < segs.length; i++) {
    const [num, den] = segs[i].timeSignature;
    const ticksPerBar = ppq * (4 / den) * num;
    const end = i + 1 < segs.length ? segs[i + 1].ticks : totalTicks;
    for (let t = segs[i].ticks; ticksPerBar > 0 && t < end; t += ticksPerBar) barTicks.push(t);
  }

  // Trim leading empty bars: messy files often open on several silent bars, so
  // re-base the timeline on the bar that *contains* the first note (keeping its
  // downbeat/meter). Whole empty bars before that are dropped; a partial rest in
  // the first sounding bar is kept. No-op if the first note is already in bar 1.
  const firstNoteTicks = notes.length ? notes[0].beats * ppq : 0;
  let trimTicks = 0;
  for (const bt of barTicks) {
    if (bt <= firstNoteTicks + 1e-6) trimTicks = bt;
    else break;
  }
  const trimSec = midi.header.ticksToSeconds(trimTicks);
  const trimBeats = trimTicks / ppq;
  const M0 = trimTicks > 0 ? Math.round(midi.header.ticksToMeasures(trimTicks)) : 0;
  if (trimTicks > 0) {
    for (const n of notes) {
      n.time -= trimSec;
      n.endTime -= trimSec;
      n.beats -= trimBeats;
    }
  }
  const barStarts = barTicks
    .filter((bt) => bt >= trimTicks - 1e-6)
    .map((bt) => midi.header.ticksToSeconds(bt) - trimSec);

  return {
    name: midi.name || fallbackName,
    notes,
    duration: Math.max(0, midi.duration - trimSec),
    trimSec,
    trimBeats,
    // Exact tempo-map-aware conversion (handles tempo changes), so engine
    // beat-extents land at the right x on the (trim-rebased) second-aligned roll.
    beatsToSeconds: (beats: number) => midi.header.ticksToSeconds((beats + trimBeats) * ppq) - trimSec,
    // Musical position via @tonejs's tempo+meter maps, re-based on the trim so the
    // first sounding bar reads as bar 1. ticksToMeasures returns a 0-indexed
    // fractional measure; we render a 1-indexed bar + beat-in-bar.
    timeToBarBeat: (seconds: number) => {
      const measure = midi.header.ticksToMeasures(midi.header.secondsToTicks(Math.max(0, seconds) + trimSec));
      const whole = Math.floor(measure);
      const beat = Math.floor((measure - whole) * numeratorAt(whole)) + 1;
      return { bar: whole - M0 + 1, beat };
    },
    barStarts,
  };
}
