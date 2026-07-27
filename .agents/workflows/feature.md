# Feature

Build a new user-facing capability end to end. Invoke with `/feature`.

## Steps

1. Load the standing context before anything else:
   - @/AGENTS.md
   - @/.ai/core/sources-of-truth.md
   - @/.ai/core/principles.md
   - @/.ai/core/known-gaps.md
2. Follow this playbook step by step, without skipping phases:
   - @/.ai/playbooks/feature.md
3. Consult these specialists in order, adopting the checks and hard rules of each for the part of
   the work it owns: product, staff-architect, database, api, backend, frontend, ux-researcher,
   security, qa, documentation. Role definitions:
   - @/.ai/agents/README.md
4. At the decide phase, flag anything on the `AGENTS.md` confirmation list — schema, public API
   contracts, auth, permissions, monetization, deletions, critical business logic, new dependencies,
   infrastructure, secrets, destructive data operations — and **wait** for confirmation.
5. Verify with the commands in @/.ai/core/quality.md and report real output. Never assert a check
   you did not run.
6. Close with:
   - @/.ai/checklists/pull-request.md
   - @/.ai/checklists/feature.md
7. Report in this shape: objective, findings, changes made, verification performed, open risks, next
   steps. Separate verified fact from inference from proposal.

Money, moderation and API-shape work also route here. Swap in the payments, trust-and-safety or api
specialist as the lead.
