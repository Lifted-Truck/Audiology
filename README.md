# Audiology

An interactive scale, chord, and MIDI explorer for studying harmony and practicing
progressions — rendered as an Ableton-Push-style pad grid and a piano keyboard, with
live MIDI-file playback and a real-time chord analyzer.

## Features

- **Scale & chord explorer** — 27 scales, 20 chord qualities, inversions and voicings,
  laid out on an 8×8 pad grid (4ths / 3rds / sequential, in-key or chromatic) and a
  piano keyboard.
- **Build / Analyze / Live** modes — build chords and audition them, tap notes to
  identify chords, or watch a playing MIDI file get analyzed in real time.
- **MIDI playback** *(in progress)* — load a `.mid` file and watch it play with a
  moving playhead on a piano-roll timeline; tempo slider, play/pause, scrub, and
  step-through controls for practicing progressions.
- **Live analyzer** *(in progress)* — the analyzer panel names the chord currently
  sounding as the file plays.

## Getting started

Requires **Node 18+**.

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

Other scripts:

```bash
npm run build      # production build
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit
```

## Architecture

The codebase separates a framework-free core from the React UI:

```
src/
  lib/theory/        Pure music theory — scales, chord qualities, pitch helpers,
                     voicings, chord analysis. Imports no React; unit-testable.   [done]
  geometry/piano.ts  Single source of truth for the pitch axis, shared by the
                     Piano keyboard and the (upcoming) PianoRoll timeline.        [done]
  styles/theme.css   The one stylesheet (px- prefixed classes).                  [done]
  PushExplorer.jsx   The original monolith — still renders the whole app. Being
                     decomposed into components phase by phase (see CLAUDE.md).
  lib/midi/          MIDI parsing (@tonejs/midi → Song) + time queries.          [planned]
  audio/             synth.ts + transport.ts (anchor-based lookahead scheduler). [planned]
  hooks/             usePlayback, useAudioContext, explorer state.               [planned]
  components/        Grid, Piano, PianoRoll, TransportBar, Analyzer, panels.     [planned]
```

> **Migration status & roadmap live in [CLAUDE.md](CLAUDE.md).** Phases 0–1 (TS setup +
> typed theory core) are done; Phase 2 adds MIDI parsing and the playback transport.

### Key invariants

- **One synth, one clock.** All audio runs through a single `AudioContext` and the
  `playMidi` synth; the transport schedules on the Web Audio clock.
- **Song-time vs audio-time.** Playback maps song seconds to audio-context seconds via
  an *anchor pair* and a tempo multiplier — never by accumulating wall-clock time.
- **`geometry/piano.ts` owns the pitch axis** so the keyboard and piano-roll always line
  up. MIDI follows the Ableton convention (C3 = 60); the visible range is 36..84.

## License

TBD.
