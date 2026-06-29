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
- **Chord Anatomy** — a view that demystifies the current chord across three panels: **Colour**
  (root-aware circle-of-fifths and root-blind interval-content colour wheels, each showing the
  resultant-vector construction), **Intervals** (interval-vector histogram; a stacked **interval-
  bracket diagram** showing every pair above the root nesting into wider intervals; set-class /
  prime-form / bitmask), and a **Harmony map** (consonance × major/minor chirality, plotting the
  chord over the trichord landscape). The graphs persist as scaffolding so the section never blinks
  out during playback.

## Getting started

This is a self-contained frontend — **Node 18+ is the only requirement.** No Python, no
backend, no API keys.

```bash
git clone <this-repo> && cd Audiology
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

That's it — the scale/chord explorer, the **Chord Anatomy** view, MIDI-file playback, and a
local chord analyzer all work with **nothing else installed**.

Other scripts:

```bash
npm run build      # production build
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit
```

### Optional: the Tonality engine (deeper analysis)

A few features — whole-file **key / structural-area / chord analysis** of loaded MIDI, and
engine-backed live chord naming — are powered by the separate
[Tonality](https://github.com/Lifted-Truck/Tonality) music-theory engine. **This is entirely
optional; everything above runs without it.** It is *not* an npm dependency — the dev server
launches it on demand when you click **"⏻ Start engine"** in the transport.

To enable it: clone Tonality, set up its Python env (see its README), and either place it
**next to this repo** (`../Tonality` — the zero-config default) or point the `TONALITY_DIR`
environment variable at it:

```bash
TONALITY_DIR=/path/to/Tonality npm run dev     # also: TONALITY_PYTHON, TONALITY_PORT
```

The engine talks to the app over a local HTTP bridge — see
[Tonality integration](#tonality-integration).

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
### Chord Anatomy & harmonic geometry *(shipped — this records the foundations + open threads)*

The **Chord Anatomy** view (see Features) demystifies *why* chords sound related or different,
organized around one idea: a chord has an inversion-invariant **identity** and a voicing-sensitive
**realization**. Maths is React-free in `src/lib/theory/chord-anatomy.ts`. The design, the
findings worth preserving, and the engine integration:

- **Clinical surfaces.** Interval vector (the inversion-invariant fingerprint), stacked intervals
  bottom-up (which rotate under inversion), set-class prime form, and the 12-bit pc bitmask.
- **Somatic colour — two complementary wheels.** Both build the colour as a **resultant vector**
  (a circular mean of points on a wheel), the principled form of "add the hues":
  - *Root-aware* (circle-of-fifths): each pitch class is a hue on the fifths circle; the resultant's
    angle = hue, length = "focus"/saturation. Transposition rotates it; symmetric chords cancel to grey.
  - *Root-blind* (interval-content): rim = the five inversion-paired interval classes weighted by the
    interval vector, the self-inverse tritone at the centre; **transposition-invariant**, so inversional
    pairs collapse (maj = min, dom7 = m7♭5) and symmetric chords that grey out on the pitch wheel turn
    vivid (aug = pure M3). The two wheels are complementary coordinates: *what intervals* vs *how rooted*.
  - *Encoding.* Register → **perceptually-uniform** OKLCH lightness (not HSL L, which clumps), plus a
    sub-linear focus→chroma stretch to decompress the crowded grey centre.
  - *Known domain constraint* (from enumerating all 4083 pc-sets): the interval-colour reaches only a
    sparse finite cloud of 185 points, heavily massed near grey (109 < 0.15 focus); only the five pure
    dyads + the augmented triad reach full saturation (richness vs saturation are in tension). So colour
    discriminates extremes well, the muddy centre poorly — never rely on it alone.
- **Harmony map — discord vs concord geometry** (Tymoczko trichord geometry, DFT/Quinn-Amiot-Yust).
  Vertical = **consonance** (perfect-fifth content `|f5|`); horizontal = **chirality** (inversional
  handedness): major and minor fall on opposite sides of a symmetric spine, clusters/aug/dim sit on it.
  Key insight it makes visible: **consonance and major/minor are orthogonal axes, not one scale.**
  - *Trichords:* the exact step-gap `(a−b)(b−c)(c−a)`. *Any cardinality:* the bispectrum slice
    `Im(f1·f2·conj(f3))` — transposition-invariant, inversion-odd, separates dom7 ↔ m7♭5. A single
    slice false-zeros on 28 exotic 5–7-note set classes; the **complete signed invariant (full
    bispectrum)** is an open theory problem owned by Tonality.

**Tonality integration** (`integrations/audiology/brief-15.md`): the maths is currently client-side;
the engine should *expose* and Audiology should *consume* — interval vector / `set_class_info` /
**DFT magnitude + phase** (phase drives both hue and chirality; the standing ask is to surface phase
over the bridge). The colour *encoding* stays Audiology's (division of labor). Two engine-side research
items: the complete general chirality, and a renderer-agnostic "interval/colour-content" descriptor for
the Representation layer (cf. the bracelet/Tonnetz descriptors in `brief-2`).

**Future view work:** a reachable-domain "**atlas**" (the 185-point cloud / harmony-map landscape as a
browsable reference), and **interactive note-picking** on the wheels and map (build a chord by clicking
and watch the resultant vector and harmony-map position move) — the point where these stop being
illustrations and become a teaching surface.

- **MIDI chord-colour timeline** — a piano-roll toggle that tints the chords of a loaded/playing
  file by their somatic colour (the Chord Anatomy colour) as the song progresses, **excluding the
  drum channel**, so harmonic motion is visible at a glance. Clean when the Tonality engine is
  connected (its per-segment chord analysis supplies the segments to colour); a fully standalone
  version needs a local chord-segmentation pass over the non-drum notes (group simultaneous/
  overlapping onsets into chord spans). Reuse the existing key-region strip mechanics for the lane.

## License

TBD.
