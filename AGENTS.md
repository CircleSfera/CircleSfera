# AGENTS.md — CircleSfera

Operating rules for AI agents working in this repository. This file is a pointer and a set of
guardrails. It is **not** documentation.

CircleSfera is a B2C social network in production and under continuous active development
(NestJS, React, PostgreSQL/Prisma, Redis, Stripe). Real users, real content, real money.

`circlesfera-landing/` was removed (Jul 2026); do not restore or deploy it. `.ai/` and `.agents/`
were removed (Sep 2026); do not recreate them or cite them.

## Documentation lives in Notion

All CircleSfera documentation lives in Notion under **CircleSfera** (the home page, with a "Start here" table):
https://app.notion.com/p/3b2dfa08f2f580a5a11ac45a2621a31c

It has 7 domains, each a direct child of that page: Product, Engineering (architecture, data,
technology, delivery, operations), Quality, Design & Brand, Business & Growth, Execution, Governance.
A domain with no published Notion section is UNKNOWN.

- Governance (source of truth, standards, conflict resolution):
  https://app.notion.com/p/3e9dfa08f2f581e39f54c30945c52d5e
- Every decision (PD, ADR, AD, TD, QD, DD, BD, ED): Notion → Governance → Decision Register; each domain's
  "… Decisions" page shows its own view. Whether a change needs an ADR or a TD: Notion → Engineering →
  Engineering Foundation, section 3 (AD-004)
- Open defects and findings (QF): Notion → Quality → Defects & Findings (Findings database)
- Canonical terminology: Notion → Governance → Canonical Terminology
- Product boundaries: Notion → Product → Product Foundation → Product Scope & Boundaries
- Cross-domain conflicts: Notion → Governance → Cross-Domain Conflict Resolution
- Implementation & capabilities: Notion → Execution → CircleSfera Implementation Backlog / Capability Implementation Register
- Which credentials exist and where each is kept (never the values): Notion → Engineering → Credentials Inventory

The legacy `circlesfera-documentation/` folder was migrated to Notion and removed; do not recreate it.
The full text of Architecture Decision Records stays in `docs/adr/`. What was replaced in Notion is kept
in Notion → Governance → Historical & Superseded Information and is never authoritative.

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
logic, readability improvements, focused tests of existing behavior. Schema changes and their
migrations when the work that was asked for needs them: identify the change, make it, and say in
the summary what the migration does.

**Explicit confirmation required, then full implementation:** public API contracts; auth,
permissions, roles or monetization; deleting code, tables or endpoints; critical business logic;
new dependencies; infrastructure, deployment or secrets; destructive data operations. Dropping a
table or a column that holds data is a deletion and a destructive data operation: it stays here.

The confirmation list is a gate (propose → wait → execute), not a ban.

**Out of scope without an approved architecture decision** (canonical list: Notion → Product →
Product Foundation → Product Scope & Boundaries, section 8a):

- Splitting the modular monolith into microservices
- GraphQL (the API is REST)
- A generic domain event bus or CQRS/event sourcing (`EventEmitter2` only for the closed list in ADR-0019)
- Storing JWTs in `localStorage`

Native iOS and Android apps (Capacitor `android/` and `ios/`) are **in scope**, built from the same
frontend as the web app (Notion → Governance → Decision Register, PD-009).

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
- Social content attaches to `Profile.id`. A Platform Plan belongs to one `Profile.id`. Identity,
  the payer and billing account, and GDPR concerns attach to `User.id`.
  Credentials are on `User` today and move to `SignIn` records: Profiles of one `User` may share a
  `SignIn` or use separate `SignIn` records, as defined in
  `docs/adr/0025-sign-in-per-profile-one-identity.md`: check which step is on `main` before
  touching authentication. Staff access uses `AdminIdentity` RBAC, never `User.role`.
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
