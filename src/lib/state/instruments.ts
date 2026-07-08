// Pure selectors for the per-channel instrument subsystem: summarize a song's
// channels (what plays where) and derive the default GM instrument assignment.
// React-free (CLAUDE.md invariant) — App wires these into state and pushes the
// result into the synth's routing.

import type { Song } from "../midi/types";
import { gmProgramToPreset, type PresetKey } from "../../audio/instruments";

export interface ChannelInfo {
  channel: number;
  /** GM instrument name from the file, if any (e.g. "electric bass (finger)"). */
  instrument?: string;
  /** GM program number, if any. */
  program?: number;
  /** Track name, if any. */
  track?: string;
  /** Whether this channel is percussion (GM channel 10 / percussion flag). */
  drum: boolean;
  /** How many notes play on this channel. */
  noteCount: number;
}

/** The distinct channels used by a song, with their instrument metadata and note
 *  counts, ascending by channel number. Undefined-channel notes bucket to -1. */
export function channelSummary(song: Song | null): ChannelInfo[] {
  if (!song) return [];
  const map = new Map<number, ChannelInfo>();
  for (const n of song.notes) {
    const ch = n.channel ?? -1;
    const info = map.get(ch);
    if (info) {
      info.noteCount++;
      info.drum = info.drum || n.drum;
      if (info.instrument == null && n.instrument) info.instrument = n.instrument;
      if (info.program == null && n.program != null) info.program = n.program;
      if (info.track == null && n.track) info.track = n.track;
    } else {
      map.set(ch, {
        channel: ch,
        instrument: n.instrument,
        program: n.program,
        track: n.track,
        drum: n.drum,
        noteCount: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.channel - b.channel);
}

export interface Assignment {
  /** channel → melodic preset (drum channels omitted). */
  presets: Record<number, PresetKey>;
  /** channels routed to the drum kit. */
  drums: number[];
}

/** Default assignment from a channel summary: drum channels → the kit, melodic
 *  channels → the preset for their GM program (piano when unknown). */
export function autoAssign(summary: ChannelInfo[]): Assignment {
  const presets: Record<number, PresetKey> = {};
  const drums: number[] = [];
  for (const c of summary) {
    if (c.drum) drums.push(c.channel);
    else presets[c.channel] = gmProgramToPreset(c.program);
  }
  return { presets, drums };
}
