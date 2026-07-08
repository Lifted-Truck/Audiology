# Ian Ring parity — spec & backlog

> **Status: scoping doc (v0.1, 2026-07-06).** Goal: Audiology should be able to show, for any
> scale / pitch-class set, **every representation and every datum** that Ian Ring's *The Exciting
> Universe of Music Theory* (ianring.com/musictheory/scales) presents. This enumerates them and
> maps each to Audiology's current status, so the parity work has a concrete backlog. Not a
> commitment to build all of it — a map of what "parity" means and where the gaps are.

## Legend

✅ have · ◐ partial · ○ missing · ⚙ needs the engine (a Tonality brief) · ⌫ likely out of scope (12-TET / JI)

The pc-set lab (`components/PcSetLab.tsx`) is the natural home for most of this — it already
covers a good slice. "where" points at the existing surface when we have it.

## A. Representations (the pictures)

| Representation | Audiology | where / note |
|---|---|---|
| Bracelet / necklace (pc clock with the set) | ✅ | Bracelet view + pc-set lab |
| Pitch-class clock (numbered) | ✅ | Bracelet (labels honor the Labels setting) |
| Piano keyboard highlight | ✅ | Piano view |
| Circle of fifths | ✅ | Circle of 5ths view |
| Tonnetz | ✅ | Tonnetz view (engine lattice coords recorded, brief-2) |
| Staff notation | ○ | no staff renderer anywhere — the biggest missing representation |
| Interval spectrum / "spectra" bar charts | ◐ | interval-vector histogram (Chord Anatomy); Ring shows the *spectrum* (the multiset of specific intervals for each generic step) — richer |
| Modes list (rotations, named) | ✅ | pc-set lab "modes" |
| Scale tree / lattice (add/remove-a-note neighbours) | ○ | no navigable set-class lattice |
| Play / audition | ✅ | pc-set lab + Instruments (multi-timbre) |
| Chord/harmony wheels (somatic colour) | ✅ (beyond Ring) | Chord Anatomy — Audiology already exceeds Ring here |

## B. Identity & properties (the data)

| Datum | Audiology | note |
|---|---|---|
| Scale number (12-bit / decimal) | ✅ | pc-set lab `mask` (decimal + binary) |
| Name (canonical) + **alternate names** | ◐ ⚙ | local ~27-scale catalog; full breadth requested in **Tonality brief-20** |
| Prime form / normal order | ✅ | pc-set lab (engine-preferred) |
| Forte number | ○ ⚙ | not computed; engine returns prime form but not the Forte label — a brief |
| Interval vector | ✅ | pc-set lab + Chord Anatomy |
| Transpositional symmetry (rotational) | ✅ | pc-set lab (degree + period) |
| Reflective symmetry (# axes) | ✅ | pc-set lab (inversional axes) |
| Chirality / enantiomorph (achiral?) | ✅ | pc-set lab + Chord Anatomy (chirality sign; enantiomorph = the mirror set) |
| Complement | ✅ | pc-set lab |
| Palindromic | ○ | trivial from the interval pattern; not surfaced |
| Hemitonia / cohemitonia (count of ic1s / adjacent ic1s) | ○ | derivable locally from the set |
| Imperfections (tones lacking a P5 above) | ○ | derivable locally |
| Deep scale property | ○ | derivable (interval vector all-distinct) |
| Myhill's property | ○ | derivable (each generic interval has exactly 2 specific sizes) |
| Maximally even / balanced | ○ | derivable (DFT-based; Audiology already has the DFT) |
| Proper / improper (Rothenberg) | ○ | derivable; more involved |
| Generator / generated | ○ | derivable |
| Distribution spectra (specific intervals per generic step) | ○ | the data behind the "spectra" charts |
| Ratios / JI approximations | ⌫ | 12-TET scope; likely out |

## C. What's genuinely new work vs. already-owned

Most of section B's ○ rows are **local, deterministic derivations** from the pc-set — the same
class of maths already in `lib/theory/pcset.ts` (a handful of small pure functions: hemitonia,
imperfections, deep-scale, Myhill, maximal-evenness via the existing DFT, palindrome). These are
cheap wins and should land in `pcset.ts` with Node tests, surfaced in the pc-set lab.

The rows that need **Tonality** (⚙): the **name catalog** (brief-20, filed) and the **Forte
number** (a follow-up brief — the engine owns set-class identity; the Forte label is a lookup on
prime form). Both are "reference data with one right answer" → engine-owned per Tonality-at-the-core.

The rows that are real **new UI**: **staff notation** (a notation renderer — the single biggest
gap, reusable well beyond scales) and the **scale-tree / set-class lattice** (a navigable
add/remove-a-note graph). The **distribution spectra** are a small chart on mostly-derivable data.

## D. Suggested phasing (when we build toward parity)

1. **Local property pack** — add the derivable properties (hemitonia, imperfections, deep-scale,
   Myhill, maximal-evenness, palindrome, generator) to `pcset.ts` + the pc-set lab. Cheap,
   self-contained, Node-testable. Biggest datum-parity gain per effort.
2. **Names + Forte from the engine** — consume brief-20's name catalog; file the Forte-number
   brief; wire both behind the existing engine/local badge.
3. **Distribution spectra** — the spectra chart in the pc-set lab (small).
4. **Scale-tree / lattice** — a navigable set-class neighbour graph (new view; medium).
5. **Staff notation** — a reusable notation renderer (largest; benefits the whole app, not just
   scales). Possibly its own proposal.

Parity is a direction, not a sprint — this doc is the checklist to burn down against.
