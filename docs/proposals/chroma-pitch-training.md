# Proposal: CHROMA — A Rigorous Pitch-Class Training Module for Audiology

> **⚠ REVIEWED & INTEGRATED — 2026-06-30. Do not re-triage or re-run the review/scoping
> pass; the follow-through already exists.** This proposal (a v0.1 design draft, *not yet
> implemented*) was reviewed from the Audiology-surface + Tonality-boundary angle and its
> recommendations were executed:
> - **Tonality engine surface** scoped and handed off → `brief-19-chroma.md` in the Tonality
>   integration channel (`integrations/audiology/`) — the shared pc/interval catalog contract,
>   a deterministic pitch-answer `score`, and confusion-structure classification. Theory only;
>   timbre / audio / scheduling / telemetry stay on the Audiology side.
> - **Curriculum Module contract** sketched (Audiology side) →
>   [`module-contract-sketch.md`](module-contract-sketch.md).
> - **Roadmap**: recorded in the README as the first module of the "modular surface for music
>   education" item, with the two non-obvious build items flagged (a multi-timbre **audio
>   subsystem** beyond today's single synth, and a **telemetry sink** for cohort studies).
>
> If you're an agent picking this up: the design review is done — the open work is *building*
> the module against the contract sketch, not re-deciding the approach. Boundary note: the
> stimulus record is a **joint** contract (Tonality owns pitch arithmetic; timbre/rendering
> and adaptive selection are Audiology's) — not an engine emission.

**Status:** Draft v0.1 · **Engine:** Tonality · **Surface:** Audiology (TypeScript/React) · **Scope:** First curriculum module of a modular music-education architecture

---

## 1. Purpose and Positioning

Audiology currently serves as Tonality's GUI and MIDI-analysis surface. This proposal extends it into a **modular education surface**: a host application that loads curriculum modules through a defined contract, with Tonality as the single source of theoretical truth for stimulus generation, answer validation, and analysis. The first module, working name **CHROMA**, is an absolute-pitch (pitch-class) training program built directly on the strongest available evidence — primarily Wong, Cheung, Ngan & Wong (2025, *Psychonomic Bulletin & Review*, doi:10.3758/s13423-024-02620-2) — with an adaptive learner-model layer that personalizes the protocol from observed behavioral signals rather than from self-reported preference.

Two design commitments frame everything below. First, *reduce, never invent*: the module trains what the evidence says is trainable (pitch-class identification under time pressure, generalizing across timbre and octave) and makes no claims beyond it. Second, *text as truth*: curriculum definitions, learner state, and session logs are all diffable, versioned artifacts with full decision traces — the same discipline as `wend` and ATTEST.

## 2. Evidence Base

### 2.1 What the research establishes

**Wong et al. (2025)** is the methodological anchor. Twelve adult musicians completed an eight-week online program (~21.4 hours, 15,327 trials). The protocol: hear one tone, name its pitch class within a deadline, receive immediate corrective feedback. Pitches were introduced gradually; response deadlines tightened progressively; poorly-identified pitches were adaptively reintroduced; the final level had to be passed multiple times to rule out lucky streaks. Outcome: participants named ~7 pitch classes at ≥90% accuracy within ~2 seconds on average (128% accuracy gain, 43% error-magnitude reduction), and two of twelve reached fast, accurate performance on all 12 pitch classes — comparable to naturally occurring AP. Critically, training on one timbre (piano or guitar) **transferred to the untrained timbre**, indicating genuine chroma abstraction rather than sound-label memorization.

**Nusbaum and colleagues (UChicago)** demonstrated earlier that adult AP training produces gains lasting months without pharmacological intervention, and that **auditory working memory predicts training success**. This gives us a principled baseline assessment and a candidate moderator for the adaptive layer.

**Design implications the literature converges on:** train pitch *class* (chroma), not pitch height; suppress relative-pitch strategies, since interval computation from a remembered anchor masquerades as AP and blocks the target representation; enforce speed, because deadlines force absolute retrieval over mental computation; randomize octave and vary timbre to drive abstraction; use adaptive item scheduling weighted toward weak pitches; and gate progression on repeated mastery, not single-pass thresholds.

### 2.2 What prior systems got right and wrong

**Burge's Perfect Pitch SuperCourse** (1980s–present) centers on attending to each note's phenomenal quality ("pitch color"). Never rigorously validated, but the core intuition — directing attention to the *absolute* perceptual attribute rather than relational structure — is consistent with what the Wong protocol operationalizes mechanically. We treat phenomenological anchoring as an optional, testable scaffold, not a foundation.

**Eguchi's Chord Identification Method** produces high AP rates in young children via chord-color association but has no adult evidence and depends on critical-period plasticity we cannot assume.

**Functional ear training** (scale-degree identification within a tonal context, à la Benbassat) is effective for what it trains — *relative* pitch — and is therefore precisely what CHROMA must design *against* during AP acquisition. It remains an excellent candidate for a sibling module later; the modular architecture should hold both without letting one contaminate the other's training regime.

**Interval-drill apps** (EarMaster, Tonedear, etc.) demonstrate mature engagement patterns (streaks, spaced sessions, progress visualization) but train relative pitch and lack anti-anchoring design, mastery gates, and telemetry depth. They are the competitive baseline to exceed, not a model to copy.

## 3. Design Principles

**P1 — Chroma is the target representation.** Every trial asks for pitch class. Octave is randomized within trials from the earliest feasible level so that height never becomes a usable cue.

**P2 — Actively suppress relative-pitch leakage.** Inter-trial intervals are randomized; trials are separated by brief interference (silence of variable length, or masking noise at later levels); consecutive-trial pitch relationships are scheduled to be uninformative; no reference tone is ever available. Beyond prevention, we *detect* leakage statistically (see §6): if a learner's error distribution correlates with the previous trial's pitch, they are anchoring, and the scheduler responds by increasing interference and inter-trial entropy.

**P3 — Speed forces absolute retrieval.** Response deadlines tighten per level, following Wong. Accuracy without speed is treated as a different (weaker) skill and does not pass mastery gates.

**P4 — Mastery gates, repeatedly verified.** Level advancement requires passing criteria multiple times across separate sessions. A deterministic oracle, not a heuristic, decides advancement.

**P5 — Timbre and octave as generalization axes.** Begin with one timbre for encoding stability; introduce a second timbre mid-program; test transfer on held-out timbres never used in training. Transfer performance is the primary success metric because it distinguishes chroma abstraction from memorization.

**P6 — Distributed practice.** Sessions of 20–30 minutes, ideally daily, capped to prevent massed-practice inflation of within-session performance that fails to consolidate. The scheduler treats sleep-separated sessions as the unit of consolidation.

**P7 — Every adaptive decision is traced.** The scheduler emits a decision record for each trial: why this pitch, this timbre, this octave, this deadline. Session logs are append-only. A training run is reconstructible and auditable end to end, exactly as a `wend` composition is.

## 4. Architecture: Audiology as Modular Education Surface

### 4.1 Separation of concerns

**Tonality (engine, Python, MCP):** stimulus specification and validation (exact pitch-class arithmetic), answer scoring, error-magnitude computation in semitone space, confusion-structure analysis, and any theory-dependent reasoning. Tonality remains the single source of theoretical truth; Audiology must not re-implement pitch logic. This module is the forcing function to complete the shared JSON catalog contract already planned to resolve the Audiology/Tonality divergence.

**Audiology (surface, TypeScript/React):** module host, trial presentation, audio rendering, input capture with millisecond-accurate response timing, telemetry emission, and progress visualization. Audio synthesis/playback happens client-side (Web Audio API rendering from sampled instruments or synthesized timbres), but *what* to play is always specified by an engine-issued stimulus record.

**Learner model (new component):** consumes the append-only session log, maintains per-learner state (per-pitch-class mastery estimates, RT distributions, anchoring index, working-memory baseline, fatigue curve), and feeds the scheduler. Implemented as a pure function over the log — state is always recomputable from history, never a mutable store of record.

### 4.2 The Curriculum Module contract

A module is a versioned, diffable JSON/text bundle declaring: a **stimulus schema** (what the engine must generate — for CHROMA: pitch class, octave range, timbre, duration, level), a **response schema** (12-way forced choice with timestamp), a **scoring oracle** (deterministic function from stimulus+response to correctness, error magnitude, and RT verdict), a **progression policy** (level definitions, mastery criteria, gate rules), a **scheduler interface** (the adaptive policy the module plugs in), and a **telemetry schema** (what every trial record must contain). Audiology hosts any module satisfying the contract; future modules (functional ear training, interval quality, chord identification, voice-leading hearing) are additional bundles, not additional application code. Module definitions live in-repo; ROADMAP.md-style single-source-of-truth discipline applies.

## 5. The CHROMA Protocol

### 5.1 Baseline battery (Week 0)

Before training: a pitch-naming pretest across all 12 classes and 3+ timbres (no feedback) to detect pre-existing partial AP; an auditory working-memory assessment (tone-sequence span) per Nusbaum's moderator finding; and a relative-pitch skill inventory. These calibrate the learner model's priors and provide the pre/post comparison anchor.

### 5.2 Level structure (adapted from Wong et al.)

Training begins with 2–3 maximally-separated pitch classes on a single timbre with a generous deadline (~4s). Each level adds pitches, tightens the deadline toward ~1.5–2s, and widens octave randomization. Mid-program (around the 6–7 pitch mark), the second timbre enters, interleaved. Poorly-identified pitches are adaptively reintroduced with elevated frequency. The final level — all 12 classes, both timbres, full octave range, tight deadline — must be passed on multiple separate days. Target dosage mirrors the evidence: ~20–25 hours across 8 weeks, in 20–30 minute sessions.

Per-trial loop: stimulus plays once → learner selects a pitch class → immediate corrective feedback (correct answer shown and optionally replayed) → variable inter-trial interval with interference at higher levels. One tone at a time, exactly as in the validated protocol.

### 5.3 Optional phenomenological scaffold (A/B-able)

An opt-in encoding prompt in early levels: after feedback, the learner privately tags each pitch class with a freeform quality descriptor (Burge's "color" intuition, operationalized). The hypothesis is that self-generated absolute anchors accelerate encoding. Because evidence is weak, this ships as an experiment flag with its effect measured, never as a default claim.

## 6. The Adaptive Layer: Emergent Signals, Not Learning Styles

A candid note first, in the spirit of the house maxim: the "learning styles" construct (visual/auditory/kinesthetic matching) has repeatedly failed empirical test, and building an adaptation layer on self-reported style would be building on sand. What *is* defensible — and more interesting — is adaptation to **emergent behavioral signals**: structure the model can actually observe in the learner's trial stream. Concretely:

**Confusion topology.** The per-learner pitch-class confusion matrix, computed by Tonality in semitone space. Adjacent-semitone confusion (C/C#) implies a resolution problem → scheduler responds with contrastive minimal-pair drills. Fifth/fourth confusion implies relative-pitch contamination → respond with interference escalation. Confusion structure is the closest thing to a real "learning style" signature this domain offers, and it differs meaningfully between learners.

**Anchoring index.** A running statistic testing whether errors are conditionally dependent on the previous trial's pitch. High anchoring → the learner is computing intervals, not retrieving chroma → increase inter-trial entropy, lengthen/randomize gaps, insert masking. This is the module's drift detector: the failure mode isn't wrong answers, it's right answers produced by the wrong mechanism.

**RT distribution shape.** Bimodal RTs suggest dual strategies (fast retrieval on known pitches, slow computation on others); the scheduler can target the slow-mode pitches specifically. RT floor per pitch class is also the best available proxy for automaticity.

**Consolidation and fatigue curves.** Within-session decay points set session length per learner; across-session retention after sleep gates advancement (a level passed only within-session hasn't been learned).

**Working-memory-conditioned pacing.** Lower baseline auditory WM predicts slower acquisition (Nusbaum); the scheduler adjusts introduction rate rather than letting low-WM learners churn against a fixed curve.

The scheduler consuming these signals can start as a transparent rule-based policy (deterministic, fully traceable) with a Bayesian knowledge-tracing model per pitch class underneath. Resist any temptation toward an opaque learned policy in v1 — decision traceability is a feature of the product, not just of its development.

## 7. Telemetry, Oracle, and Eval Discipline

The ATTEST patterns port directly. **Layer-0 (deterministic, CI-blocking):** the scoring oracle is a pure function with exhaustive test vectors from Tonality; scheduler decisions replay deterministically from a seed + log prefix; the mastery-gate evaluator is property-tested (no sequence of trials passing a gate may violate its stated criteria). **Layer-E (end-to-end):** simulated learners with known parameters (a "true AP" agent, a "pure relative pitch + anchor" agent, a "guesser") run through the full protocol; the system must correctly promote the first, flag the second's anchoring, and never promote the third. The relative-pitch simulant is the critical adversarial eval — if the protocol can be passed by interval computation, the protocol is wrong.

Every trial record carries: stimulus spec, response, RT, scheduler decision trace, learner-model state hash. Logs are append-only. Aggregate metrics: per-pitch accuracy, semitone error magnitude, RT, d′, transfer gap (trained vs. held-out timbre), anchoring index over time.

## 8. Validation Plan

**Phase A (n=1):** you, self-administered, full protocol, ~8 weeks. Purpose: instrument shakedown and honest signal on the anchoring detector (as a trained musician with strong relative pitch, you are the ideal adversarial subject). **Phase B (small cohort):** 5–10 musician volunteers, pre/post battery with held-out-timbre transfer test and 1- and 3-month retention follow-ups. **Success criteria, stated in advance:** ≥6 pitch classes at ≥90% within 2s on the trained set (matching Wong's mean), positive transfer to an untrained timbre, retention at 1 month, and — the internal-validity criterion — anchoring index near zero at completion. Publish the protocol and results regardless of outcome; a rigorous null on a consumer-grade implementation is itself a contribution and a credibility asset for the consultancy.

## 9. Risks and Open Questions

Honest unknowns: Wong's n=12 with self-selected motivated musicians may not generalize to Audiology's eventual audience; only 2 of 12 reached full 12-class AP, so marketing must promise "trainable pitch-class identification," not "perfect pitch"; retention beyond months is unestablished; and it remains open whether trained AP reaches the effortless, unsuppressible quality of developmental AP or stays an effortful skill. The product should measure and say so rather than blur the distinction. Also open: whether microtonal/12-TET boundary handling matters for learners working outside equal temperament (Tonality is 12-TET by design — a scoping decision to state explicitly).

## 10. Roadmap

**M1:** Curriculum Module contract + shared Tonality/Audiology JSON catalog. **M2:** CHROMA stimulus/scoring path through Tonality MCP, deterministic oracle + Layer-0 evals. **M3:** Trial loop UI, telemetry, append-only log. **M4:** Rule-based adaptive scheduler + anchoring detector, simulated-learner Layer-E evals. **M5:** Phase A self-study. **M6:** Learner-model refinements from Phase A, then Phase B cohort. Sibling modules (functional ear training, chord quality) follow only after the contract survives contact with a second module's requirements.

---

*Primary sources: Wong, Y.K., Cheung, L.Y.T., Ngan, V.S.H., & Wong, A.C.-N. (2025). Learning fast and accurate absolute pitch judgment in adulthood. Psychonomic Bulletin & Review. — Van Hedger, S.C., Heald, S.L.M., Koch, R., & Nusbaum, H.C., UChicago absolute pitch training program (auditory working memory as predictor; durability over months).*
