# HANDOFF — Audiology (read this first in a fresh thread)

Snapshot for continuing work. `CLAUDE.md` is the detailed source of truth (and is
auto-loaded); this is the fast on-ramp. **`typecheck` + `build` pass.**

> ⚠️ **Working-tree state (read first):** a full session of work is **uncommitted
> on `main`** (the migration to Tonality's official bridge + the roll's
> ruler/colours/roman-numeral analysis + Build-mode adapt-to-scale). New untracked
> files: `src/lib/theory/roman.ts`, `src/hooks/useEngineProcess.ts`. `scripts/
> tonality-serve.py` is **deleted** (replaced by the official bridge). Review and
> commit before building further — ideally on a branch per the convention below.
> The validation harness from this arc lives in the **Tonality** repo
> (`validation/`), not here.

## What Audiology is

A browser SPA (React + TypeScript + Vite): an Ableton-Push-style **scale & chord
explorer** that grew a **MIDI file player/analyzer** and a **live-play** surface.
The north star: Audiology is becoming **a GUI for the Tonality music-theory
engine** — surface all of Tonality's capabilities over time. All planned phases
(0–5) plus Live play and the Tonality integration are done; we're now in
feature/polish mode.

## Run & verify

- `cd Audiology && npm install && npm run dev` (Vite; default `:5173`).
- Preview MCP: `.claude/launch.json` has a `dev` config. **Port note:** 5173 is
  often taken by other projects in this workspace, so the *workspace-level*
  `.claude/launch.json` (outside the repo) points `dev` at **:5191**. Use
  `preview_start` name `"dev"`.
- **Before declaring anything done: `npm run typecheck` AND `npm run build` must pass.**
- **Headless preview can't play audio** — the browser's `AudioContext` stays
  suspended, so you can't hear playback or verify it advances in the preview.
  Verify transport *logic* via the time readout / seeking and Node tests for pure
  modules. (Inject a MIDI in the preview via a `fixtures/*.mid` served from a temp
  `public/` dir, or a `DataTransfer` on the file input.)

## Architecture (current)

Fully `.tsx`, `strict`, `allowJs:false`. No monolith.

- `src/App.tsx` — orchestrator: all UI state, derived grid/piano/chord/highlight/
  diagram data, handlers; composes the stage + `ControlPanels`.
- `src/components/` — `Grid`, `Piano`, `PianoRoll` (canvas, 2-layer), `Bracelet` +
  `Tonnetz` (SVG), `TransportBar`, `ControlPanels`.
- `src/ui/` — `types.ts` (UI unions, `Cell`), `primitives.tsx` (Field/Seg/Sel/PcChips/Dot).
- `src/hooks/` — `useAudioContext` (one shared ctx+synth), `usePlayback` (transport),
  `useLiveInput` (kbd + Web MIDI), `useCoalescedNotes`, `useBridge` (probe :8012),
  `useEngineProcess` (start/stop the bridge via the dev-server middleware).
- `src/audio/` — `synth.ts` (one-shot `playMidi` + sustained `noteOn/off`),
  `transport.ts` (anchor-pair clock + 25ms lookahead scheduler).
- `src/lib/theory/` — **pure, React-free**: constants (+ `spellInKey`/`keyUsesFlats`),
  pitch, voicing, `analyze` (`analyzeSelection` + `describeVoicing`), `scale-detect`,
  **`roman`** (`chordRoman`/`keyRoman`/`scaleDegreeLabel`/`isDominantRoman`).
- `src/lib/midi/` — **pure**: `types`/`parse` (@tonejs/midi → `Song`; each `Note` now
  carries `beats`/`durationBeats`/`drum`, and `Song` carries `beatsToSeconds`,
  `timeToBarBeat`, `barStarts` — all tempo/meter-map aware), `query`, `input`.
- `src/lib/tonality/` — **the Tonality integration boundary** (only module that knows
  the engine wire format): `types`, `parse` (→ `FileAnalysis`), `bridge` (HTTP client:
  `probeBridge`/`nameChord`/`analyzeMidi`/`structuralKeys` + `callTool` envelope).
- **Invariants** (full list in CLAUDE.md): `lib/theory` & `lib/midi` import no
  React; one synth / one clock; `geometry/piano.ts` is the single pitch axis.

## Tonality integration

