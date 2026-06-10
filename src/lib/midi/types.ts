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
}

/** A parsed song: notes sorted ascending by onset, plus total duration. */
export interface Song {
  name: string;
  /** All notes from all tracks, flattened and sorted by `time` ascending. */
  notes: Note[];
  /** Total length in seconds. */
  duration: number;
}
