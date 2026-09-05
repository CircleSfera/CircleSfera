# Orchestrator

You do not pick a role. You describe the task, and this file decides which playbook runs and which
specialists must be consulted.

This framework **develops, designs, architects, and implements** CircleSfera — including schema
changes when required. Confirmation gates pause work for approval; they do not mean "refuse".

Always loaded first: [`AGENTS.md`](../AGENTS.md), then
[`core/sources-of-truth.md`](./core/sources-of-truth.md),
[`core/principles.md`](./core/principles.md) and [`core/stack.md`](./core/stack.md).

## Step 0 — Infer intent (automatic)

The user should **not** have to name a playbook, say "change the schema", or type `/feature`.
Infer from the request and from what the code needs. Slash commands are optional shortcuts.

### Delivery mode (default → ship)

| User signal | Mode |
| --- | --- |
| Build / add / fix / implement / ship / "haz X" / "quiero X" / redesign a screen | **Ship** — design + implement (+ schema/API if needed) |
| Ambiguous product request with no "only advise" language | **Ship** (default) |
| "Is this a good idea?", "trade-offs?", "what would you recommend?", review-only | **Advise** — stop after Decide unless they then ask to build |
| Audit / review this PR / find drift | **Review** — report only |

When mode is **Ship**: do not stop at a plan or ADR by default. After Decide (and confirmation if
required), continue through Implement → Verify → Report. Ask only when a real fork would change the
design, not to get permission to keep going.

### Auto-detect workstreams (from Ground + Assess impact)

While grounding, decide which of these are required — then chain them. Do not wait for the user to
request each one:

| Detected need | Action |
| --- | --- |
| New/changed Prisma model, field, enum, index, relation | Include [`schema-change`](./playbooks/schema-change.md); flag confirmation |
| New or changed public endpoint / DTO contract | Include API work under `feature`; flag confirmation if public contract |
| Auth, roles, monetization, money | Flag confirmation; keep payments/security specialists |
| Durable non-obvious structure / new module / forbidden pattern | [`architecture`](./playbooks/architecture.md) (+ ADR) before or with the build |
| UI-only within existing contracts | `ui-redesign` / frontend path only |
| Docs contradict code after a ship | Close with [`docs-sync`](./playbooks/docs-sync.md) for the touched docs |

State the inferred chain briefly in Decide ("schema → backend → frontend → i18n") so the user can
correct it — then proceed unless they object or confirmation is required.

## Step 1 — Classify the request

Pick the **single** best **entry** playbook. If two apply, take the higher row — security and data
beat features. Then apply Step 0 chaining; the entry row is not the whole job.

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
| 18 | Architecture direction, module boundaries, patterns, ADR-worthy design (ship when delivery mode is Ship) | [`playbooks/architecture.md`](./playbooks/architecture.md) | staff-architect → cto → product (if UX) → database (if data) → security → layer specialists → documentation |
| 19 | Explicitly advisory only ("is this a good idea?", trade-offs, no build) | none — advisory | cto → staff-architect → product → the affected specialists |
| 20 | Reviewing an existing diff or PR | none — review only | code-reviewer → security → the affected specialists |
| 21 | Architecture audit, transversal code review, drift detection | [`playbooks/audit.md`](./playbooks/audit.md) | auditor → staff-architect → security |

Cannot classify, or the request spans four or more rows? Say so, propose a split, and ask which part
to start with. Do not silently pick one. **Exception**: Requests routed to the `auditor` specialist (row 21) are exempt from this limit and may span any number of domains for read-only analysis.

### Chaining (automatic)

| Situation | Order |
| --- | --- |
| Feature needs new tables/fields | Confirm → [`schema-change`](./playbooks/schema-change.md) → [`feature`](./playbooks/feature.md) |
| Architecture decision then build | [`architecture`](./playbooks/architecture.md) (ADR) → `schema-change` and/or `feature` / `ui-redesign` |
| UI redesign with API/schema impact | Confirm sensitive parts → `schema-change` / API work → [`ui-redesign`](./playbooks/ui-redesign.md) |

Do not stop after the first playbook when delivery mode is **Ship**. Do not ask "should I also
change the schema?" if Assess impact already showed it is required — propose the schema change,
wait only if it is on the confirmation list, then implement.

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
permissions, cache keys, queues, sockets, i18n keys, tests, docs, and money flows. From this list,
**auto-select** the chained playbooks (Step 0). Missing this phase is how this codebase gets broken.

**Phase 4 — Decide.** Present the plan: at least two options when a real trade-off exists, the
choice, why, and the inferred chain. Flag anything on the `AGENTS.md` confirmation list — schema,
public API contracts, auth/permissions/monetization, deletions, critical business logic, new
dependencies, infrastructure, secrets, destructive data operations — and **wait** for confirmation.
After approval (or immediately if nothing is gated), continue to Implement. Do not ask the user to
pick a playbook name.

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
- The task requires a change on the confirmation list (**pause for approval, then implement**).
- The request implies something in the OUT OF SCOPE list in `00-status.md`.
- The fix would contradict a product principle in [`core/identity.md`](./core/identity.md) —
  for example anything that reduces reach without an explicit, communicable reason.
- The only way forward is guessing at a schema, contract or business rule.

Do **not** escalate merely because the work is large, touches schema, or needs an ADR. Those are
normal, supported paths (`schema-change`, `architecture`, `feature`).

## Consulting a specialist

"Consult" means adopt that file's checks and hard rules for the part of the work it owns, and report
its findings. It does not mean announcing a persona. One coherent answer, not a role-play transcript.

Specialists are in [`agents/`](./agents/README.md) — 25 files, each with scope, required reading,
checks, hard rules and output shape.
