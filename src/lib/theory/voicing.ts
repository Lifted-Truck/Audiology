// Chord voicing helpers. Pure: given a root MIDI note + quality + inversion +
// voicing, produce the exact MIDI notes to sound/display.

import { QUALITIES, type QualityKey } from "./constants";
import type { Voicing } from "./types";

/** Re-arrange a close-position chord into the chosen voicing. */
export function applyVoicing(close: number[], voicing: Voicing): number[] {
  let a = close.slice().sort((x, y) => x - y);
  if (voicing === "drop2" && a.length >= 2) a[a.length - 2] -= 12;
  else if (voicing === "drop3" && a.length >= 3) a[a.length - 3] -= 12;
  else if (voicing === "spread") {
    if (a.length >= 2) a[a.length - 2] -= 12;
    if (a.length >= 4) a[a.length - 4] -= 12;
  } else if (voicing === "wide") {
    a = a.map((n, i) => (i % 2 === 1 ? n + 12 : n));
  }
  return a.sort((x, y) => x - y);
}

/** Build the exact voiced chord (with inversion + voicing) for any root MIDI note. */
export function buildVoicing(
  rootMidi: number,
  qualityKey: QualityKey,
  inversion: number,
  voicing: Voicing
): number[] {
  const iv = QUALITIES[qualityKey].iv;
  const v = iv.map((i) => rootMidi + i).sort((a, b) => a - b);
  const inv = Math.min(inversion, v.length - 1);
  for (let k = 0; k < inv; k++) v.push(v.shift()! + 12);
  v.sort((a, b) => a - b);
  return applyVoicing(v, voicing);
}
