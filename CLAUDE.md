# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

**Audiology** — a React + TypeScript (Vite) single-page app for exploring scales and
chords and for playing/analyzing MIDI files in real time. Started life as a one-file
Ableton-Push-style scale explorer (`PushExplorer.jsx`) and is being refactored into a
modular project (see README "Architecture").

## Run & verify

- Dev server: `npm run dev` → http://localhost:5173.
  - Node is installed at `C:\Program Files\nodejs` but may not be on PATH. In a fresh
    shell, prepend it first: `$env:Path = "C:\Program Files\nodejs;" + $env:Path`.
- Visual checks: use the **Claude_Preview** MCP (`preview_start` with the `dev` config
  in `.claude/launch.json`, then `preview_screenshot` / `preview_resize` /
  `preview_eval` / `preview_console_logs`). After any UI extraction, screenshot and
  diff against the previous look — refactors should be visually identical.
- Before declaring a phase done: `npm run typecheck` **and** `npm run build` must pass.

## Architecture invariants (do not violate)

- **`lib/theory/*` and `lib/midi/*` import no React** — they are the pure, testable core.
- **One synth, one clock.** A single `AudioContext`; all notes go through the `playMidi`
  synth (`audio/synth.ts`). The transport schedules on `ctx.currentTime`.
- **Time model.** Playback bridges *song-time* (`Note.time`, seconds) and *audio-time*
  (`ctx.currentTime`) with an **anchor pair**, and `tempoScale` is a **multiplier**
  (1 = as authored). Re-anchor at the current song position *before* changing tempo so
  there is no position jump. **Never accumulate wall-clock time** — always derive from
  `ctx.currentTime`, so a throttled background tab just does a bounded catch-up.
- **`geometry/piano.ts` is the single source of truth for the pitch axis.** Piano and
  PianoRoll both map pitch through it so they stay aligned.

## Conventions

- CSS classes are prefixed `px-` and live in `styles/theme.css` (one stylesheet,
  imported once). Dark theme; teal = in-scale, indigo = root, amber = chord/selection.
- MIDI: Ableton convention **C3 = 60**; visible keyboard range **36..84** (C2–C6).
- `analyzeSelection(midis, noteName)` is the chord identifier; it takes any `number[]`
  of MIDI notes and returns a tagged union (`empty | single | none | candidates`).
  Feed it manual selections (Analyze mode) or currently-sounding notes (Live mode).

## Gotchas

- **Resume on gesture.** Browsers start the `AudioContext` suspended; resume it inside a
  user-gesture handler (play button / pad tap) before scheduling.
- **Scrubbing while paused is silent by design** — it only moves the cursor and repaints.
- **Canvas DPR.** The PianoRoll is a canvas; scale by `devicePixelRatio` for crispness
  and cache the static note layer (redraw only on song/zoom/viewport change).

## Status

Phased migration tracked in the session task list. Phase 0 = TS + repo setup; the
monolith (`PushExplorer.jsx`) still renders the app and is being decomposed phase by
phase. Keep the app runnable after every phase.
