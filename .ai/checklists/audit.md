# Checklist — Audit

Run alongside [`pull-request.md`](./pull-request.md) when presenting an audit report.

## Grounding & Facts

- [ ] The scope of the audit is clearly defined in the report.
- [ ] The audit is grounded in real code, not assumptions (files were actively read and verified).
- [ ] Verified facts (what the code does) are strictly separated from inferences (what it intends to do).

## Drift Detection

- [ ] Contradictions between the codebase and `AGENTS.md` are documented.
- [ ] Contradictions between the codebase and existing ADRs are documented.
- [ ] If the code contradicts documentation, the remediation plan proposes fixing the documentation (or addressing the code as technical debt).

## Architectural Risks

- [ ] Transversal coupling (dependencies across boundaries) is evaluated.
- [ ] Violations of Single Responsibility (e.g. "God Services") are identified.
- [ ] Synchronous operations that block response times (e.g., executing push notifications in a user interaction loop) are identified.

## Remediation Plan

- [ ] The remediation plan distinguishes between immediate/low-risk fixes and major architectural shifts.
- [ ] Any major architectural shift (e.g., introducing an Event Bus) specifies that it requires a new ADR and explicit user confirmation.
- [ ] A list of actionable next steps is provided.

## Domain Boundaries

- [ ] The `auditor` confirms that no domain-specific business logic was altered during the audit phase without explicit confirmation.
