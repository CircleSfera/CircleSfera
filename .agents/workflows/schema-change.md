# Schema change

Add, change or remove a Prisma model, field, index, enum or relation. Invoke with `/schema-change`
(optional — the orchestrator should select this when Assess impact detects a schema need).

## Steps

1. Load the standing context before anything else:
   - @/AGENTS.md
   - @/.ai/core/sources-of-truth.md
   - @/.ai/core/principles.md
   - @/.ai/core/known-gaps.md
2. Follow this playbook step by step, without skipping phases:
   - @/.ai/playbooks/schema-change.md
3. Consult these specialists in order, adopting the checks and hard rules of each for the part of
   the work it owns: database, staff-architect, backend, security, devops. Role definitions:
   - @/.ai/agents/README.md
4. At the decide phase, flag anything on the `AGENTS.md` confirmation list — schema, public API
   contracts, auth, permissions, monetization, deletions, critical business logic, new dependencies,
   infrastructure, secrets, destructive data operations — and **wait** for confirmation.
5. After explicit approval, implement: edit `schema.prisma`, generate the migration, run
   `prisma:check-migrations`, update services/DTOs/shared types, and keep schema + migration in the
   same change set. Never edit an already-applied migration.
6. Verify with the commands in @/.ai/core/quality.md and report real output. Never assert a check
   you did not run.
7. Close with:
   - @/.ai/checklists/database.md
   - @/.ai/checklists/pull-request.md
8. Report in this shape: objective, findings, changes made, verification performed, open risks, next
   steps. Separate verified fact from inference from proposal.

Schema work is a first-class capability. Confirmation is a gate (propose → wait → execute), not a
ban.
