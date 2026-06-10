# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

**Audiology** — a React + TypeScript (Vite) single-page app for exploring scales and
chords and for playing/analyzing MIDI files in real time. Started life as a one-file
Ableton-Push-style scale explorer (`PushExplorer.jsx`) and is being refactored into a
modular project (see README "Architecture").

## Run & verify

- **Fresh machine setup:** clone the repo, ensure **Node 18+** is on PATH, then
  `npm install` (an `esbuild` post-install runs — if a sandbox blocks it, run
  `npm rebuild esbuild` or `npm install` again).
- Dev server: `npm run dev` → http://localhost:5173.
  - *On the original Windows dev box only:* Node lives at `C:\Program Files\nodejs`
    but isn't on PATH; prepend it per shell: `$env:Path = "C:\Program Files\nodejs;" + $env:Path`.
    This quirk is machine-specific — ignore it elsewhere.
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

## Handoff — current status (read this first)

This is a phased migration from a one-file prototype to a modular app. **The session
task list and the original plan file do not travel between machines — this section is
the source of truth.** Keep the app runnable (typecheck + build pass) after every phase.

### Done
- **Phase 0 — Repo + TS setup.** Vite + TypeScript toolchain (`tsconfig.json`,
  `vite.config.ts`, `src/main.tsx`), `package.json` renamed `audiology`, deps incl.
  `@tonejs/midi`, repo hygiene + docs. `allowJs:true` so a `.jsx` file still loads.
- **Phase 1 — Extracted & typed the theory core.** The pure layer now lives in
  `src/lib/theory/*` (`constants`, `types`, `pitch`, `voicing`, `analyze`, `index`)
  and `src/geometry/piano.ts`; styles moved to `src/styles/theme.css`. The monolith
  moved to **`src/PushExplorer.jsx`** and now imports from those modules.
- **Live play (out of original phase order).** A third chord mode `live` plays from
  the computer keyboard (Ableton-style layout; `Z`/`X` octave) or a Web MIDI
  controller, lights held notes on Grid + Piano, and identifies them via
  `analyzeSelection` with an in-key/out-of-key indicator. Added `src/audio/synth.ts`
  (`createSynth` — one-shot `playMidi` **plus** sustained `noteOn`/`noteOff`/`allOff`),
  `src/lib/midi/input.ts` (pure key→semitone map + Web MIDI parse), and
  `src/hooks/useLiveInput.ts`. This front-ran the Phase 2 synth and part of Phase 4.
- **Phase 2 — Synth + MIDI parse + Transport.** `src/lib/midi/{types,parse,query}.ts`
  (`@tonejs/midi` → `Song`; `activeNotesAt`, `nextOnset`, `prevOnset`) + `index.ts`
  barrel. `src/audio/transport.ts` (anchor-pair clock + 25ms lookahead scheduler).
  `src/hooks/useAudioContext.ts` (shared lazy ctx/synth — PushExplorer now uses it
  instead of its own refs) and `src/hooks/usePlayback.ts`. `src/components/TransportBar.tsx`
  (load .mid, play/pause, seek, tempo, step — numeric only). Verified with a Node test of
  the clock/scheduler/query (no-jump tempo & seek, step, end-detect, lookahead) since the
  headless preview's AudioContext can't run; typecheck + build pass.

### Deliberate deviation from the original plan
The monolith is intentionally **still `src/PushExplorer.jsx`** (plain JSX, loaded via
`allowJs`), NOT yet converted to strict `.tsx`. Reason: a full strict-TS conversion of
the ~600-line component is high-churn and best done *while* splitting it into
components. So the UI split **and** its `.tsx` typing happen together in Phase 5
(`allowJs` flips to `false` then). The pure core is already fully typed.

### Next up
- **Phase 3 — PianoRoll + live highlighting.** Canvas piano-roll (2-layer, DPR-aware)
  wired to `usePlayback`: notes, moving playhead, click/drag-to-seek, follow-scroll.
  Add a `litMidis` prop to Grid + Piano so sounding notes light up. `usePlayback`
  already exposes `activeNotes` (MIDI numbers) for this.
- **Phase 4 — Analyzer live wiring.** The chord-card `live` mode already exists (drives
  off Web MIDI / keyboard). Remaining: also let it consume **`playback.activeNotes`** from
  a playing `.mid` (coalesce ~60ms), and make the analyzer fully presentational.
- **Phase 5 — UI split + polish.** Break the monolith into `App.tsx` / `ControlPanels.tsx`
  / `primitives.tsx` / `Grid.tsx` / `Piano.tsx`; delete the monolith; flip `allowJs:false`;
  stack PianoRoll above Piano; theme the transport bar.

### Phase 2 transport design (get this right first)
Two clocks — **song-time** `s` (`Note.time`, sec) and **audio-time** `a`
(`ctx.currentTime`) — bridged by an **anchor pair** so tempo changes don't jump:

```
a = anchorAudio + (s - anchorSong) / tempoScale
s = anchorSong  + (a - anchorAudio) * tempoScale
```

`tempoScale` is a multiplier (1 = as authored). Lookahead loop (`setInterval` 25ms,
`LOOKAHEAD` 0.1s): each tick compute `nowSong`, schedule notes whose onset is in
`(scheduledUntil, nowSong + LOOKAHEAD*tempoScale]` (binary-search the sorted note list)
via `playMidi(midi, duration/tempoScale, when, velocity)`, skip notes >20ms late,
advance `scheduledUntil`. A parallel rAF loop publishes `currentTime()` for visuals.
**play**: resume ctx, anchor at `pauseSong`, start loops. **pause**: freeze
`pauseSong = currentTime()`. **seek(s)**: set cursor; if playing, re-anchor + reset
`scheduledUntil` (silent while paused, by design). **setTempoScale**: re-anchor at the
current song position *first*, then change the scale. `usePlayback` exposes
`{ isPlaying, currentTime, duration, tempoScale, load, play, pause, seek, stepForward,
stepBack, setTempoScale, activeNotes }`; `activeNotes` derives from `currentTime` via
`activeNotesAt(T)` (`note.time <= T < note.endTime`) and is the single source for
highlighting the Grid, Piano, and Analyzer.
