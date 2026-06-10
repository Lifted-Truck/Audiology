// Pure mapping + parsing for Live input. No React, no DOM, no Web MIDI side
// effects — just the tables and helpers that turn a computer-keyboard key or a
// raw Web MIDI message into a MIDI note. The effectful wiring lives in
// `hooks/useLiveInput.ts`; this module stays trivially testable.

/**
 * Computer-keyboard → semitone offset above the base note. Ableton-style
 * two-row layout: the home row (A S D F G H J K …) is the white keys, the row
 * above (W E T Y U …) the black keys. Z and X are reserved for octave shift.
 */
export const KEY_TO_SEMITONE: Readonly<Record<string, number>> = {
  a: 0, // C
  w: 1, // C#
  s: 2, // D
  e: 3, // D#
  d: 4, // E
  f: 5, // F
  t: 6, // F#
  g: 7, // G
  y: 8, // G#
  h: 9, // A
  u: 10, // A#
  j: 11, // B
  k: 12, // C (next octave)
  o: 13, // C#
  l: 14, // D
  p: 15, // D#
  ";": 16, // E
};

export const OCTAVE_DOWN_KEY = "z";
export const OCTAVE_UP_KEY = "x";

/** Octave-offset clamp for the computer keyboard (each step = 12 semitones). */
export const OCTAVE_MIN = -3;
export const OCTAVE_MAX = 3;

/**
 * MIDI note that the lowest key (A) maps to at octave offset 0.
 * Ableton convention C3 = 60, so the keyboard starts a comfortable middle.
 */
export const KEYBOARD_BASE_MIDI = 60;

/** Resolve a computer-keyboard key + octave offset to a MIDI note, or null. */
export function keyToMidi(key: string, octaveOffset: number): number | null {
  const semi = KEY_TO_SEMITONE[key];
  if (semi === undefined) return null;
  return KEYBOARD_BASE_MIDI + octaveOffset * 12 + semi;
}

export type MidiMessageType = "noteon" | "noteoff" | "other";

export interface MidiMessage {
  type: MidiMessageType;
  note: number;
  velocity: number;
}

/**
 * Parse a raw Web MIDI message. Note-on with velocity 0 is treated as note-off
 * (the running-status convention many controllers use).
 */
export function parseMidiMessage(data: Uint8Array | number[]): MidiMessage {
  const status = (data[0] ?? 0) & 0xf0;
  const note = data[1] ?? 0;
  const velocity = data[2] ?? 0;
  if (status === 0x90 && velocity > 0) return { type: "noteon", note, velocity };
  if (status === 0x80 || (status === 0x90 && velocity === 0))
    return { type: "noteoff", note, velocity: 0 };
  return { type: "other", note, velocity };
}
