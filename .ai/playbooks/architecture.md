# Playbook — Architecture

Designing or changing how the system is structured: module boundaries, patterns, ADRs, and the
path from decision to implementation. Use when the work is more than a single feature and less than
a production incident.

Specialists: `staff-architect` → `cto` → `product` (if user-facing) → `database` (if data) →
`security` → `backend` / `frontend` (by layer) → `documentation`.

## 1 — Frame

- Restate the architectural question in one or two sentences.
- Name what is explicitly out of scope.
- Check [`../core/architecture.md`](../core/architecture.md), the ADR index, and
  `circlesfera-documentation/00-status.md`.
- Delivery mode comes from the orchestrator Step 0. **Advise** may stop after Decide. **Ship**
  continues through Implement unless confirmation is pending.

## 2 — Ground

- Read the as-built map and the forbidden list in `architecture.md`.
- Read the modules and services that would change.
- Read related ADRs — do not reopen a deliberate decision without saying you are superseding it.
- Note known gaps ([`../core/known-gaps.md`](../core/known-gaps.md)).

## 3 — Options

Present at least two real options. For each: blast radius (schema, API, auth, queues, deploy),
reversibility, and how it fits the modular monolith.

Reject by default: new layers (repository/mapper/event bus), microservices, second runtimes,
second HTTP clients or state managers — unless an ADR + confirmation justify them.

## 4 — Decide

- Choose one option and justify it.
- If the decision is durable and non-obvious, draft an ADR from
  [`../templates/adr.md`](../templates/adr.md) and plan to add it to `adr/README.md`.
- Flag confirmation-list items (schema, auth, monetization, deps, infra, deletions) and **wait**.
- State the auto-detected follow-on chain (schema / feature / ui-redesign).

## 5 — Implement (Ship mode)

Architecture without code is incomplete when delivery mode is Ship. After confirmation:

1. ADR merged or staged in the same change set when required.
2. If schema is involved → [`schema-change.md`](./schema-change.md).
3. If a user-facing capability follows → [`feature.md`](./feature.md) (or [`ui-redesign.md`](./ui-redesign.md)).
4. Smallest correct structural change; no drive-by rewrites.

## 6 — Verify and report

- Checks from [`../core/quality.md`](../core/quality.md) that apply.
- Close with [`../checklists/pull-request.md`](../checklists/pull-request.md) and
  [`../checklists/audit.md`](../checklists/audit.md) when the change is transversal.
- Report: decision, ADR number, files touched, open risks, follow-on work.

## Hard rules

- The product is a **modular monolith** unless an Accepted ADR says otherwise.
- Do not invent models or endpoints while designing — verify in schema and controllers.
- Confirmation is a **gate**, not a ban: after explicit approval, implement.
- Do not wait for the user to say "now implement" or "also change the schema" if Ship mode and
  Assess impact already require it.