- Engine repo: `github.com/Lifted-Truck/Tonality`, local at
  `/Users/machinepriest/Documents/Tonality`. **Read its live `INTEGRATION.md`
  before any MIDI/theory decision.** Cross-project channel:
  `integrations/audiology/` (`brief.md`…`brief-7.md` + matching `response-*.md`).
  Rounds 3–7 = a validation arc: a **corpus accuracy harness** now lives in the
  **Tonality** repo at `validation/validate_corpus.py` (scores inferred-key +
  key-region accuracy vs human-annotated corpora — When-in-Rome `--corpus`, the
  license-clean Schubert Winterreise `--swd`; `--structural` scores the shipped
  `structural_keys` reduction). Findings: the windowed key-regions over-segment;
  the structural reduction helps but doesn't fully close on mono-tonal repertoire;
  `disambiguate_relative_keys` is a no-op on tonal music. Project memory:
  `…/memory/tonality-integration.md` and `…/memory/test-corpora.md`.
- **Bridge** = Tonality's **official** HTTP bridge: `python -m mts.mcp.bridge`
  (stdlib-only, loopback `:8012`; `GET /` info, `GET /tools`, `POST /call/<tool>`
  → `{ok, result}`). We retired our `scripts/tonality-serve.py` shim. You don't run
  it by hand — the **"⏻ Start engine"** button in the transport spawns it via the
  Vite dev-server middleware (`vite.config.ts`), with `PYTHONPATH` set to the
  Tonality working tree (**the `.venv` has a stale installed `mts`** — PYTHONPATH
  must point at the tree or `-m mts.mcp.bridge` imports the wrong one). `pkill -f
  mts.mcp.bridge` to stop a stray one. Env overrides: `TONALITY_DIR`,
  `TONALITY_PYTHON`, `TONALITY_PORT`.
- **Live naming (path 2):** `useBridge` auto-detects the bridge (probe `GET /` every
  5s); Live mode debounce-calls `POST /call/name_pcs` for engine chord naming (chosen
  + functional role + alternatives + `is_ambiguous`), and **falls back to local
  `analyzeSelection` when offline**. Status chip in the Live panel.
- **File analysis (path 1):** the engine's `midi_file_analysis` takes a server-side
  *path*, but the browser has bytes — so file analysis posts the bytes to our
  same-origin **`/__tonality/analyze_midi`** adapter (`vite.config.ts`), which writes
  a temp file and calls the bridge. → `FileAnalysis` (inferred key + ranked
  candidates + per-segment chords + key regions). **Auto-analyzes on load when the
  bridge is connected**; offline, use the "+ Tonality" JSON loader (generate JSON
  with `scripts/tonality-analyze.py <file>.mid`). A **Coalesce** control in the
  transport sets `coalesce_window_beats` (default **1/8 = 0.5**; "Off" = exact) —
  heals performed-timing over-segmentation per Tonality's recipe (response-3); changing
  it re-analyzes. Drives the inferred-key card + chord-region & key-region strips
  (each spelled in its own key — "Bb maj", not "A# maj"). Low-confidence key regions
  (`meanMargin < 0.03`) merge into the prevailing key (consumer-side thresholding).
- **Structural key-areas (`structural_keys`):** the windowed key-regions over-segment
  (every tonicization reads as a key change), so the roll's key strip defaults to the
  engine's **structural reduction** — `POST /call/structural_keys` with note `events`
  built client-side from the parsed `Song` (beats from ticks/ppq). Returns clean
  key-`areas` + the absorbed `tonicizations` (degree + target key). App converts area
  beats→seconds via `Song.beatsToSeconds`, applies a consumer min-area gate
  (`MIN_AREA_BEATS=24`, absorbs sub-bar blips), and surfaces the tonicizations as the
  orange **pivot lane** with roman numerals. A roll toggle switches the strip to the
  raw **windowed** track.

## Current UI (so you don't re-discover it)

- **Chord card** modes: `build | analyze | live`.
- **Views bar** toggles modules, in order: **Transport / Piano roll** (kept adjacent so the
  roll stays with the transport) / Push grid / Piano / Bracelet / Tonnetz. Transport and the
  roll are now **optional** — a user who only wants the scale explorer can hide all the
  MIDI-analysis surfaces. Hiding the grid hides its Layout card.
