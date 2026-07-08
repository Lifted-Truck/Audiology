# Audiology MCP — design proposal (v0.1)

> **Status: design proposal, 2026-07-06.** The chosen next roadmap thrust. Expose Audiology's
> own capabilities as an **MCP server** other agents/apps can drive — distinct from the Tonality
> bridge, where Audiology is the *consumer*. This scopes the shape before building; v1 is small
> because the capabilities already exist as pure functions.

## The idea, and the boundary

Tonality is the **brain** several projects consume; Audiology is becoming the **face** several
projects could consume. The MCP is that face made callable: analysis + **representation** as a
service. The distinctive value is NOT re-serving music theory (that's Tonality) — it's
Audiology's **presentation/derivation layer**: the somatic colours, the chirality/DFT surfaces,
the pc-set properties, and above all the **renderings** (bracelet, Tonnetz, circle, keyboard,
Chord Anatomy) as portable SVG.

Boundary (mirrors our own consume-from-Tonality rules): the MCP must **not reimplement Tonality's
domain**. Where Tonality is reachable, theory answers proxy to it; where Audiology owns a
*presentation* or *derived* surface, the MCP serves that. Today `lib/theory` carries a
standalone-fallback copy of some theory (documented) — the MCP exposes Audiology's surfaces, and
as "Tonality at the core" lands, the theory underneath shifts to the engine while the
representation layer stays Audiology's.

## Runtime

Audiology is a browser SPA with no backend, but its core is already **pure, React-free TS**
(`lib/theory`, `lib/state`, `geometry`). So the MCP is a **Node process that imports that core**
and exposes tools over stdio (and/or the same loopback-HTTP pattern Tonality's bridge uses, for
parity). No DOM, no React. `package.json` gains an `mcp` entry; the server lives in `src/mcp/`
(pure-core only — enforced like the other `lib/*` no-React invariant).

## Prerequisite / synergy — headless representation renderers

The SVG today lives *inside* React components (`Bracelet.tsx`, `Tonnetz.tsx`, `CircleOfFifths.tsx`,
`ChordAnatomy.tsx`). To render them server-side, extract the **markup/geometry into pure
SVG-string builders** (`lib/render/*`, React-free), and have the components render those. This is
the same "headless surface" move the **surface-library / skinning** direction wants — one
extraction serves both the MCP and the eventual embeddable/skinnable surfaces. Do it once, both
roadmap items benefit.

## Tool surface (proposed)

**Analysis (v1 — the functions already exist in `lib/theory`/`lib/state`):**
- `identify_chord(midis[])` → the `analyzeSelection` tagged union (candidates + inversions).
- `set_class_info(pcs[])` → prime form, normal order, interval vector, mask, transpositional +
  inversional symmetry, complement, chirality, the two somatic colours (Audiology's derived layer).
- `scales_containing(pcs[])` / `scale_names(pcs[])` → catalog matches (local until Tonality's
  brief-20 name catalog lands, then proxied).
- `pcset_properties(pcs[])` → the Ian-Ring-parity property pack (hemitonia, imperfections,
  deep-scale, Myhill, maximal-evenness…) once built (see `ian-ring-parity.md`).

**Representation (v2 — needs the headless-renderer extraction):**
- `render_bracelet(pcs[], opts)` → SVG string. Same for `render_tonnetz`, `render_circle`,
  `render_keyboard`, `render_chord_anatomy`. Representation-as-a-service — the unique capability.

**File / session (v3 — later):**
- `analyze_midi(bytes)` → proxied to Tonality when connected (Audiology already owns the
  bytes→path adapter); Audiology adds its normalized `FileAnalysis` + roll/strip-ready shapes.
- learning-mode progress read/write — only once the education surface (CHROMA) exists.

## The stable internal data model (the "Greater modularity" roadmap item)

The MCP forces a **stable, versioned internal data model** to publish — the normalized shapes
(`SetClassInfo`, `FileAnalysis`, the pc-set property record, the render specs). Define these as
the contract in `lib/` and version them; the MCP is a thin adapter over that model, exactly as
`lib/tonality` is a thin adapter over the engine's. This is the modularity seam the roadmap
already calls for; the MCP is its forcing function.

## Consumers

The external **learning app** (CHROMA and siblings) is consumer #1 — it drives Audiology's
surfaces + exchanges progress. Other agents (including Tonality-side tooling) can call the
analysis/representation tools. Per the surface-library direction, the MCP is how "Audiology as the
face of several projects" becomes real.

## Phasing

1. **v1 — analysis tools over the pure core.** Node MCP server in `src/mcp/`, tools wrapping the
   existing pure functions; no new theory, no renderers. Cheap; validates the runtime + the
   published data model.
2. **v2 — representation-as-SVG.** Extract `lib/render/*` headless builders from the components
   (React components re-consume them — verify pixel-identical), expose `render_*`.
3. **v3 — file/session.** Proxy `analyze_midi`; add progress once CHROMA exists.

## Open questions (to resolve before v1)

- Transport: stdio only, or also the loopback-HTTP bridge (parity with Tonality, browser-reachable)?
- Packaging: standalone `npx audiology-mcp`, or shipped inside the eventual Tauri app?
- Versioning: stamp the published data model like Tonality stamps its schemas (yes, recommended).
