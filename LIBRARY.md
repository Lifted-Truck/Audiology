# LIBRARY — durable, evidence-backed lessons

Long-term memory for agents working on Audiology. Retrieved *selectively* via
[INDEX.md](INDEX.md) — do not load this whole file by default. Governed by the
Self-Improving Knowledge Loop in [CLAUDE.md](CLAUDE.md): lessons enter as
`tier: candidate`, promote to `canonical` on a second independent occurrence or
human review, and every lesson names what would falsify it. Prefer not writing
over writing unverified. Entry format:

`[Lxxxx] <title> | tier | added: YYYY-MM-DD | tags: … | lesson: … | evidence: … | falsifier: … | supersedes: …`

---

[L0001] Preview MCP: synthetic clicks don't advance playback — verify by seeking
| tier: candidate | added: 2026-07-06 | tags: preview-verify
| lesson: In the Claude_Preview MCP, a scripted click on the transport ▶ does NOT
resume the suspended AudioContext, so `playback.currentTime` stays at 0 and any
playback-dependent behavior never runs. To verify such behavior, SCRUB instead:
dispatch mousedown+mouseup on the `.px-roll-canvas` at an x offset — that calls
`onSeek` and advances `currentTime` even while paused. Caveat: seek-by-pixel maps
through the roll's scroll offset, so once the view has scrolled, the same x maps to
a later time; click Restart (⇤, seek 0) to reset scrollX before pixel-based seeks.
| evidence: Verifying follow-the-key (2026-07-06), clicking ▶ left the clock at
"0:00 / 0:08"; scrubbing the roll advanced `currentTime` and drove the segment-key
tracker correctly (root C→G→C across the modulation). The same ▶-doesn't-play issue
appeared during the eject and console verifications.
| falsifier: A preview harness that resumes the AudioContext on a scripted gesture
(time advances after a scripted ▶ click) would retire this.
| supersedes: —
