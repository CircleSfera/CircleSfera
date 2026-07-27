# Specialists

24 narrow roles. [`../orchestrator.md`](../orchestrator.md) selects them; you rarely name one
directly. Each file has the same shape: **Scope**, **Read first**, **Checks**, **Hard rules**,
**Output**.

Consulting a specialist means adopting its checks and hard rules for the part of the work it owns —
not announcing a persona. Produce one coherent answer, never a role-play transcript.

## Index

| File | Owns |
| --- | --- |
| [`cto.md`](./cto.md) | Direction, scope discipline, saying no, 10-year consequences |
| [`staff-architect.md`](./staff-architect.md) | System boundaries, module design, pattern decisions, ADRs |
| [`product.md`](./product.md) | Whether it should exist, user value, scope, tiers |
| [`ux-researcher.md`](./ux-researcher.md) | Flows, information architecture, cognitive load, benchmarking |
| [`design-system.md`](./design-system.md) | Real tokens, visual consistency, identity protection |
| [`frontend.md`](./frontend.md) | React 19, TanStack Query, Zustand, routing, rendering |
| [`backend.md`](./backend.md) | NestJS modules, services, DTOs, guards, Prisma access |
| [`api.md`](./api.md) | Endpoint shape, contracts, errors, pagination, compatibility |
| [`database.md`](./database.md) | Prisma schema, migrations, indexes, query shape, pgvector |
| [`caching-and-queues.md`](./caching-and-queues.md) | Redis cache, BullMQ, cron, Socket.IO scaling |
| [`security.md`](./security.md) | Auth, CSRF, authorization, secrets, OWASP, abuse |
| [`privacy-compliance.md`](./privacy-compliance.md) | GDPR, export/deletion, retention, consent, minimization |
| [`payments.md`](./payments.md) | Stripe, Connect, the 20% fee, webhooks, idempotency, ledger |
| [`performance.md`](./performance.md) | Hot paths, N+1, bundle, Web Vitals, measurement |
| [`qa.md`](./qa.md) | Test strategy, edge cases, regression, Vitest/Playwright |
| [`accessibility.md`](./accessibility.md) | WCAG 2.2, keyboard, focus, ARIA, reduced motion |
| [`devops.md`](./devops.md) | Docker, nginx, CI/CD, deploy, rollback, backups |
| [`observability.md`](./observability.md) | Pino, Sentry, Slack alerts, health, diagnosability |
| [`trust-and-safety.md`](./trust-and-safety.md) | Moderation, reports, appeals, suspensions, transparency |
| [`code-reviewer.md`](./code-reviewer.md) | Correctness, duplication, debt, reviewability |
| [`refactoring.md`](./refactoring.md) | Behaviour-preserving change, risk classification |
| [`documentation.md`](./documentation.md) | Doc/schema/code alignment, ADRs, runbooks |
| [`incident-commander.md`](./incident-commander.md) | Production incidents, mitigation before root cause |
| [`release-manager.md`](./release-manager.md) | Release readiness, changelog, rollback plan |

## Role mapping

Several commonly requested roles are folded in deliberately, because splitting them would duplicate
content rather than add judgement:

| If you would have asked for… | Use |
| --- | --- |
| Redis Expert, Queue Engineer | `caching-and-queues.md` |
| PostgreSQL Expert, DBA, Prisma Expert | `database.md` |
| React Performance Specialist | `performance.md` + `frontend.md` |
| NestJS Specialist | `backend.md` |
| Stripe Expert | `payments.md` |
| Consistency Auditor | `design-system.md` (UI) + `code-reviewer.md` (code) |
| Logs Analyzer | `observability.md` |
| Product Designer, UI Designer | `ux-researcher.md` + `design-system.md` |
| Principal Architect, Backend/Frontend Architect | `staff-architect.md` + the layer specialist |

Adding a specialist is justified when routing repeatedly lands on a real gap. Use
[`../templates/agent.md`](../templates/agent.md), keep it under ~100 lines, and add it to this index.
