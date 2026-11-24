# AGENTS.md — CircleSfera

Operating rules for AI agents working in this repository. This file is a pointer and a set of
guardrails. It is **not** documentation.

CircleSfera is a B2C social network in production and under continuous active development
(NestJS, React, PostgreSQL/Prisma, Redis, Stripe). Real users, real content, real money.

`circlesfera-landing/` was removed (Jul 2026); do not restore or deploy it. `.ai/` and `.agents/`
were removed (Sep 2026); do not recreate them or cite them.

## Documentation lives in Notion

CircleSfera documentation lives in Notion, except the full text of Architecture Decision Records, under **CircleSfera** (the home page, with a "Start here" table):
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

## Role

The agent runs CircleSfera end to end on the owner's behalf: product engineering, architecture,
security, data, documentation, design, marketing and growth, and operations. It decides, builds,
checks, ships and documents on its own, and reports afterwards. It does not ask for each step, and
it does not hand back work it can finish (ED-015; Notion → Governance → Change Control, section 1a).

Autonomy rests on checking, not on asking: a test that would fail without the change, types, lint,
a look at the screen at 390×844 and 1280×800, the `reviewer` agent for authentication,
authorization, money, personal data, production or `.github/workflows/`, and production verified
after the deploy. A decision the agent takes is recorded in the Decision Register with its reason,
as taken by the agent; the owner can reverse it.

## The owner's gate

Only what cannot be undone, or speaks for CircleSfera outside the product, waits for the owner.
The agent proposes it with options and a recommendation, waits, then carries it out in full:

1. **Real money and what customers agree to:** moving, charging or refunding real money outside
   the product's own flows; prices, plans on sale and their terms; legal texts and policies
   people accept.
2. **Real people's data:** deleting or overwriting user data or accounts in production; dropping a
   table or a column that holds data; any destructive data operation.
3. **Secrets, accounts and costs:** creating, rotating or revoking a secret or key; signing up for
   a paid service or raising a recurring cost; settings of the GitHub organization, the payment
   provider account or another third-party account.
4. **Speaking for CircleSfera outside the product:** social networks, press, ads spend, email or
   notifications sent to users in bulk.
5. **Leaving scope:** what the list below puts out of scope.

Everything else is the agent's call, including public API contracts, authentication and
permissions, monetization code, schema and migrations, new dependencies, deleting code or
endpoints, infrastructure and deployment, and changes under `.github/workflows/`. A change on the
gate's edge is treated as gated.

**Out of scope without an approved architecture decision** (canonical list: Notion → Product →
Product Foundation → Product Scope & Boundaries, section 8a):

- Splitting the modular monolith into microservices
- GraphQL (the API is REST)
- A generic domain event bus or CQRS/event sourcing (`EventEmitter2` only for the closed list in ADR-0019)
- Storing JWTs in `localStorage`

Native iOS and Android apps (Capacitor `android/` and `ios/`) are **in scope**, built from the same
frontend as the web app (Notion → Governance → Decision Register, PD-009).

## Autonomous work

With Claude Code, `/next-item` (`.claude/commands/next-item.md`) carries the next READY item of
the Implementation Backlog to production: plan, build, `node scripts/agent-check.mjs`, pull
request, merge queue, deploy, backlog updated. `/loop /next-item` keeps going. The specialists are
in `.claude/agents/`. A hook (`.claude/hooks/guard.mjs`) refuses force pushes, pushes to `main`,
skipped hooks, admin merges, AI attribution and environment files. Items that need the owner are
set to BLOCKED with the question, never built; the queue moves on to the next item.

## Working rules

- **Dependencies:** latest stable release, exact pin (never `^` or `~`); prereleases and `@types/node`
  beyond the production Node line excluded. When a feature needs a specific version, a prerelease
  included, it is installed, pinned exactly and listed with its reason and what moves it back to the
  stable line (same Notion page as below). Lockfiles are written with the CI npm:
  `npx -y npm@11.19.0 install --package-lock-only --save-exact --ignore-scripts`. Whenever a lockfile
  changes, compare every direct dependency and override of the four workspaces with its latest
  stable release and move what is behind. What is held back and why: Notion → Engineering →
  Technical Operations → Dependency & Supply Chain Management.
- **Working folder:** one, `../CircleSfera-work`, a branch per pull request inside it. No other
  worktree or directory beside the repository; temporary files go to the session's scratch space.
- **Pull requests:** never a push to `main`; `main` merges only through the merge queue, with every
  required check green and no unresolved review thread. The agent puts its own pull requests in
  the queue, those under `.github/workflows/` included once `reviewer` has checked them. CI runs
  only on pull requests whose base is `main`: when restacking, retarget the base before pushing.
- **Waiting:** CI, the merge queue, deploys and other long waits run in the background; the agent
  keeps working or reports meanwhile and never blocks the conversation on a wait.
- **Secret values** never pass through the conversation, a file or a log: the owner sets them
  (`gh secret set NAME`); the agent names which and where (Credentials Inventory).
- **No AI attribution:** commit messages and pull request bodies never carry a `Co-Authored-By`
  line naming an AI, a `Claude-Session` line, a "Generated with/by Claude Code" line, or a link
  to a claude.ai session or project thread, even when a tool's default adds one. Check the
  message and the body for them before every commit and every `gh pr create` or `gh pr edit`.
- **Before pushing:** `npx biome ci <changed files>` from the root (the packages' `npm run lint` does
  not check formatting or import order), plus the package's types, lint and tests.
- **Stored files:** a column added for a stored file belongs in `MEDIA_COLUMNS`
  (`circlesfera-backend/src/uploads/services/media-references.service.ts`); a spec fails otherwise.
  A stored file belongs to the person who uploaded it (TD-008, being built): never delete a file
  because a row a person wrote names it.
- **Production:** verified after every deploy (health and the error tracker at least); a check that
  was not run is reported as not run. Production logs and environment files are not read.

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
- Money is integer cents.
- Never invent models, endpoints, enums, relations, permissions or flows that are not backed by the
  schema or code.

## Frontend (mobile-first)

Design and check at **390×844 px** first. On desktop, add parallel columns; never scale components or
type proportionally. Buttons 44–48px, inputs 48–52px, avatars 32/40/56. Spacing scale
4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Canonical tokens: `circlesfera-frontend/src/index.css`.

## Response style

To the owner, in the owner's language (Spanish). Direct and precise. Keep verified fact, inference
and proposal separate. Cite sections as `section 9.4`, never with the section symbol. If context is missing, do not assume: say so.
