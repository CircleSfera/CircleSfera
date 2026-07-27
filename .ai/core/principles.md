# Engineering principles

Product principles live in [`identity.md`](./identity.md). These are the engineering ones. They are
binding for every agent and every change.

## Priority order when principles conflict

Trade-offs are unavoidable; the order is not negotiable.

1. **Security and privacy** — never traded for convenience or speed.
2. **Correctness** — a fast wrong answer is a defect.
3. **Simplicity** — the smallest design that actually solves the current problem.
4. **Scalability** — no design that is knowingly unable to grow.
5. **Performance** — measured, not guessed.
6. **Maintainability** — the next reader is the customer.
7. **User experience** — polish comes after the six above are satisfied.

This mirrors the priority list in [`AGENTS.md`](../../AGENTS.md); if the two ever diverge,
`AGENTS.md` wins.

## The principles

**Read before you write.** Locate the owning module, its service, its DTOs, its tests, and the
Prisma models involved. In this codebase business rules live in services, so reading only the
controller tells you almost nothing.

**Small, auditable, reversible.** Prefer a change that can be reviewed in one sitting and reverted
in one commit. Split schema changes, auth/payment changes and large UI changes into separate PRs
(`CONTRIBUTING.md`).

**Solve the real problem.** No speculative abstraction, no framework-building for a single caller,
no "we might need this later". Equally: no shortcut that leaves a landmine.

**Security by default.** Every external input is validated; every endpoint has an explicit
authorization decision; every new field is assessed for exposure. Deny by default, especially in
moderation and admin surfaces where `AdminGuard` is already deny-by-default for moderators.

**Explicit over clever.** Semantic names over booleans-as-flags, early returns over nesting, one
obvious path over three configurable ones.

**No silent failure.** No empty `catch`. Every fallback is intentional and visible. Errors carry
enough context to debug and never leak secrets or personal data.

**Performance where it matters.** Feed, chat, stories, search and profile reads are hot paths.
Watch for N+1 Prisma queries, unindexed filters, unbounded pagination and per-request work that
could be cached or queued. Do not micro-optimize cold paths.

**Consistency over novelty.** Follow the pattern the surrounding module already uses, even if you
would have chosen differently. Changing a pattern is a separate, argued decision — and if it is
durable, it becomes an ADR.

**Documentation is part of the change.** Behaviour or contract changes update the relevant document
in `circlesfera-documentation/`. Durable architectural choices become ADRs. Stale documentation is
a defect, because both humans and agents trust it.

**Say what you do not know.** Separate verified fact, reasonable inference, and proposal. Never
claim a check you did not run. Never claim alignment you did not verify.

## Anti-patterns that are already forbidden here

- Duplicating logic instead of extracting or reusing (`AGENTS.md`).
- Inventing models, endpoints, enums, relations, permissions or flows not backed by code or schema.
- Permanent mocks in production code.
- Cosmetic patches that hide an error rather than fix it.
- Unnecessary `any`, ignored TypeScript errors, ignored lint failures.
- Mass rewrites without justification.
- Touching secrets, deployment or destructive data operations without explicit confirmation.

## Changes that require explicit confirmation

Per `AGENTS.md`: database schema, public API contracts, auth/permissions/roles/monetization,
deleting code or endpoints, critical business logic, **new dependencies**, infrastructure/deploy/
secrets, and any destructive data operation. Propose, then wait.
