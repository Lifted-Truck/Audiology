// Pitch-class arithmetic. Ableton convention: C3 = 60.

/** Positive modulo (JS `%` keeps the sign of the dividend). */
export const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Pitch class (0..11) of a MIDI note. */
export const pcOf = (midi: number): number => mod(midi, 12);

/** Octave number of a MIDI note (Ableton: C3 = 60). */
export const octOf = (midi: number): number => Math.floor(midi / 12) - 2;
