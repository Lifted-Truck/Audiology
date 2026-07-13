# Audiology — integration spec (for projects that consume Audiology)

> The authoritative spec of what Audiology exposes and how to consume it. If you're
> building a project **on top of** Audiology (the music-education / ear-training app is
> consumer #1), read this first, then file a brief in `integrations/<yourproject>/`.
>
> This is the **provider** side of the same protocol Audiology runs as a **consumer**
> of Tonality — self-similar by design (canonical policy: the autonomous repo's
> `INTEGRATIONS.md`). Tonality is the *brain* several projects consume; Audiology is
> the *face* several projects can consume: analysis + representation + audio.

## 1. What Audiology exposes today

| Capability | Surface | Status |
|---|---|---|
| **Analysis** — chord ID, set-class identity (incl. the somatic colours + chirality, our derivation layer), catalog scale/chord matches | MCP tools + HTTP API | ✅ **v1 shipped** |
| **Pure theory core** (`lib/theory`, `geometry`, `lib/score`) | importable source (React-free) | ✅ stable, Node-tested |
| **Representation** — bracelet / Tonnetz / circle / score / anatomy as portable SVG | `render_*` MCP tools | ○ **v2** (needs headless-renderer extraction) |
| **Audio** — multi-timbre stimulus rendering | shared audio-spec (params) | ○ **v3** (`AudioContext` can't cross a process boundary — you render locally from a spec) |
| **Session** — learning progress read/write | MCP tools | ○ **v3** (once the education surface exists) |

**Design around what's shipped; make gaps visible.** A missing capability is not a
blocker — file a brief for it, and consume the visibly-minimal placeholder meanwhile.

## 2. Transports — one tool registry, two doors

Both serve the identical versioned tool registry (`src/mcp/tools.ts`). Full detail:
[`docs/MCP.md`](docs/MCP.md).

- **HTTP API** (`npm run api` → `http://127.0.0.1:8013`) — the direct path for apps.
  `GET /` (probe) · `GET /tools` (discovery) · `POST /call/<tool>` → `{ ok, ... }`.
  Mirrors Tonality's bridge conventions exactly, so a consumer's boundary module looks
  the same as ours does for Tonality. CORS: loopback web origins at any port allowed
  (echoed specifically), no-Origin callers pass, foreign origins 403'd.
- **MCP** (`npm run mcp` → stdio JSON-RPC) — for agent hosts (Claude Desktop, etc.).

Every result is wrapped `{ audiology_mcp_version, tool, result }`. **Pin
`audiology_mcp_version`** (currently `0.1.0`) — it bumps on any tool-shape change (a
change is caught by `tests/mcp-tools.test.ts` in our CI).

### v1 tools
- `identify_chord({ midis })` → ranked candidates (name / inversion / bass) + voicing.
- `set_class_info({ pcs })` → prime form, normal order, interval vector, mask, symmetry
  (transpositional + inversional), chirality, `|f5|` consonance, complement, and the two
  somatic colours.
- `scales_containing({ pcs })` → catalog exact / contained-by matches (Push-3 flagged) + modes.

## 3. The boundary rules (consuming Audiology)

The same eight rules Audiology follows consuming Tonality — applied to you consuming us:

1. **One boundary module per consumer.** A single seam file knows Audiology's wire
   format (the HTTP/MCP envelope); everything downstream consumes your normalized types.
2. **Consume-when-connected, degrade visibly.** Prefer Audiology's answer when it's up;
   fall back locally behind the same API; always surface which source answered.
3. **Don't reimplement Audiology's domain.** Rendering, the somatic-colour/chirality
   derivations, and the interactive surfaces stay here. Trivial documented fallbacks only.
4. **Pin the version.** Pin `audiology_mcp_version`; a shape change is a coordinated bump.
5. **Design around shipped capabilities; file intake briefs for gaps** (§1), ship a
   visibly-minimal placeholder that documents the swap-in point.
6. **Real-time paths call nothing over the wire.** Freeze results into a contract artifact
   or call from UI/offline threads.
7. **Consume plural outputs** — keep ranked candidates / ambiguity flags where we return them.
8. **Canonical numeric identity at the boundary, presentation at the edge.** We return pcs /
   MIDI / prime form; you render names, spelling, labels, language.

## 4. You'll consume two engines

A consumer app (the education tool) consumes **Tonality** for the theory/scoring (key
induction, the pitch/chord scorers, the name catalog) and **Audiology** for
surfaces/audio/analysis. Each gets its own boundary module and its own integration
channel. Where a capability could come from either, the rule is: **theory → Tonality,
representation/interaction/audio → Audiology.**

## 5. Intake channel + how to file

Exchanges are **files**, one directory per consumer under `integrations/<project>/`
(see [`integrations/README.md`](integrations/README.md) for the ball-state protocol and
the brief template). Rule zero: **writes stay home** — Audiology's residents implement
Audiology changes; you file a brief, we respond and ship, both sides bump in linked PRs
citing the brief id. Your `integrations/<project>/` directory is your designated write
slot in our tree (the mailbox exception) and nowhere else.

**To start consuming Audiology:** stand up your boundary module against the HTTP API (§2,
live today), and file `brief-1` in your channel for what you need next (render export,
audio-spec, session). You are never blocked waiting — you design against this contract.
