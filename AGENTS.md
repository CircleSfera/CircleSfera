# AGENTS.md — CircleSfera

Operating rules for AI agents working in this repository. This file is a pointer and a set of
guardrails. It is **not** documentation.

CircleSfera is a B2C social network in production and under continuous active development
(NestJS, React, PostgreSQL/Prisma, Redis, Stripe). Real users, real content, real money.

`circlesfera-landing/` was removed (Jul 2026); do not restore or deploy it. `.ai/` and `.agents/`
were removed (Sep 2026); do not recreate them or cite them.

## Documentation lives in Notion

## Documentation lives in Notion

All CircleSfera documentation lives in Notion under **CircleSfera → Documentation**:
https://app.notion.com/p/3e9dfa08f2f580d2b0f7fe13c58f9f30

- Governance (source of truth, standards, conflict resolution):
  https://app.notion.com/p/3e9dfa08f2f581e39f54c30945c52d5e
- Canonical terminology: Notion → Governance → Canonical Terminology
- Product decisions & boundaries: Notion → Product → Product Decisions / Product Scope & Boundaries
- Cross-domain conflicts: Notion → Governance → Cross-Domain Conflict Resolution
- Implementation & capabilities: Notion → Execution → CircleSfera Implementation Backlog / Capability Implementation Register

The documentation was comprehensively rebuilt (Sep 2026) across 8 authoritative domains (Product, Business,
Technology, Architecture & Data, Quality, Design, Governance, Execution). A domain with no published
Notion section is UNKNOWN. `circlesfera-documentation/` is legacy source material being migrated to Notion.
Do not treat it as current truth, and do not add new documents there.

## Sources of truth in the repository

| Question | Authority |
| --- | --- |
| What data and relations exist? | `circlesfera-backend/prisma/schema.prisma` + migrations |
| What does the code do right now? | Source code on `main` |
| What API contract does the system expose? | Controllers + DTOs, `circlesfera-shared` |
| How is behavior verified? | Tests and `.github/workflows/` (state what each test proves) |
| What should be true of the product? | Notion → Product |

Code shows what is **implemented**, not what is **intended**. Never document or treat current behavior
as product intent without an explicit decision. When sources conflict, classify the conflict
(documentation drift, implementation drift, decision conflict, or unknown). Never silently resolve it.

## Change policy

**No extra confirmation needed:** small refactors, typing, lint or format changes that don't alter
logic, readability improvements, focused tests of existing behavior.

**Explicit confirmation required, then full implementation:** schema and migrations; public API
contracts; auth, permissions, roles or monetization; deleting code, tables or endpoints; critical
business logic; new dependencies; infrastructure, deployment or secrets; destructive data operations.

The confirmation list is a gate (propose → wait → execute), not a ban.

**Out of scope without an approved architecture decision.** This list will move to Notion → Product →
Product Boundaries. Until then it is carried over from `circlesfera-documentation/00-status.md`.

- Splitting the modular monolith into microservices
- GraphQL (the API is REST)
- A generic domain event bus or CQRS/event sourcing (`EventEmitter2` only for the closed list in ADR-0019)
- Storing JWTs in `localStorage`
- Native mobile apps. This is **disputed**: Capacitor `android/` and `ios/` projects exist. See the
  Conflict & Decision Register.

## Before and after changing code

Before: read the owning module (service, DTOs, tests, Prisma models). Name the blast radius: schema,
auth, cache, queues, sockets, i18n, tests, docs, money.

After: verify types and imports, and run the relevant lint and tests. Summarize what changed, why, and
what risk remains open. Never claim a check you did not run.

## Security and domain guardrails

- Never expose or hardcode secrets. Never log tokens, cookies, chat plaintext or payment payloads.
- Never relax guards, validation, throttling or CSRF exclusions for convenience.
- Never move authorization to the client. Never trust client-supplied amounts, prices or
  entitlements.
- Critical business rules live in backend services, not only in the UI.
- Social content attaches to `Profile.id`. Credentials, billing and GDPR concerns attach to
  `User.id`. Staff access uses `AdminIdentity` RBAC, never `User.role`.
- Money is integer cents. The platform fee constants are in
  `circlesfera-backend/src/common/constants/monetization.constants.ts`.
- Never invent models, endpoints, enums, relations, permissions or flows that are not backed by the
  schema or code.

## Frontend (mobile-first)

Design and check at **390×844 px** first. On desktop, add parallel columns; never scale components or
type proportionally. Buttons 44–48px, inputs 48–52px, avatars 32/40/56. Spacing scale
4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Canonical tokens: `circlesfera-frontend/src/index.css`.

## Response style

Direct and precise. Keep verified fact, inference and proposal separate. Cite sections as
`section 9.4`, never with the section symbol. If context is missing, do not assume: say so.
