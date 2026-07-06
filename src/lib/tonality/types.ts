// Raw shapes from Tonality's `midi_file_analysis` result — the subset Audiology
// consumes, mirroring the `to_dict()` forms in the engine (key induction result,
// `DatasetRecord`, key regions). Pinned to a schema version so a drift surfaces
// loudly rather than silently mis-parsing. See lib/tonality/parse.ts for the
// normalization into app-facing types, and the integration brief/response in the
// Tonality repo (integrations/audiology/) for the contract of record.
//
// This module is the single boundary that knows the engine's wire format. Today
// the JSON arrives via offline import; a future local bridge would deliver the
// same shapes — everything downstream speaks the normalized `FileAnalysis`.

/** Engine schema version this parser is written against (DatasetRecord). */
export const TONALITY_SCHEMA_VERSION = "1.0";

export interface RawKeyCandidate {
  tonic_pc: number;
  mode: string; // "major" | "minor" | …
  score: number;
}

export interface RawKeyResult {
  candidates: RawKeyCandidate[];
  margin: number;
  pc_weights?: number[];
  profile_version: string;
}

export interface RawPlacement {
  onset_beats: number;
  duration_beats: number;
  onset_seconds: number;
  duration_seconds: number;
  bar: number;
  beat: number;
}

export interface RawInterpretation {
  root_pc: number;
  quality: string;
  aliases?: string[];
}

export interface RawSegmentRecord {
  schema_version?: string;
  kind?: string;
  identity: { mask: number; pcs: number[]; cardinality: number; spec_level?: string };
  analysis: {
    chord?: unknown;
    scale?: unknown;
    interpretations?: { interpretations?: RawInterpretation[] };
  };
  placement: RawPlacement;
}

export interface RawDataset {
  schema_version: string;
  records: RawSegmentRecord[];
  temporal?: unknown;
}

export interface RawKeyRegion {
  start_seconds: number;
  end_seconds: number;
  tonic_pc: number;
  mode: string;
  mean_score: number;
  mean_margin: number;
}

export interface RawAnalysis {
  key: RawKeyResult;
  dataset: RawDataset;
  key_regions?: { regions: RawKeyRegion[] } | null;
  /** RE-3 (Tonality PR #133, additive): itemized MIDI-read losses — re-strike
   *  truncations, dropped dangling note-ons / zero-length pairs. Usually []. */
  midi_read_losses?: unknown[];
}
