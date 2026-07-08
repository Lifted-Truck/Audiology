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

[L0002] Audio-subsystem changes can't be heard headless — verify structurally
| tier: candidate | added: 2026-07-06 | tags: preview-verify, architecture-seams
| lesson: The preview MCP can't confirm actual SOUND (the AudioContext stays
suspended under scripted gestures — see L0001), so you cannot verify a synth /
timbre / drum change by listening. Verify it structurally instead: (1) Node-test
the pure parts — the GM-program→preset mapping and any DSP parameter tables — since
those are deterministic; (2) drive the routing/assignment UI in-browser and read
back state (preset selects, drum toggles); (3) confirm the audio graph builds
without throwing by auditioning and checking `preview_console_logs level:error` is
clean (creating/starting oscillator + buffer nodes on a suspended context does not
throw, so a clean console means the graph is well-formed). Build a tiny controlled
multi-channel MIDI with @tonejs/midi for a fast, exact fixture rather than injecting
a large real file's base64.
| evidence: Multi-timbre subsystem (2026-07-06) — GM auto-assign Node-verified exact
(piano/bass/pad/brass/strings/drums…), a 188-char 3-channel fixture drove the
Instruments panel, preset-change + drums-override + audition all ran with a clean
error console; no sound was ever audible in-harness.
| falsifier: A preview harness that renders/exports audio (or resumes the context)
so output can be asserted would replace this with direct audio verification.
| supersedes: —
