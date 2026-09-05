# Architecture

Design or change system structure (boundaries, patterns, ADRs). Default to implementing when the
user wants a shipped result (orchestrator Ship mode). Invoke with `/architecture` (optional;
orchestrator may select this without the slash).

## Steps

1. Load the standing context before anything else:
   - @/AGENTS.md
   - @/.ai/core/sources-of-truth.md
   - @/.ai/core/architecture.md
   - @/.ai/core/principles.md
   - @/.ai/core/known-gaps.md
2. Follow this playbook step by step, without skipping phases:
   - @/.ai/playbooks/architecture.md
3. Consult these specialists in order, adopting the checks and hard rules of each for the part of
   the work it owns: staff-architect → cto → product (if user-facing) → database (if data) →
   security → backend/frontend by layer → documentation. Role definitions:
   - @/.ai/agents/README.md
4. Infer delivery mode from @/.ai/orchestrator.md Step 0. At Decide, flag confirmation-list items
   and state the auto-detected chain (schema / feature / ui-redesign). **Wait** only for gated items.
5. In Ship mode, after confirmation, implement. If schema is involved, continue with
   @/.ai/playbooks/schema-change.md. If a user-facing capability follows, continue with
   @/.ai/playbooks/feature.md. Do not wait to be told "now build".
6. Verify with the commands in @/.ai/core/quality.md and report real output. Never assert a check
   you did not run.
7. Close with:
   - @/.ai/checklists/pull-request.md
   - @/.ai/checklists/audit.md (when transversal)
8. Report in this shape: objective, decision, ADR (if any), changes made, verification performed,
   open risks, next steps. Separate verified fact from inference from proposal.

Confirmation is a gate, not a ban. Playbooks are inferred; slash commands are optional.
