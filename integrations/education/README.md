# Audiology ← education / ear-training

Intake slot for the **music-education / ear-training** consumer (the separate repo).
This is that project's designated write path in Audiology's tree (the mailbox exception);
file briefs here as `brief-N.md` from [`../_template/brief.md`](../_template/brief.md).

## Start here

You can begin the education repo **now**:

1. Stand up a **boundary module** against Audiology's HTTP API (`npm run api` →
   `http://127.0.0.1:8013`; probe `GET /`, call `POST /call/<tool>`) — the v1 analysis
   tools are live today. Pin `audiology_mcp_version` (`0.1.0`).
2. You also consume **Tonality** directly for the theory/scoring (key induction, the
   pitch/chord scorers from brief-19, the scale-name catalog) — separate boundary module,
   separate channel. Split: **theory → Tonality; representation / interaction / audio → Audiology.**
3. File **brief-1** here for what you need next. Likely candidates, all recorded gaps in
   [`../../INTEGRATION.md`](../../INTEGRATION.md) §1:
   - **`render_*` tools** — the bracelet / keyboard / staff / Tonnetz as portable SVG, for
     showing a stimulus and capturing a response without importing Audiology's React.
   - **an audio-spec** — the stimulus parameters (pitch, timbre preset, masking, deadline)
     you render in your own browser (`AudioContext` can't cross a process boundary).
   - **session tools** — progress read/write, once your learner model needs a home.

The six pedagogy schemas (stimulus / response / scoring-oracle / progression / scheduler /
telemetry) sketched in Audiology's `docs/proposals/module-contract-sketch.md` live in
**your** repo — Audiology is a called surface here, not the host.
