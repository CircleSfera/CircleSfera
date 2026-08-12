# Playbook — Audit

Auditing the architecture for compliance, detecting drift between documentation and code, and identifying transversal bottlenecks or coupling across multiple domains.

Specialists: `auditor` → `staff-architect` → `security`.

## 1 — Understand

Restate the scope of the audit in one or two sentences. Identify if this is a general health check, or a targeted audit (e.g., "audit all usages of NotificationsService to identify coupling").

## 2 — Ground Globally

Since the auditor is exempt from the 4-domain limit, you must read the reality across the entire system.
- Read `AGENTS.md` and `circlesfera-documentation/adr/README.md` to establish the "intended" architecture.
- Identify all cross-domain imports or dependencies related to the audit target.
- Do not rely on assumptions; trace the actual execution paths in the code.

## 3 — Assess Transversal Impact

Identify how the current implementation affects:
- Code coupling and boundaries.
- Database locks or transaction sizes (e.g., synchronous writes inside other domains).
- Resilience and error handling.
- Security and compliance (e.g., does it leak data?).

## 4 — Decide & Plan

Propose a concrete remediation plan. This plan must be strictly separated into phases:
- What can be done immediately (low risk).
- What requires an architectural shift (e.g., moving to Domain Events).
- If an architectural shift is required, it must be escalated and approved before any code is written.

## 5 — Report

- **Objective:** What was audited.
- **Findings:** Verified facts about the current state of the codebase.
- **Drift:** Explicit contradictions between documentation and code.
- **Proposed Remediation:** Step-by-step plan to fix the issues.
- **Risks:** What could break if the remediation is applied.

## 6 — Checklist

Ensure that [`../checklists/audit.md`](../checklists/audit.md) is filled out at the end of the report.
