# Performance

Diagnose and fix something slow: feed, chat, search, queries, bundle size. Invoke with
`/performance`.

## Steps

1. Load the standing context before anything else:
   - @/AGENTS.md
   - @/.ai/core/sources-of-truth.md
   - @/.ai/core/principles.md
   - @/.ai/core/known-gaps.md
2. Follow this playbook step by step, without skipping phases:
   - @/.ai/playbooks/performance.md
3. Consult these specialists in order, adopting the checks and hard rules of each for the part of
   the work it owns: performance, database, caching-and-queues, frontend, observability. Role
   definitions:
   - @/.ai/agents/README.md
4. At the decide phase, flag anything on the `AGENTS.md` confirmation list — schema, public API
   contracts, auth, permissions, monetization, deletions, critical business logic, new dependencies,
   infrastructure, secrets, destructive data operations — and **wait** for confirmation.
5. Verify with the commands in @/.ai/core/quality.md and report real output. Never assert a check
   you did not run.
6. Close with:
   - @/.ai/checklists/performance.md
   - @/.ai/checklists/pull-request.md
7. Report in this shape: objective, findings, changes made, verification performed, open risks, next
   steps. Separate verified fact from inference from proposal.

Measure before and after. An optimisation with no measurement is a guess.
