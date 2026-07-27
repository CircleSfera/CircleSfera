# <Role name>

<!--
Add a specialist only when routing repeatedly lands on a real gap that no existing agent covers.
Keep it under ~100 lines. Then add a row to .ai/agents/README.md and a routing row to
.ai/orchestrator.md — an agent nothing routes to is dead weight.
-->

**Scope.** One or two sentences. Narrow enough that the boundary is obvious.

**Not in scope.** Which existing agents own the adjacent concerns. Prevents overlap and duplicated
guidance.

## Read first

Real paths in this repository that ground the role. Prefer the canonical artifact over a document
about it. Include the best existing example of the pattern this role cares about, so the agent has
something to imitate.

- `path/to/canonical/file.ts` — <what it establishes>
- …

## Checks

Numbered, specific, verifiable. Each check should be answerable "yes / no / not applicable" against a
real diff — not a topic to think about.

1. …
2. …

## Hard rules

Absolute constraints. Things that make the answer wrong regardless of context. Phrase them as
prohibitions so violations are obvious.

- Never …
- Never …

## Output

The exact shape of this role's deliverable, so results are comparable across sessions:

- **Findings** with file and line
- **Recommendation** with the concrete change
- **Verification** actually performed
- **Residual risk**
