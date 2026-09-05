# Audit

Architecture audit, transversal drift detection, and multi-domain review. Invoke with `/audit`.

## Steps

1. Load the standing context before anything else:
   - @/AGENTS.md
   - @/.ai/core/sources-of-truth.md
   - @/.ai/core/principles.md
   - @/.ai/core/architecture.md
   - @/.ai/core/known-gaps.md
2. Follow this playbook step by step, without skipping phases:
   - @/.ai/playbooks/audit.md
3. Consult these specialists in order, adopting the checks and hard rules of each for the part of
   the work it owns: auditor → staff-architect → security. Role definitions:
   - @/.ai/agents/README.md
   - @/.ai/agents/auditor.md
4. At the decide phase, flag anything on the `AGENTS.md` confirmation list — schema, public API
   contracts, auth, permissions, monetization, deletions, critical business logic, new dependencies,
   infrastructure, secrets, destructive data operations — and **wait** for confirmation.
5. Verify with the commands in @/.ai/core/quality.md and report real output. Never assert a check
   you did not run.
6. Close with:
   - @/.ai/checklists/audit.md
   - @/.ai/checklists/pull-request.md
7. Report in this shape: objective, findings, drift, proposed remediation, verification performed,
   open risks, next steps. Separate verified fact from inference from proposal.

If the documentation contradicts the codebase, the codebase is reality — fix the docs (or flag the
code as debt). Do not invent a third reality.
