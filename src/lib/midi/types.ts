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
  /** 0-indexed MIDI channel of the source track (for the note inspector). */
  channel?: number;
  /** Source track name, if the file names it (for the note inspector). */
  track?: string;
  /** Source track instrument name, if any (for the note inspector). */
  instrument?: string;
}

/** A parsed song: notes sorted ascending by onset, plus total duration. */
export interface Song {
  name: string;
  /** All notes from all tracks, flattened and sorted by `time` ascending. */
  notes: Note[];
  /** Total length in seconds (after any leading-silence trim). */
  duration: number;
  /** Seconds of leading empty bars trimmed off the original file (0 = none).
   *  Note times are already re-based by this; engine *file* analysis (which runs
   *  on the original bytes) must be shifted by `-trimSec` to stay aligned. */
  trimSec: number;
  /** Same trim as `trimSec`, in beats — for re-aligning engine analysis run on the
   *  ORIGINAL (untrimmed) beats (e.g. `structural_keys`, which we feed untrimmed so
   *  the trim can't shift its window grid). */
  trimBeats: number;
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