- **Diagrams:** bracelet (pc clock) + Tonnetz (endless, drag-to-pan). Both clickable
  (set chord root / select / tap — Tonnetz click works in Analyze too), settings-aware
  labels, **tonic = indigo ring, chord root = cream ring, out-of-scale active notes = red**.
  Deleting a selected note via a diagram removes it **across all octaves**.
- **Transport:** load .mid, **+ Tonality / ⏻ Start engine**, play/pause, **restart (⇤)**,
  prev/next onset, loop, seek, tempo (a **multiplier**). Readouts: **bar·beat**
  (`song.timeToBarBeat`) and **tempo-accurate clock** (`currentTime / tempoScale`).
  Engine flags live here: **Coalesce** (`coalesce_window_beats`, default 0.5), **Rel-key**,
  **Smooth**. **Wheel over the roll pans independent of the playhead; click seeks.**
- **Piano roll** is the analysis centrepiece. Top-down lanes:
  - **Bar/time ruler** — bar numbers + per-bar clock, both **tempo-accurate** (recompute
    when `tempoScale` changes), with bar gridlines down the roll.
  - **Key strip** — the engine's **structural** key-areas by default (toggle to raw
    **windowed** regions), each spelled in its own key.
  - **Pivot lane** — orange ticks + **Roman numerals** for tonicizations (e.g. `V/vi`).
  - **Chord strip** — per-segment chord labels; a **names / roman / both** toggle. Roman
    mode renders scale-degree numerals (accidentals included), **applied dominants** as
    `V/V`, and single melodic notes as their **scale degree**.
  - **Note colours:** in-key = teal, **out-of-key = red** (anything chromatic is flagged),
    **drums = grey** (channel-10 / percussion).
  - **Hover tooltip** expands any truncated strip label.
- **Playing notes = yellow** (`#fde047`) on grid + piano (was white — collided with nothing
  and read better). **Scale-colours toggle** (Labels) → neutral "blank" surface.
- **Build mode:** "tap pad plays chord"; in **In-Key** mode (or with **Adapt-to-scale** on,
  now available in Chromatic too) the pad's quality is fit to the scale *before* it sounds.
- **Defaults:** Chromatic + Fixed (C) + scale colours On.
- **"MIDI file key" card:** engine inferred key + Apply + alternatives + fits-these-scales chips.
- **Analyze readout** now reports chord **voicing** alongside inversion.

## Roadmap / open threads

1. **Follow-the-key mode** (the natural next big feature): a toggle that auto-switches
   the app's root+scale to the **current playback segment's local key** as the playhead
   moves. Needs a *segment-key tracker* (distinct from the whole-file key — derive from
   `analysis.keyRegions` at `playback.currentTime`) and a **circle-of-fifths** view
   module to follow key changes.
2. **"Deeper analysis" mode:** opt-in toggle surfacing *everything* the engine returns
   (all key regions incl. low-confidence + margins, all naming alternatives,
   set-class/DFT). Default view stays simplified.
   - **Structural anchor toggle (frame-weighted vs legacy):** the engine's
     `structural_keys` now defaults to `anchor_method="frame_weighted"` (Tonality
     response-8 — better tonic anchoring; e.g. it recovers a true tonic where the
     default used to land on a repeatedly-tonicized dominant). We call it without the
     param, so the key strip already inherits this. Expose a toggle here to pick
     `frame_weighted` vs the retained legacy `most_prevalent_region`, because
     frame-weighting has a *symmetric risk*: a file ending in a sustained, non-returning
     modulation gets a closing-frame vote for that ending key (0 cases in SWD-24, but it
     can mis-anchor a piece that ends on a long off-tonic pedal). Thread `anchor_method`
     through `bridge.structuralKeys` + the `/__tonality/analyze_midi` adapter params.
3. **Move more theory onto the bridge:** `catalog_*` (retire `scalesContaining`),
   `voicing_analysis`/`voicing_suggestions` (Build mode), and consume Tonality's coming
   **Representation layer** (keyboard descriptor first; bracelet/Tonnetz descriptor needs
   already filed in `brief-2.md`).
