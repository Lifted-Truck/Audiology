// Single source of truth for the pitch axis. Both the Piano keyboard and the
// (upcoming) PianoRoll map pitch through this module so they stay aligned.

export const PIANO_LO = 36; // C2
export const PIANO_HI = 84; // C6  (Ableton: C3 = 60)

export const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
export const BLACK_PCS = [1, 3, 6, 8, 10];

// key geometry (px)
export const WW = 32; // white key width
export const BW = 20; // black key width
export const WH = 170; // white key height
export const BH = 106; // black key height

/** Vertical lane index for a pitch, 0 at the top (PIANO_HI). Shared by PianoRoll. */
export const pitchToLane = (midi: number): number => PIANO_HI - midi;
