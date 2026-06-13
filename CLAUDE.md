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
  headless preview's AudioContext can't run; typecheck + build pass. Also added
  **restart-on-ended** (play from the end starts over) and a **loop** toggle.
- **Phase 3 — PianoRoll + live highlighting.** `src/components/PianoRoll.tsx`: a 2-layer,
  DPR-aware canvas — notes rasterized once to an offscreen layer and blitted, with the
  moving playhead + active-note glow drawn on top each frame. Pitch maps through
  `geometry/piano` (`pitchToLane`); horizontal time, follow-scroll (playhead parks at ~28%
  once scrolling), click/drag-to-seek. Sounding notes (`playback.activeNotes`) now also
  light up the Push grid and Piano (highest-priority `isLit` glow). typecheck + build pass;
  verified in-browser (notes, playhead alignment at start + while scrolled, key lighting).
- **MIDI file key analysis.** `src/lib/theory/scale-detect.ts` (pure): `pitchClassesOf`,
  `scalePitchClasses`, `pcsFitScale`, `outOfScale`, `scalesContaining` (every root×scale
  whose notes contain the file's pitch classes, tightest-first, Chromatic excluded by
  default). PushExplorer shows a **"MIDI file key"** card when a song is loaded: fits /
  doesn't-fit the selected scale (+ the outside notes), and a tap-to-apply list of every
  scale that fits. Node-tested; typecheck + build pass; verified in-browser.
- **Phase 4 — Analyzer consumes playback.** Live mode now identifies the playing MIDI file
  too: `liveNotes` = union of held keyboard/MIDI notes and `playback.activeNotes`, the
  latter smoothed by `src/hooks/useCoalescedNotes.ts` (a note lingers ~60ms after it
  disappears, so chord onsets a few ms apart don't flicker; re-stamps active notes each
  pass so a held/scrubbed position doesn't expire). File notes show as teal chips. Fixed
  two bugs found here: (1) `useAudioContext` getters used `this` and broke when destructured
  (no sound until a file was loaded) — now closures; (2) the coalescer expired notes while
  paused/scrubbing because `activeNotes` is a stable ref then — now re-stamps.
- **Phase 5 — UI split + strict TS.** The monolith is gone. `src/App.tsx` owns state and
  derives grid/piano/chord/highlight data; `src/components/{Grid,Piano,ControlPanels}.tsx`
  and `src/ui/{types,primitives}.tsx` are the typed pieces. `PushExplorer.jsx` deleted,
  `allowJs:false`. Markup kept byte-identical (verified visually); typecheck + build pass.
  (PianoRoll already sits above Piano; transport bar already themed — done in earlier phases.)

### Migration complete
All phases (0–5) plus Live play, MIDI key analysis, and Phase-4 playback wiring are done.
The app is fully `.tsx`, strict-typed, component-split; the pure core stays React-free in
`lib/theory/*` and `lib/midi/*`. No monolith remains.

## Tonality integration (north star: Audiology → a GUI for Tonality)

The long-range goal is to surface **all** of Tonality's capabilities in the UI; expect the
coupling to grow beyond a single bridge. Keep integration points as clean, swappable
data-contract boundaries — `src/lib/tonality/` is the only module that knows the engine's
wire format; everything downstream consumes the normalized `FileAnalysis`. The brief +
triage response of record live in the Tonality repo at `integrations/audiology/`.

### Done — path 1: offline file analysis import
- `src/lib/tonality/{types,parse}.ts` — schema-pinned (`DatasetRecord` v1.0) parse of
  `midi_file_analysis` JSON → `FileAnalysis` (inferred key + ranked candidates, per-segment
  chord readings with second-accurate placement, key regions). Throws on schema drift.
- `scripts/tonality-analyze.py` — runs `midi_file_analysis` out-of-band, writes
  `<name>.tonality.json` (needs `mts` importable; the interim workflow until path 2).
- UI: a **"+ Tonality"** loader in the transport bar; the **MIDI file key** card shows the
  engine's **inferred key** (score · margin · profile, with Apply + alternatives); the
  **PianoRoll** draws a time-aligned **chord-region label strip**. Analysis is dropped when
  the song changes. Node-tested vs a real fixture; verified in-browser.

### Done — modular views + pitch-class diagrams
The stage surfaces are optional modules toggled in a **Views** bar: Push grid, Piano roll,
Piano, **Bracelet**, **Tonnetz**. Hiding the grid also hides its Layout card (`showLayout`
prop). `src/components/{Bracelet,Tonnetz}.tsx` are pure SVG driven by `scalePcs` (backdrop)
+ `activePcs` (built chord in Build, selected/sounding pcs in Analyze/Live) + `noteName` —
rendered client-side from pitch classes the app already has. Bracelet + Tonnetz are recorded
with Tonality as **Representation-layer descriptor needs** (`integrations/audiology/brief-2.md`)
for when that engine layer can describe them.

### Roadmap — path 2: interactive bridge (live naming over the wire)
Replace `analyzeSelection` (and eventually `scalesContaining`) with live engine calls for
the Live-mode analyzer. Tonality sanctioned a **local HTTP bridge over `mts.mcp.tools`**
(their gap 9, "the web door"); interim, stand up our own thin server importing those
functions and serving their JSON dicts — tool signatures + result shapes are the contract,
so swapping to the official bridge is ~a URL change. Other recorded upgrades: `name_pcs`
(bass-aware naming), `voicing_analysis`/`voicing_suggestions` (Build mode), `catalog_*`
(catalog parity + containment, retires `scalesContaining`), and consuming the coming
**Representation layer (Phase 5)** for view descriptions. See `integrations/audiology/response.md`.
- **Coalescing note (from Tonality #50):** the engine now coalesces server-side, so once
  the Live analyzer calls the engine over the bridge, `src/hooks/useCoalescedNotes.ts` can be
  dropped (same contract either side of the wire). Keep it until then — today we analyze
  locally and still need it.

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
