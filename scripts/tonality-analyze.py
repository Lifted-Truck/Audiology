#!/usr/bin/env python3
"""Offline bridge to Tonality: analyze a MIDI file and write the JSON that
Audiology's "Load analysis" button consumes.

This is the interim "path 1" workflow until Tonality ships its local HTTP bridge
(gap 9, "the web door"). Audiology is a browser app and can't run the engine
itself, so this script runs `midi_file_analysis` out-of-band and drops a sidecar
`<name>.tonality.json` next to the MIDI file.

Requirements: the Tonality engine importable as `mts` — either `pip install mts`
or run with the repo on PYTHONPATH, e.g.:

    PYTHONPATH=/path/to/Tonality python3 scripts/tonality-analyze.py song.mid

The result shape is Tonality's `midi_file_analysis` dict; the contract lives in
the Tonality repo (integrations/audiology/). Parsed by src/lib/tonality/parse.ts.
"""

import json
import sys
from pathlib import Path


def analyze(path: str) -> dict:
    # Preferred: the MCP tool wrapper (single source of the call).
    try:
        from mts.mcp.tools import midi_file_analysis

        return midi_file_analysis(path)
    except ImportError:
        pass

    # Fallback: the MCP extra isn't installed — reconstruct from the library
    # submodules (same body as midi_file_analysis, key-regions included).
    from mts.analysis import candidate_context, infer_key
    from mts.io.midi import sequence_from_midi_file
    from mts.dataset.builders import dataset_from_sequence

    seq = sequence_from_midi_file(path)
    keys = infer_key(seq)
    ctx = candidate_context(keys.best if hasattr(keys, "best") else keys.candidates[0])
    dataset = dataset_from_sequence(seq, analytical_context=ctx)
    result = {"key": keys.to_dict(), "dataset": dataset.to_dict()}
    try:
        from mts.temporal import track_keys

        result["key_regions"] = track_keys(seq).to_dict()
    except (ImportError, ValueError):
        result["key_regions"] = None
    return result


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        print("usage: tonality-analyze.py <file.mid> [out.json]", file=sys.stderr)
        return 2
    midi_path = argv[1]
    out_path = argv[2] if len(argv) > 2 else str(Path(midi_path).with_suffix(".tonality.json"))
    try:
        result = analyze(midi_path)
    except ModuleNotFoundError:
        print(
            "error: the Tonality engine (`mts`) is not importable.\n"
            "       pip install mts, or run with PYTHONPATH=/path/to/Tonality",
            file=sys.stderr,
        )
        return 1
    Path(out_path).write_text(json.dumps(result, indent=2, default=str))
    key = result["key"]["candidates"][0]
    segs = len(result["dataset"]["records"])
    print(f"wrote {out_path}  (key tonic_pc={key['tonic_pc']} {key['mode']}, {segs} segments)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
