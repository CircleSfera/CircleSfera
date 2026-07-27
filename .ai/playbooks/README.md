# Playbooks

Each playbook is a specialization of the mandatory protocol in
[`../orchestrator.md`](../orchestrator.md): Understand → Ground → Assess impact → Decide →
Implement → Verify → Report.

They exist so that important steps are not skipped when you are in a hurry. A step that does not
apply is called out as not applicable, with a reason — never silently dropped.

| Playbook | Use when |
| --- | --- |
| [`feature.md`](./feature.md) | Building a new user-facing capability |
| [`bug.md`](./bug.md) | A defect with a known reproduction, not a live incident |
| [`incident.md`](./incident.md) | Production is broken right now |
| [`refactor.md`](./refactor.md) | Improving structure with no behaviour change |
| [`schema-change.md`](./schema-change.md) | Touching `schema.prisma` |
| [`performance.md`](./performance.md) | Something measurably slow |
| [`security-audit.md`](./security-audit.md) | Auth, permissions, data exposure, abuse, privacy |
| [`ui-redesign.md`](./ui-redesign.md) | Restructuring a screen or its information architecture |
| [`dependency-upgrade.md`](./dependency-upgrade.md) | Adding or upgrading a dependency |
| [`release.md`](./release.md) | Shipping to production |
| [`docs-sync.md`](./docs-sync.md) | Documentation contradicts reality |

Close every run with the matching checklist from [`../checklists/`](../checklists/README.md).
