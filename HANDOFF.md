# HANDOFF — Audiology (read this first in a fresh thread)

Snapshot for continuing work. `CLAUDE.md` is the detailed source of truth (and is
auto-loaded); this is the fast on-ramp. As of this writing **`main` is green**
(`npm run typecheck` + `npm run build` pass) and **no PRs are open**.

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
  `useLiveInput` (kbd + Web MIDI), `useCoalescedNotes`, `useBridge`.
- `src/audio/` — `synth.ts` (one-shot `playMidi` + sustained `noteOn/off`),
  `transport.ts` (anchor-pair clock + 25ms lookahead scheduler).
- `src/lib/theory/` — **pure, React-free**: constants, pitch, voicing, `analyze`
  (`analyzeSelection`), `scale-detect` (`scalesContaining`).
- `src/lib/midi/` — **pure**: types, `parse` (@tonejs/midi → `Song`), `query`
  (`activeNotesAt`/`nextOnset`/`prevOnset`), `input` (kbd map + Web MIDI parse).
- `src/lib/tonality/` — **the Tonality integration boundary** (the only module that
  knows the engine's wire format): `types` (schema), `parse` (→ `FileAnalysis`),
  `bridge` (HTTP client, `ChordNaming`).
- **Invariants** (full list in CLAUDE.md): `lib/theory` & `lib/midi` import no
  React; one synth / one clock; `geometry/piano.ts` is the single pitch axis.

## Tonality integration

- Engine repo: `github.com/Lifted-Truck/Tonality`, local at
  `/Users/machinepriest/Documents/Tonality`. **Read its live `INTEGRATION.md`
  before any MIDI/theory decision.** Cross-project channel:
  `integrations/audiology/` (`brief.md`/`response.md`, `brief-2.md`/`response-2.md`).
  There is a project memory: `…/memory/tonality-integration.md`.
- **Bridge** = `scripts/tonality-serve.py`: a thin local HTTP server over
  `mts.mcp.tools` (CORS; `GET /health`, `POST /name_pcs`, `POST /analyze_midi`).
  Run: `PYTHONPATH=/Users/machinepriest/Documents/Tonality \
  /Users/machinepriest/Documents/Tonality/.venv/bin/python scripts/tonality-serve.py`
  (port 8765). **The `.venv` has a stale installed `mts`** — you must set
  `PYTHONPATH` to the working tree, or the new tools won't import.
- **Live naming (path 2):** `useBridge` auto-detects the bridge (probe every 5s);
  Live mode debounce-calls `/name_pcs` for engine chord naming (chosen + functional
  role + alternatives + `is_ambiguous`), and **falls back to local `analyzeSelection`
  when offline**. Status chip in the Live panel.
- **File analysis (path 1):** `/analyze_midi` (raw bytes) → `FileAnalysis` (inferred
  key + ranked candidates + per-segment chords + key regions). **Auto-analyzes on
  load when the bridge is connected**; offline, use the "+ Tonality" JSON loader
  (generate JSON with `scripts/tonality-analyze.py <file>.mid`). Drives the inferred-
  key card + chord-region & key-region strips on the roll. Low-confidence key regions
  (`meanMargin < 0.03`) merge into the prevailing key (consumer-side thresholding).

## Current UI (so you don't re-discover it)

- **Chord card** modes: `build | analyze | live`.
- **Views bar** toggles modules: Push grid / Piano roll / Piano / Bracelet / Tonnetz
  (hiding the grid hides its Layout card).
- **Diagrams:** bracelet (pc clock) + Tonnetz (endless, drag-to-pan). Both clickable
  (set chord root / select / tap), settings-aware labels, **tonic = indigo ring,
  chord root = cream ring, out-of-scale active notes = red**, bracelet edges z-ordered
  over dim / under in-scale nodes.
- **Transport:** load .mid, play/pause, **restart (⇤)**, prev/next onset, loop, seek,
  tempo. **Wheel over the roll pans the view independent of the playhead; click seeks.**
- **Playing notes = bright white** on grid + piano. **Scale-colours toggle** (Labels)
  → neutral "blank" surface.
- **Defaults:** Chromatic + Fixed (C) + scale colours On.
- **"MIDI file key" card:** engine inferred key + Apply + alternatives + fits-these-scales chips.

## Roadmap / open threads

1. **Follow-the-key mode** (the natural next big feature): a toggle that auto-switches
   the app's root+scale to the **current playback segment's local key** as the playhead
   moves. Needs a *segment-key tracker* (distinct from the whole-file key — derive from
   `analysis.keyRegions` at `playback.currentTime`) and a **circle-of-fifths** view
   module to follow key changes.
2. **"Deeper analysis" mode:** opt-in toggle surfacing *everything* the engine returns
   (all key regions incl. low-confidence + margins, all naming alternatives,
   set-class/DFT). Default view stays simplified.
3. **Move more theory onto the bridge:** `catalog_*` (retire `scalesContaining`),
   `voicing_analysis`/`voicing_suggestions` (Build mode), and consume Tonality's coming
   **Representation layer** (keyboard descriptor first; bracelet/Tonnetz descriptor needs
   already filed in `brief-2.md`).
4. **Coalescing:** drop `useCoalescedNotes` once the live path is fully engine-driven
   (Tonality #50 coalesces server-side).

## Workflow conventions & gotchas (learned the hard way)

- **Branch off `main`; keep only ONE open branch touching `App.tsx` at a time.**
  Parallel `App.tsx` PRs caused repeated merge conflicts. **Do not stack PRs** — a
  stacked PR merges into its base branch, not `main` (we had to reconcile `main`
  several times).
- Verify UI through the **Claude_Preview** MCP. After a prop rename, HMR can leave
  **stale console errors** — reload / force a remount before trusting them.
- Commit messages end with `Co-Authored-By: Claude …`; PR bodies end with the
  "Generated with Claude Code" line; PRs target `main`.
- The bridge may be left running in the background — `pkill -f tonality-serve.py` to stop.
