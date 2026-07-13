---
id: <project>-brief-<N>
status: open            # open | responded | implementing | shipped | closed
ball: audiology        # audiology | consumer
respond-by: YYYY-MM-DD
audiology_mcp_version: 0.1.0   # the contract version you're building against
---

# <PROJECT> → Audiology: brief-<N> (<one-line title>)

## Need

<What you're building and why this capability is on the critical path. Concrete.>

## Proposed interface delta

<The tool / field / render output you want, as a shape. E.g. a new `render_bracelet`
tool returning an SVG string with these options; or a field added to `set_class_info`.
Cite where it fits (§ of INTEGRATION.md).>

## Contract tests offered

<The tool-shape assertions you rely on, executable — "I depend on X" made testable.
Audiology's residents land these into CI (`tests/mcp-tools.test.ts`), so a future change
that breaks your expectation fails Audiology's build. This is the load-bearing part.>

## Disposition / urgency

<Build request, or a scoping handshake? What unblocks meanwhile (your visible placeholder)?>

— <Project>