4. **Coalescing:** drop `useCoalescedNotes` once the live path is fully engine-driven
   (Tonality #50 coalesces server-side).
5. **Beat-based ("musical") roll axis:** the roll is second-based (x = seconds), so on a
   file with real tempo changes (Bohemian: 35–176 bpm) bars correctly render at *uneven*
   widths — faithful but reads oddly. Offer an even-bar beat-based x-axis (Ableton default;
   notes now carry `.beats`) as a toggle. Time labels go uneven instead.
6. **Tempo / time-signature *induction* + a verification test:** for files *with* embedded
   tempo/meter we read it faithfully (no detector); the gap is inferring tempo+meter for
   files lacking reliable data — **Tonality engine territory**, testable via the validation
   harness (When-in-Rome/SWD ship ground-truth meter). Needs a brief + harness meter-test.
7. **Inform Tonality (brief-8):** the drum/channel-10 finding (GM ch10 present but
   duration-weighting makes it a non-issue — confirm their stance) + the representation need
   for surfacing tonicizations as first-class render data (we currently read them off
   `structural_keys.areas[].tonicizations`).
8. **Roll polish / open bug:** done — pivot lane with roman labels, chord-strip Roman-numeral
   toggle (names/roman/both, applied-dominants `V/V`, single-note scale degrees), hover tooltip
   for truncated strip labels. **Still open:** clear the roll's `manualScroll` on an explicit
   seek so seeking resumes follow (the view sometimes won't track the playhead after a wheel-pan
   — recurs in testing); confirm the drum grey reads distinctly.
9. **Piano-roll feature deep-dive (maintainer has several ideas — scope as a batch):**
   first concrete one is **click a note to inspect it** (a popout near the cursor showing
   pitch/octave, bar·beat, duration, velocity, channel/instrument, in-key vs chromatic,
   scale degree in the local key). Note: clicking the roll currently *seeks*, so note-pick
   needs a modifier/mode (design it, don't fight click-to-seek). Gather the other ideas here
   before building.
10. **Independent scroll for the two columns (desktop):** the stage (`.px-stage`, views) and
    the options panel (`.px-panel`) should scroll independently on wide screens. **Caveat:**
    `.px-panel` is a CSS *multi-column* layout (`column-width:240px`) — vertical scroll fights
    multicol (a height-constrained multicol overflows *horizontally*), so this needs the panel
    switched to a single scrolling column (changes its 2-col look) or an inner scroll wrapper.
    A `min-width` gate keeps mobile (stacked, ≤~760px) on normal page scroll.
11. **Custom-scale analysis section (Ian-Ring-style):** build a scale/pc-set editor that
    surfaces analytical info — interval vector, set-class/Forte + Ring number, symmetry
    (reflection/rotation), modes/rotations, DFT "harmonic colour", complement, named matches.
    The engine already returns all of this (`set_class_info`, `chord/scale_analysis.symmetry`,
    DFT magnitudes, `find_containers`/catalog) — a strong Tonality-GUI feature. **Maintainer-
    specific:** flag which results are **Push-3-available scales** vs not.

## Workflow conventions & gotchas (learned the hard way)

- **Branch off `main`; keep only ONE open branch touching `App.tsx` at a time.**
  Parallel `App.tsx` PRs caused repeated merge conflicts. **Do not stack PRs** — a
  stacked PR merges into its base branch, not `main` (we had to reconcile `main`
  several times).
- Verify UI through the **Claude_Preview** MCP. After a prop rename, HMR can leave
  **stale console errors** — reload / force a remount before trusting them. The PianoRoll
  especially: an HMR'd component can blit against an old `Song` shape (e.g. before
  `barStarts` existed) and throw until a fresh server restart — guard new `Song`/`Note`
  fields defensively (`song.barStarts?.length`).
- **The recurring stale-blit bug.** PianoRoll is two layers: a rasterized static layer and
  a visible layer that blits it + draws the playhead/glow. When you add a prop that changes
  what the *visible* layer draws (a region/label/tempoScale), you **must** add it to the
  visible-layer effect's dep array or the change won't show until the user scrolls. This bit
  us for `tempoScale` (per-bar times), and `regions/keyRegions/pivots` (roman↔names toggle).
- **Open bug — `manualScroll` not cleared on seek.** A wheel-pan sets `manualScroll` to park
  the view; an explicit seek doesn't clear it, so the roll sometimes won't track the playhead
  afterward (roadmap item 8). Programmatic page-scrolling also dispatches wheel events on the
  canvas, which can re-trigger it.
- Commit messages end with `Co-Authored-By: Claude …`; PR bodies end with the
  "Generated with Claude Code" line; PRs target `main`.
- The bridge may be left running in the background — `pkill -f mts.mcp.bridge` to stop.
