# Audiology as a plugin — design proposal (v0.1)

> **Status: design proposal, 2026-08-09.** Scopes an **Audiology VST3/AU plugin** that brings the
> app's visuals + analysis to a live DAW signal (Ableton Live first). Written after the form-factor
> question was settled empirically (see [Form factor](#form-factor-resolved)); the build itself is
> unstarted and would live in a **sibling repo**, not here. This document is the shape, the
> sequencing, and the traps — not a commitment to a date.

## The idea

Audiology today analyses a *loaded MIDI file*. The plugin analyses **whatever is playing**: drop it
on a track in Live and get the same surfaces — piano roll, bracelet, Tonnetz, circle of fifths,
Chord Anatomy, Interpretations — driven by the live signal, with the host's own tempo and transport.

The strategic point is that this is mostly **assembly, not invention**. Audiology has spent its
architecture budget on exactly the seams a plugin needs: a pure React-free core, headless
renderers, and a versioned tool contract already served over two transports. The plugin is a third
transport.

## Form factor (resolved)

**An audio effect that declares a MIDI/event input** — *not* a silent instrument.

The reasoning went through three positions, and the last one is right:

1. *Silent instrument.* Live's manual says third-party plugins are instruments or audio effects
   only ("MIDI effects … can only be placed in MIDI tracks" refers to Live's own built-ins), and
   instruments are the device type that receives MIDI on a MIDI track. This works but costs the
   track's instrument slot and forces an Instrument Rack with parallel chains, or a dedicated track.
2. *Audio effect fed MIDI via sidechain.* **Does not work.** Live's sidechain carries **audio**:
   the choosers select "Live's internal routing points" and "the sidechain audio is only a trigger
   for the device and is never actually heard." (Live's own **Roar** takes a MIDI sidechain, but
   that is a built-in with privileged integration, not a path exposed to plugins.)
3. **Audio effect with a MIDI input bus.** ✅ Confirmed by direct use: commercially shipping
   audio-effect plugins receive MIDI in Live for scale quantization. This is the standard
   `MusicEffect` class of plugin.

### What that means concretely

```cmake
juce_add_plugin(Audiology
    IS_SYNTH        FALSE   # an audio effect, not an instrument
    NEEDS_MIDI_INPUT TRUE   # declares the event input bus
    IS_MIDI_EFFECT  FALSE   # audio still passes through untouched
    FORMATS         VST3 AU
    ...)
```

- **AU type is `aumf`** (`kAudioUnitType_MusicEffect` — an audio effect that receives MIDI), *not*
  `aumu`. Validation is therefore `auval -v aumf <PluginCode> <MfrCode>`.
- Placement: anywhere in a chain, like a meter. It consumes no instrument slot and needs no rack.
- Live constraint that still applies: on a MIDI track an audio effect must sit **after** an
  instrument. In practice that is fine (you are analysing a track that is sounding). The only
  uncovered case is a MIDI track with *no* instrument — if that ever matters, an instrument variant
  is a second target from the same codebase. **Do not build it speculatively.**

## Architecture

Three layers, with one hard rule: **no analysis on the audio thread.**

```
┌─ audio thread ────────────────────────────────────────────┐
│ processBlock(buffer, midiMessages)                        │
│   • copy MIDI events + timestamps → lock-free SPSC FIFO   │
│   • read AudioPlayHead::PositionInfo (bpm, ppq, sig, play)│
│   • pass audio through untouched                          │
│   NO allocation · NO locks · NO analysis                  │
└───────────────────────┬───────────────────────────────────┘
                        │  juce::AbstractFifo
┌───────────────────────▼───────────────────────────────────┐
│ worker thread                                             │
│   • drain FIFO → rolling note window                      │
│   • analyse at ~10–30 Hz or on chord change               │
│   • Tonality C++ core when available, TS core until then  │
│   • emit {audiology_mcp_version, tool, result} JSON       │
└───────────────────────┬───────────────────────────────────┘
                        │  native → JS bridge
┌───────────────────────▼───────────────────────────────────┐
│ WebView UI — the existing React app, bundled              │
│   consumes the SAME envelope it already consumes over     │
│   stdio-MCP and loopback-HTTP                             │
└───────────────────────────────────────────────────────────┘
```

### The reuse that makes this cheap

`src/mcp/tools.ts` already publishes a **versioned tool contract**
(`{audiology_mcp_version, tool, result}`, `MCP_MODEL_VERSION`) over **two** transports — stdio MCP
(`src/mcp/server.ts`) and loopback HTTP (`src/mcp/http.ts`). The plugin adds a **third**: the C++
worker emits the same envelope across the JS bridge. The React UI needs no new consumption path,
and the contract test (`tests/mcp-tools.test.ts`) already guards it against drift.

This is the payoff for the headless-renderer extraction (`src/lib/render/*`) and the React-free
core discipline — both were built toward "surface library", and this is what that was for.

### UI: WebView, not native graphics

JUCE 8 supports WebView-based plugin UIs with a native↔JS bridge and a resource provider for
serving a bundled SPA. *Confidence note: this is from general knowledge — **verify the exact API
surface and platform support before committing**, as it is load-bearing for the whole design.*

The alternative — reimplementing Bracelet / Tonnetz / roll / Score / Chord Anatomy in native JUCE
graphics — discards every surface already built and is not seriously on the table.

## What exists vs. what is new

| Already built | New work |
|---|---|
| Pure, React-free theory core (`lib/theory`, `lib/state`) | JUCE plugin shell + CMake |
| Headless SVG renderers (`lib/render/*`) | Lock-free MIDI FIFO |
| Versioned tool envelope, 2 transports | WebView host + JS bridge |
| Patch format (small, versioned JSON) | Plugin state ser/de |
| Interpretations / anatomy / roll surfaces | C++ ↔ JSON marshalling |

## Dependency: the Tonality C++ core

Tonality's C++ port is **greenlit** (`CPP_PORT.md`, 2026-07-03) — dual-implementation and
golden-anchored, with the Python repo's `tests/golden/conformance.json` as a mechanical acceptance
gate. As of this writing `port/` contains only `PORT.md` and `pin.json`; **no code yet**.

More important for us: **Slice 1 is the identity layer** (mask ops, normal order, Rahn prime form,
interval vector, DFT, Z-relation, symmetry) — *not* key/chord induction, which is what a realtime
analyser actually needs.

**Therefore the plugin must not block on the port.** Ship v1 with **Audiology's existing TypeScript
core running inside the WebView** — it is already pure and standalone, and gives chord naming,
set-class identity, and scale detection with no native dependency. Swap in Tonality C++ per slice
as it lands, using the same **prefer-engine / fall-back-local** pattern already proven with the
HTTP bridge (`useEngineFacts`). The plugin does not wait on the port; the port does not wait on the
plugin.

A realtime consumer is also useful *pressure* on the port: it is the first consumer whose latency
budget is measured in milliseconds, and it will reveal whether the slice ordering is right.

## Sequencing

1. **Skeleton** — JUCE/CMake audio effect, `NEEDS_MIDI_INPUT`, audio passthrough, `auval -v aumf`
   clean, loads in Live. Confirm MIDI arrives (log events) in the real host.
2. **FIFO + host clock** — MIDI to the worker thread; bpm/ppq/time-signature from `AudioPlayHead`.
   Prove zero audio-thread work under a profiler.
3. **WebView + bundled SPA** — the existing app rendering inside the plugin, one surface first
   (piano roll or bracelet).
4. **Bridge the envelope** — worker emits `{audiology_mcp_version, tool, result}`; UI consumes it
   through its existing path.
5. **Tonality C++** per slice, TS core as the fallback.

## Consequence for the roadmap

This **subsumes the "Ableton MIDI bridge + tempo sync"** item from the three-feature batch. Inside a
plugin the host clock is free (`AudioPlayHead::PositionInfo`) — no bridge process, no clock drift,
no separate sync problem. That item should be dropped rather than built twice.

## Build traps (macOS, this toolchain)

Hard-won and non-obvious; all of these have bitten before:

- **CMake with `-G "Unix Makefiles"`.** Command Line Tools only — no full Xcode, no Ninja.
  Single-config, so separate build dirs for Debug and Release.
- **Always pass an absolute build path.** A relative `cmake --build build` from an agent shell can
  silently build nothing and exit 0.
- **Re-`codesign` after every build.** JUCE regenerates `Contents/Resources/moduleinfo.json`
  *after* ad-hoc signing, breaking the seal — and a broken seal makes the DAW **silently skip the
  plugin with no log entry at all**. Best as a CMake `POST_BUILD` step; verify installed copies with
  `codesign --verify --deep`.
- **Keep plugin state small.** Large `getStateInformation` chunks make hosts silently fail to save
  state. The **patch** (small JSON) is the right thing to embed; a **bundle** (patch + MIDI) must be
  a path reference into an app-support folder, never embedded base64.
- **Perf-test in Release only.** Debug is `-O0`; ceilings measured there are meaningless.
- Diagnosing a no-show in Live: check `~/Library/Preferences/Ableton/Live <ver>/Log.txt`. *No entry
  at all* usually means the codesign seal, not a code fault.

## Repo boundary

The plugin lives in a **sibling repo**, making it a consumer of two providers:

- **Audiology** — surfaces + the tool envelope. Audiology is already a published provider
  ([`INTEGRATION.md`](../../INTEGRATION.md) + the `integrations/` intake channel), so the plugin
  files briefs there like any other consumer.
- **Tonality** — the C++ core, via its own channel.

Writes stay home: the plugin repo does not edit Audiology or Tonality sources; it consumes the
published contracts and files briefs when they fall short. The versioned envelope is what makes
this safe — a shape change means `MCP_MODEL_VERSION` bumps and the plugin knows.

## Decisions needed before the build starts

1. **Licensing.** JUCE (GPL vs. commercial tiers) and the VST3 SDK (GPLv3 vs. Steinberg license)
   both interact with Audiology's **PolyForm-Noncommercial** license. *Terms not verified here* —
   this needs a real read before code is written, because it is expensive to discover late.
2. **Verify the JUCE 8 WebView API** for the target platforms (see the confidence note above).
3. **Scope of v1 surfaces** — which of the existing views ship first. Recommend the piano roll +
   Interpretations, since they show the most value per pixel on a live signal.
4. **Audio-input analysis** — out of scope for v1 (polyphonic pitch detection is a different, much
   harder problem). The audio-effect form factor leaves the door open without committing.
