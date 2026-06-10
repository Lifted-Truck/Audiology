// Time queries over a `Song`. Notes are sorted by onset, so onset lookups use
// binary search. Pure; imports no React.

import type { Note, Song } from "./types";

/** Largest index i with notes[i].time <= T, or -1 if none. */
function lastOnsetAtOrBefore(notes: Note[], T: number): number {
  let lo = 0;
  let hi = notes.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time <= T) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * Notes sounding at song-time `T`: onset already reached and not yet ended
 * (`note.time <= T < note.endTime`). A note's onset is inclusive, its end
 * exclusive, so a zero-length boundary never double-counts.
 */
export function activeNotesAt(song: Song, T: number): Note[] {
  const { notes } = song;
  const upper = lastOnsetAtOrBefore(notes, T);
  if (upper < 0) return [];
  const out: Note[] = [];
  // Any note that started at/before T could still be sounding (durations vary),
  // so scan the started ones and keep those whose end is still in the future.
  for (let i = 0; i <= upper; i++) {
    if (notes[i].endTime > T) out.push(notes[i]);
  }
  return out;
}

/** Onset time of the first note strictly after `T`, or null if none. */
export function nextOnset(song: Song, T: number): number | null {
  const { notes } = song;
  let lo = 0;
  let hi = notes.length - 1;
  let ans: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time > T) {
      ans = notes[mid].time;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

/** Onset time of the last note strictly before `T`, or null if none. */
export function prevOnset(song: Song, T: number): number | null {
  const { notes } = song;
  let lo = 0;
  let hi = notes.length - 1;
  let ans: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time < T) {
      ans = notes[mid].time;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
