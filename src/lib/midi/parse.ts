// Turn a raw MIDI file into our flat, time-sorted `Song`. This is the only
// module that touches @tonejs/midi; everything downstream speaks `Song`/`Note`.

import { Midi } from "@tonejs/midi";
import type { Note, Song } from "./types";

/** Parse a MIDI file (from a File/fetch ArrayBuffer) into a `Song`. */
export function parseMidi(data: ArrayBuffer, fallbackName = "Untitled"): Song {
  const midi = new Midi(data);
  const notes: Note[] = [];
  for (const track of midi.tracks) {
    for (const n of track.notes) {
      notes.push({
        midi: n.midi,
        time: n.time,
        duration: n.duration,
        endTime: n.time + n.duration,
        velocity: n.velocity,
      });
    }
  }
  // Sort by onset; tie-break on pitch for stable, predictable ordering.
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  return {
    name: midi.name || fallbackName,
    notes,
    duration: midi.duration,
  };
}
