# Audiology

An interactive scale, chord, and MIDI explorer for studying harmony and practicing
progressions — rendered as an Ableton-Push-style pad grid, a piano keyboard, and
pitch-class diagrams, with live MIDI-file playback and real-time, theory-engine-backed
analysis. Its north star is to become **a GUI for the [Tonality](#tonality-integration)
music-theory engine**.

## Features

- **Scale & chord explorer** — 27 scales, 20 chord qualities, inversions and voicings,
  laid out on an 8×8 pad grid (4ths / 3rds / sequential, in-key or chromatic), a piano
  keyboard, and **Bracelet** (pitch-class clock) + **endless Tonnetz** diagrams. Surfaces
  are optional modules toggled in a **Views** bar.
- **Build / Analyze / Live modes** — build chords and audition them (with adapt-to-scale),
  tap notes to identify chords, or watch a playing MIDI file get analyzed in real time.
- **MIDI playback** — load a `.mid` file and watch it play on a piano-roll timeline with a
  moving playhead, a tempo-accurate **bar/time ruler**, follow-scroll, loop, tempo slider,
  and scrub/step controls.
- **Theory-engine analysis** — with the Tonality engine running, a loaded file is analyzed
  for its key, **structural key-areas**, tonicizations (an orange **pivot lane** with Roman
  numerals), and per-segment chords. The chord strip toggles between **names / Roman
  numerals / both** (with applied dominants like `V/V` and single-note scale degrees), and
  notes are coloured in-key / out-of-key / drums.
- **Live analyzer** — the analyzer names the chord currently sounding (engine-backed when
  connected, local fallback otherwise), with functional role and alternatives.

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

The theory-engine features are optional: the transport's **"⏻ Start engine"** button spawns
the local Tonality bridge for you (see [Tonality integration](#tonality-integration)). Without
it, the explorer, playback, and a local chord analyzer all still work.

## Architecture

A framework-free core is kept strictly separate from the React UI:

```
src/
  lib/theory/    Pure music theory — scales, chord qualities, pitch, voicings, chord
                 analysis (analyzeSelection), scale detection, Roman-numeral analysis
                 (roman.ts). Imports no React; unit-testable.
  lib/midi/      MIDI parsing (@tonejs/midi → Song; notes carry beats/duration/drum,
                 Song carries beatsToSeconds / timeToBarBeat / barStarts) + time queries
                 + keyboard/Web-MIDI input. No React.
  lib/tonality/  The Tonality integration boundary — the only module that knows the
                 engine's wire format (probe / nameChord / analyzeMidi / structuralKeys);
                 everything downstream consumes the normalized FileAnalysis.
  geometry/      piano.ts — the single source of truth for the pitch axis, shared by the
                 Piano keyboard and the PianoRoll so they stay aligned.
  audio/         synth.ts (one shared synth) + transport.ts (anchor-pair clock + lookahead).
  hooks/         usePlayback, useAudioContext, useLiveInput, useBridge, useEngineProcess.
  components/    Grid, Piano, PianoRoll, TransportBar, Bracelet, Tonnetz, ControlPanels.
  App.tsx        Owns state; derives grid/piano/chord/highlight/analysis data.
```

### Key invariants

- **The pure core imports no React.** `lib/theory/*` and `lib/midi/*` stay testable and
  framework-free; `lib/tonality/*` is the sole engine-wire boundary.
- **One synth, one clock.** All audio runs through a single `AudioContext` and the `playMidi`
  synth; the transport schedules on the Web Audio clock.
- **Song-time vs audio-time.** Playback maps song seconds to audio-context seconds via an
  *anchor pair* and a tempo multiplier — never by accumulating wall-clock time.
- **`geometry/piano.ts` owns the pitch axis** so the keyboard and piano-roll always line up.
  MIDI follows the Ableton convention (C3 = 60); the visible range is 36..84.

> **Working in this repo with Claude Code?** [CLAUDE.md](CLAUDE.md) is the agent-facing
> source of truth — invariants, conventions, gotchas, current status, the Tonality bridge
> mechanics, and the open engineering threads.

## Tonality integration

Audiology consumes [Tonality](https://github.com/Lifted-Truck/Tonality), a local-first
music-theory engine, over its official HTTP bridge (`python -m mts.mcp.bridge`, loopback
`:8012`). The dev server can spawn/stop the bridge on demand. `src/lib/tonality/` is the only
module that speaks the engine's wire format; the UI consumes a normalized `FileAnalysis`.

The two projects coordinate through a brief/response channel in the Tonality repo
(`integrations/audiology/`), backed by a corpus **validation harness** (`validation/` in the
Tonality repo) that scores engine key/region output against human-annotated datasets
(When-in-Rome, Schubert Winterreise). See CLAUDE.md for the bridge mechanics and the
bytes→path file-analysis adapter.

## Roadmap

Near-term feature work and known bugs are tracked in [CLAUDE.md](CLAUDE.md) ("Open
engineering threads"). The longer-horizon direction:

- **Learning mode** — flashcards + structured lessons over the explorer (identify a
  chord/scale/interval, spell a Roman numeral, name a key), eventually driven by **progress
  reports imported from a separate learning app** so sequencing and spaced-repetition reflect
  real mastery rather than in-app state alone. *(Being workshopped.)*
- **An Audiology MCP** — expose Audiology's own capabilities (analysis surfaces, scale/chord
  identification, learning-mode progress) as an MCP server so other agents and apps can drive
  it and exchange data with it — distinct from the Tonality bridge, where Audiology is the
  *consumer*. First consumer would be the external learning app above.
- **Greater modularity** — formalize the existing discipline (pure core, single engine-wire
  boundary, optional Views) into a real mode/surface plugin seam and a stable internal data
  model the MCP can publish.
- **Follow-the-key mode** — auto-switch the explorer's root+scale to the current playback
  segment's local key as the playhead moves, with a circle-of-fifths view.
- **"Deeper analysis" mode** — an opt-in view surfacing everything the engine returns (all key
  regions + margins, naming alternatives, set-class / DFT, the structural anchor toggle).
- **Custom-scale analysis** — an Ian-Ring-style scale/pc-set editor surfacing interval vector,
  set-class, symmetry, modes, DFT "harmonic colour", and named matches (with Push-3 availability
  flagged).
- **Chord interval-content view** — demystify *why* chords sound related or different by showing
  their interval content two ways, built around the inversion-invariant / voicing-sensitive split.
  *Clinical:* the interval vector (the inversion-invariant "fingerprint"), stacked intervals
  bottom-up (which rotate under inversion), set-class, and the pc-set bitmask. *Somatic:* a
  per-chord **colour** — pitch classes mapped to hue via the circle of fifths and blended (a
  circular mean / DFT-phase, so similar chords resolve to similar colours rather than muddying),
  with register → brightness. Brightness rides a **perceptually-uniform** lightness axis (OKLCH
  L / CIE L*, not HSL's L — HSL 50% reads far lighter than middle gray and equal L steps clump
  toward the light end), so register differences read as even, legible steps and inversions share
  a hue but shift in value. A **colour-wheel** rendering makes the blend legible: each note is a
  pure hue on the rim (circle-of-fifths spacing) and the chord's colour is the **resultant
  vector** of those points — its angle = hue, its length = "focus"/saturation — so symmetric
  chords (aug, dim7) land at the dead center and go grey, visibly showing their tonal ambiguity.
  A second, **root-blind** wheel complements it: the rim is the five inversion-paired interval
  classes (m2/M7 … P4/P5) weighted by the interval vector, the tritone (self-inverse) sits at
  center, and the resultant is a **transposition-invariant** "interval colour" — so inversional
  pairs collapse (maj = min, dom7 = m7♭5) and the symmetric chords that grey out on the pitch
  wheel turn vivid (aug = pure M3 stack). The two wheels are complementary coordinates: one says
  *what intervals* (root-blind), the other *how it's rooted*. **Known constraint** (from
  enumerating all 4083 pc-sets): the interval-wheel's reachable domain is a *sparse finite cloud*
  of 185 points heavily clustered near grey (109 at focus < 0.15) — only the five pure dyads and
  the augmented triad reach full saturation, since richness and saturation are in tension. So
  colour discriminates the extremes well and the muddy centre poorly; apply a **nonlinear
  focus→saturation stretch** to decompress the centre, and never rely on colour alone (pair with
  the clinical views). Inversions are a
  first-class axis (same identity, different realization). **Tonality dependency:** *consume*
  Tonality's `set_class_info` / interval vector / DFT (incl. **phase**, which drives hue) — the
  determination is the engine's, the colour encoding is ours (the division-of-labor line). A
  renderer-agnostic "interval/colour content" descriptor is a future Representation-layer need
  (cf. the bracelet/Tonnetz descriptors in `brief-2`) — file a brief when the view is scoped.

## License

TBD.
