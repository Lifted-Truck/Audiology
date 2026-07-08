# INDEX — knowledge retrieval map

Compact map of accumulated knowledge for Audiology. **Read this in full each
session** (kept small on purpose), then pull ONLY the matching `[Lxxxx]` entries
from [LIBRARY.md](LIBRARY.md) into context. Governed by the Self-Improving
Knowledge Loop in [CLAUDE.md](CLAUDE.md). Keep pointers to one line each.

## Tags
- `tonality-bridge` — engine/bridge mechanics, the `useEngineFacts` consume-when-connected seam, the data-contract boundary
- `cross-repo-channel` — Audiology↔Tonality acks/briefs (filed as PRs), the shared Tonality working tree, scratchpad-backup hazard
- `preview-verify` — Claude_Preview MCP gotchas (playback, console buffer, stale HMR, seek/scroll)
- `pianoroll-canvas` — the two-layer raster, the `staticVersion` blit invariant, DPR, follow-scroll
- `architecture-seams` — `lib/state` derivation layer, React-free core, fresh-branch-per-PR flow
- `theory-dft` — verified numeric facts (DFT indexing, IV-from-magnitudes, colour/chirality conventions)

## Lessons
- [L0001] `preview-verify` — synthetic ▶ clicks don't resume the AudioContext; verify playback behavior by scrubbing the roll (mind the scroll offset). *(candidate)*
- [L0002] `preview-verify` `architecture-seams` — audio/timbre changes can't be heard headless; verify structurally (Node-test pure DSP/GM maps, drive the routing UI, confirm a clean error console). *(candidate)*
