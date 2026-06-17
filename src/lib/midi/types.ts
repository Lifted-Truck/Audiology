// Playback data model. A parsed MIDI file becomes a flat, time-sorted list of
// notes plus a duration — everything the transport and queries need, with no
// dependency on @tonejs/midi past the parse step. Imports no React.

import type { Midi } from "../theory/types";

/** A single sounding note in song-time (seconds). */
export interface Note {
  /** MIDI note number (Ableton convention C3 = 60). */
  midi: Midi;
  /** Onset, seconds from the start of the song. */
  time: number;
  /** Length in seconds. */
  duration: number;
  /** Onset + duration, precomputed for active-note queries. */
  endTime: number;
  /** Normalized velocity, 0..1 (as authored). */
  velocity: number;
  /** Onset in quarter-note beats (ticks / ppq) — for engine event lists. */
  beats: number;
  /** Length in quarter-note beats — for engine event lists. */
  durationBeats: number;
  /** GM percussion (channel 10) — unpitched; rendered in its own colour. */
  drum: boolean;
}

/** A parsed song: notes sorted ascending by onset, plus total duration. */
export interface Song {
  name: string;
  /** All notes from all tracks, flattened and sorted by `time` ascending. */
  notes: Note[];
  /** Total length in seconds. */
  duration: number;
  /** Exact (tempo-map-aware) beats → seconds, for placing engine beat-extents
   *  on the second-aligned roll (e.g. structural_keys areas). */
  beatsToSeconds: (beats: number) => number;
  /** Musical position at a song-time (seconds): 1-indexed bar + beat-in-bar.
   *  Tempo- AND meter-map aware (handles tempo/time-signature changes). */
  timeToBarBeat: (seconds: number) => { bar: number; beat: number };
  /** Song-time (seconds) at the start of each bar — for the piano-roll ruler.
   *  Built from the meter map (handles time-signature changes). */
  barStarts: number[];
}
