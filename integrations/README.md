# Audiology integration channel

Intake for projects that consume Audiology (see [`../INTEGRATION.md`](../INTEGRATION.md)
for what's exposed). One directory per consumer: `integrations/<project>/`. Same
protocol Audiology runs as Tonality's consumer — canonical policy in the autonomous
repo's `INTEGRATIONS.md`.

## Exchanges are files, and the ball is always on exactly one side

Exchange files carry frontmatter — `id`, `status`, `ball`, `respond-by` — and move
through a state machine where at no point do both (or neither) sides own the next move:

| State | Artifact (in `integrations/<project>/`) | Ball |
|---|---|---|
| Brief filed | `brief-N.md` — need + proposed interface delta + contract tests offered + `respond-by` | **Audiology** |
| Response | `response-N.md` — accept / counter-design / defer-with-rationale | **consumer** (ratify or refine) |
| Implementation | Audiology-side PR(s), `audiology_mcp_version` bump, tag | **Audiology** |
| Notice | `notice-*.md` — shipped version + migration notes | **consumer** (integrate, bump the pin, verify) |
| Closed | consumer confirms green; both roadmaps updated | — |

## Rules

- **Writes stay home.** Only Audiology's residents commit Audiology changes (they run the
  local harness — CLAUDE.md, hooks, the CI gate). A consumer files a brief; we implement.
- **The mailbox exception.** A consumer's residents may write **only** in their own
  `integrations/<project>/` slot (filing briefs, ratifying responses) — across a remote,
  that's a PR touching only that path.
- **Cross-repo change = two linked PRs**, never one: Audiology lands first (implements +
  bumps `audiology_mcp_version` + files the notice); the consumer lands second (bumps its
  pin, adapts its boundary module). Both cite the brief id — the audit trail is bidirectional.
- **Consumer-driven contract tests cross as proposals.** Propose the tool-shape tests you
  rely on in your brief; we land them into our CI (`tests/mcp-tools.test.ts`), so breaking
  your expectation fails *our* build — coordination without conversation.
- **Decisions don't live here.** This records exchanges; what was decided is folded into
  Audiology's ROADMAP/README (and yours) in the same change.

Brief template: [`_template/brief.md`](_template/brief.md).
