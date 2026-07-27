# Orchestrator

You do not pick a role. You describe the task, and this file decides which playbook runs and which
specialists must be consulted.

Always loaded first: [`AGENTS.md`](../AGENTS.md), then
[`core/sources-of-truth.md`](./core/sources-of-truth.md),
[`core/principles.md`](./core/principles.md) and [`core/stack.md`](./core/stack.md).

## Step 1 — Classify the request

Pick the **single** best match. If two apply, take the higher row — security and data beat features.

| # | The request is about… | Playbook | Specialists (in order) |
| --- | --- | --- | --- |
| 1 | Production is broken, users are affected, an alert fired | [`playbooks/incident.md`](./playbooks/incident.md) | incident-commander → observability → backend/frontend (by symptom) → database → qa |
| 2 | A vulnerability, auth/permissions, secrets, abuse, CSRF, rate limits | [`playbooks/security-audit.md`](./playbooks/security-audit.md) | security → backend → api → privacy-compliance → code-reviewer |
| 3 | Personal data, GDPR, export/deletion, retention, consent | [`playbooks/security-audit.md`](./playbooks/security-audit.md) | privacy-compliance → security → database → documentation |
| 4 | A Prisma model, field, index, enum or migration | [`playbooks/schema-change.md`](./playbooks/schema-change.md) | database → staff-architect → backend → security → devops |
| 5 | Money: Stripe, plans, tips, unlocks, promotions, gifts, webhooks, fees | [`playbooks/feature.md`](./playbooks/feature.md) | payments → security → database → backend → qa → code-reviewer |
| 6 | Moderation, reports, appeals, suspensions, visibility limits | [`playbooks/feature.md`](./playbooks/feature.md) | trust-and-safety → product → backend → security → documentation |
| 7 | A defect with known reproduction, not currently an incident | [`playbooks/bug.md`](./playbooks/bug.md) | qa → backend/frontend (by layer) → database → code-reviewer |
| 8 | Something is slow: feed, chat, search, bundle, queries | [`playbooks/performance.md`](./playbooks/performance.md) | performance → database → caching-and-queues → frontend → observability |
| 9 | A new user-facing capability | [`playbooks/feature.md`](./playbooks/feature.md) | product → staff-architect → database → api → backend → frontend → ux-researcher → security → qa → documentation |
| 10 | Restructuring a screen, information architecture, UX flow | [`playbooks/ui-redesign.md`](./playbooks/ui-redesign.md) | ux-researcher → product → design-system → frontend → accessibility |
| 11 | Visual/component work inside an existing screen | [`playbooks/ui-redesign.md`](./playbooks/ui-redesign.md) | design-system → frontend → accessibility |
| 12 | Cleaning code with no behaviour change | [`playbooks/refactor.md`](./playbooks/refactor.md) | refactoring → staff-architect → code-reviewer → qa |
| 13 | API shape: endpoints, DTOs, errors, pagination, versioning | [`playbooks/feature.md`](./playbooks/feature.md) | api → backend → security → documentation |
| 14 | Docker, nginx, CI/CD, deploy, backups, env | [`playbooks/release.md`](./playbooks/release.md) | devops → observability → security → release-manager |
| 15 | Cutting a release | [`playbooks/release.md`](./playbooks/release.md) | release-manager → qa → devops → documentation |
| 16 | Upgrading or adding a dependency | [`playbooks/dependency-upgrade.md`](./playbooks/dependency-upgrade.md) | staff-architect → security → devops → qa |
| 17 | Docs are wrong or out of date | [`playbooks/docs-sync.md`](./playbooks/docs-sync.md) | documentation → the owning domain specialist |
| 18 | "Is this a good idea?", scope, trade-offs, architecture direction | none — advisory | cto → staff-architect → product → the affected specialists |
| 19 | Reviewing an existing diff or PR | none — review only | code-reviewer → security → the affected specialists |

Cannot classify, or the request spans four or more rows? Say so, propose a split, and ask which part
to start with. Do not silently pick one.

## Step 2 — Run the mandatory protocol

Every playbook is a specialization of this. No phase is skippable; a phase that does not apply is
called out as not applicable, with a reason.

**Phase 1 — Understand.** Restate the goal in one or two sentences, including what is explicitly out
of scope. If the goal is ambiguous in a way that changes the design, stop and ask.

**Phase 2 — Ground.** Read the real artifacts: the owning module, its service, its DTOs, its tests,
the Prisma models, the relevant controller, the frontend caller. Check
[`core/known-gaps.md`](./core/known-gaps.md) and the ADR index. Verify scope against
`circlesfera-documentation/00-status.md` — it has an explicit OUT OF SCOPE list. Every later claim
must trace to something read here.

**Phase 3 — Assess impact.** Name what else is affected: schema, migrations, API contract, auth and
permissions, cache keys, queues, sockets, i18n keys, tests, docs, and money flows. Missing this
phase is how this codebase gets broken.

**Phase 4 — Decide.** Present the plan: at least two options when a real trade-off exists, the
choice, and why. Flag anything on the `AGENTS.md` confirmation list — schema, public API contracts,
auth/permissions/monetization, deletions, critical business logic, new dependencies, infrastructure,
secrets, destructive data operations — and **wait** for confirmation.

**Phase 5 — Implement.** Smallest correct change. Follow the module's existing pattern. No unrelated
refactors, no drive-by reformatting, no new abstractions for one caller.

**Phase 6 — Verify.** Run the commands from [`core/quality.md`](./core/quality.md) that apply and
report actual output. Never assert a check you did not run.

**Phase 7 — Report.** Objective, findings, changes made, verification performed, open risks, next
steps. Separate verified fact from inference from proposal.

## Step 3 — Close with a checklist

| Change touched… | Checklist |
| --- | --- |
| Anything | [`checklists/pull-request.md`](./checklists/pull-request.md) |
| New capability | [`checklists/feature.md`](./checklists/feature.md) |
| Prisma / SQL | [`checklists/database.md`](./checklists/database.md) |
| Auth, permissions, personal data, money | [`checklists/security.md`](./checklists/security.md) |
| Endpoints or DTOs | [`checklists/api.md`](./checklists/api.md) |
| Hot paths | [`checklists/performance.md`](./checklists/performance.md) |
| Visible UI | [`checklists/ui.md`](./checklists/ui.md) + [`checklists/accessibility.md`](./checklists/accessibility.md) |
| Deploy | [`checklists/release.md`](./checklists/release.md) |

## Escalation rules

Stop and ask instead of proceeding when:

- Two canonical sources disagree (report both paths — `AGENTS.md` requires making it explicit).
- The task requires a change on the confirmation list.
- The request implies something in the OUT OF SCOPE list in `00-status.md`.
- The fix would contradict a product principle in [`core/identity.md`](./core/identity.md) —
  for example anything that reduces reach without an explicit, communicable reason.
- The only way forward is guessing at a schema, contract or business rule.

## Consulting a specialist

"Consult" means adopt that file's checks and hard rules for the part of the work it owns, and report
its findings. It does not mean announcing a persona. One coherent answer, not a role-play transcript.

Specialists are in [`agents/`](./agents/README.md) — 24 files, each with scope, required reading,
checks, hard rules and output shape.
