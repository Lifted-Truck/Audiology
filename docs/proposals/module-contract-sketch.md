# Curriculum Module contract — v0 sketch (Audiology side)

> **Status: sketch, not a spec.** A first-pass shape for the plugin seam that lets Audiology
> host interactive education modules (the "modular surface for music education" roadmap item).
> Grounded in **CHROMA** ([`chroma-pitch-training.md`](chroma-pitch-training.md)) — the first
> module — and *deliberately under-generalized*. A contract shaped by one module over-fits;
> the real generalization pass happens when a **second** module (functional ear training)
> tests it (proposal §M6). Treat every interface below as provisional.

## What a "module" is

A **Curriculum Module** is a self-contained bundle that plugs into the Audiology **host** and
drives a training/teaching loop, without adding application code to Audiology's core. The host
supplies the runtime (audio, input, timing, rendering surfaces, telemetry sink, storage); the
module supplies the *pedagogy* (what to present, how to score, when to advance); **Tonality**
supplies the *theory* (see `brief-19-chroma.md`). Three owners, one loop.

```
Tonality (theory) ──catalog + score──▶ Module (pedagogy) ──stimulus/verdict──▶ Host (runtime)
        ▲                                     │                                     │
        └────────────── validation ───────────┘                                     ▼
                                                              surfaces · audio · timing · log
```

## The six declared pieces (proposal §4.2), as provisional TS

Pure, React-free, in `lib/` alongside the theory core so they stay testable. `Pc = 0..11`.

```ts
// 1. Stimulus — what the host must present this trial. JOINT: pitch is engine-validated,
//    render params are the module's, selection is the scheduler's. Never an engine emission.
interface Stimulus {
  id: string;                       // trace id
  pitches: { pc: Pc; octave: number }[];   // engine-validated pitch content
  render: { timbre: string; durationMs: number; masking?: MaskSpec }; // module/host, NOT theory
  deadlineMs: number;               // from the scheduler
  level: number;
}

// 2. Response — the host's input capture (a surface reused from the explorer: the pad grid
//    or piano as a 12-way pc selector). Timing is the host's responsibility.
interface Response {
  stimulusId: string;
  answer: Pc;                       // 12-way forced choice (CHROMA); other modules differ
  rtMs: number;                     // stimulus-onset → keypress, one clock, latency-calibrated
  onsetClock: number;               // ctx.currentTime at scheduled play — the RT reference
}

// 3. Scoring oracle — a PURE function; wraps Tonality's `score` (brief-19 Ask 2). Deterministic,
//    exhaustively test-vectored, CI-blocking. The module never re-implements pitch logic.
type ScoringOracle = (s: Stimulus, r: Response) => Verdict;
interface Verdict {
  correct: boolean;
  errorMagnitude: number;           // semitones, from the engine
  relationship: string;             // per-pair confusion geometry, from the engine
  rtVerdict: "fast" | "slow" | "timeout"; // speed gate (module policy over rtMs vs deadline)
}

// 4. Progression policy — level defs + mastery gates. A DETERMINISTIC oracle decides
//    advancement (proposal P4): no heuristic, and property-tested (no trial sequence that
//    passes a gate may violate its stated criteria).
interface ProgressionPolicy {
  levels: LevelDef[];
  gate: (state: LearnerState, level: number) => "advance" | "hold" | "regress";
}

// 5. Scheduler interface — the adaptive policy. Consumes learner-model signals, emits the next
//    stimulus spec (selection + deadline). Starts rule-based + fully traceable (proposal §6);
//    a Bayesian per-pc knowledge-tracer underneath. Every decision carries a trace.
interface Scheduler {
  next: (state: LearnerState, level: number) => { spec: StimulusSpec; trace: DecisionTrace };
}

// 6. Telemetry schema — every trial record is append-only and self-describing (proposal §7).
interface TrialRecord {
  stimulus: Stimulus;
  response: Response;
  verdict: Verdict;
  decisionTrace: DecisionTrace;     // why this pitch/timbre/octave/deadline
  stateHash: string;                // learner-model state at decision time (replay integrity)
}
```

## The learner model — a pure function over the log

State is **always recomputable from the append-only log**, never a mutable store of record
(proposal §4.1) — this is what makes the whole run replayable and the evals deterministic.

```ts
type LearnerModel = (log: TrialRecord[], baseline: Baseline) => LearnerState;
// LearnerState: per-pc mastery + RT distribution, anchoring index (behavioural, ours),
// fatigue/consolidation curves, WM-conditioned pacing. Fed to Scheduler + ProgressionPolicy.
```

## The host seam (Audiology core)

The host is module-agnostic. It:
1. loads a module bundle satisfying this contract (validates the schemas);
2. runs the trial loop — `Scheduler.next` → assemble `Stimulus` (engine-validate the pitch) →
   render via the **audio subsystem** → capture `Response` with calibrated timing → `ScoringOracle`
   → append `TrialRecord` → recompute `LearnerState` → `ProgressionPolicy.gate`;
3. persists the log to a **telemetry sink** (local for Phase A; a real ingress for a cohort — a
   natural job for the future Audiology MCP);
4. reuses existing surfaces for I/O (grid/piano as the pc selector; the analysis views as
   worked-example surfaces for course modules).

Modules are bundles, **not** application code — future modules (functional ear training,
interval quality, chord ID, voice-leading) are new bundles against this contract.

## Two build items this surfaces (not obvious from the proposal)

- **Audio subsystem.** Today Audiology has one oscillator-based synth (`audio/synth.ts`). Modules
  need multiple distinct **timbres** (incl. held-out for transfer tests), masking, and
  millisecond-accurate scheduled onset. This is the largest new build and it's shared
  infrastructure, not CHROMA-specific.
- **Telemetry sink / storage.** Emission is easy; the *sink* isn't. Phase A (n=1) is local;
  a Phase B cohort needs collection + per-learner identity/consent — real plumbing the app (a
  standalone frontend today) doesn't have yet.

## Explicitly deferred

Do not finalize this contract for CHROMA alone. Lock it only after functional ear training (a
*relative*-pitch module — the opposite training regime) has exercised the seam; the differences
between the two are what tell you which fields are truly general vs CHROMA-specific.
