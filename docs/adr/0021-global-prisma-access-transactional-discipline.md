# ADR-0021: Global Prisma access without a repository layer — transactional and domain-access discipline

- **Status:** Accepted
- **Date:** 2026-09-24
- **Deciders:** CircleSfera engineering
- **Scope:** backend

## Context

`.ai/core/known-gaps.md` (B6) already states "No repository layer, no mappers, no domain event bus. Accepted
architecture. Listed so agents stop proposing layers" — but that line has no rationale and no rules attached,
just a prohibition. BE-005 (Notion — CircleSfera Architecture Refactoring Backlog) asks to close that gap:
"Prisma is global and valid for modular monolith; boundaries require explicit discipline," target state "Keep
Prisma; document transactional/domain access rules," acceptance criterion "No blanket repository pattern
introduced."

Verified current state (this ADR's originating audit):

- `PrismaModule` is registered globally and `PrismaService` is injected directly into nearly every domain
  service — there is no repository, DAO, or mapper layer anywhere in `src/` (`rg Repository` finds none).
- Despite that, the codebase already has a real, consistently-applied transactional discipline — it was
  simply never written down. 11 files use Prisma's `$transaction`, always for the same shape of problem: a
  write that touches more than one table where partial completion would leave visibly inconsistent state.
  Examples: `LiveService.completeGiftPayment` (`src/live/live.service.ts`) wraps `Transaction.create` +
  `LiveGift.update` (status → COMPLETED) + `Monetization.upsert` (atomic `increment` on
  `lifetimeEarningsCents`) in one transaction, guarded by an idempotency check (`existing.status ===
  'COMPLETED'`) before the transaction even starts; `MonetizationWebhookService` does the same for every
  checkout-session-completed branch (promotion, direct-post-unlock, etc.); `PostsService.createPost` wraps
  `Post.create` + `PostMedia.createMany` so a crash mid-creation cannot leave an orphaned post with partial
  media.
- Counters that could otherwise race (earnings, viewer counts) never use a read-compute-write pattern — they
  use Prisma's atomic `increment`/`decrement`, which needs no transaction because it is already atomic at the
  database level. `LiveRealtimeService.decrementViewerCount` (`src/socket/services/live-realtime.service.ts`)
  is a clean example: a conditional `updateMany({ where: { viewerCount: { gt: 0 } } })` floors at zero without
  ever reading first.
- There is no internal financial ledger to race on in the first place. Per ADR-0002, Stripe Connect Express is
  the sole source of truth for payout balances; CircleSfera stores `lifetimeEarningsCents` as a running total
  for display, never a balance it debits from. This sidesteps an entire class of read-then-write races other
  platforms have to solve with locking.
- External-trigger idempotency (Stripe webhook redelivery) is handled upstream of all of the above, not by
  the transaction itself: `PaymentsService` maintains a `WebhookEvent` table keyed by Stripe's `event.id` with
  compare-and-swap claim semantics (`updateMany` on `status`) before any handler runs, so duplicate delivery
  cannot invoke a completed-payment handler twice regardless of what that handler does internally.
- Not every multi-step write is transactional, and that is also deliberate, not an oversight. A follow/unfollow
  (`FollowsService.toggle`) does a single `Follow` create/delete and fires the paired notification via
  `EventEmitter2` (`notification.create`, per ADR-0019's closed list) — decoupled and eventually consistent by
  design, because a dropped notification is a degraded experience, not a correctness violation the way a
  dropped payment record would be.

## Decision

Keep Prisma as the sole, globally-injectable data-access layer. Do not introduce a repository/DAO/mapper
layer. Module boundaries are enforced by the NestJS module import graph and the `dependency-cruiser` lint
rules (`.dependency-cruiser.cjs`, FE-004), not by hiding Prisma behind an abstraction — any service may
inject `PrismaService` and query any table its module can reach.

Formalize the transactional/consistency discipline the codebase already follows, so it is a documented rule
future changes are checked against instead of an implicit pattern a new agent or contributor has to
reverse-engineer from examples:

1. **Wrap a write in `$transaction` when, and only when, partial completion would leave state another
   request could observe as inconsistent.** The test is not "does this touch more than one table" — it is
   "would a crash between these statements produce a state that is wrong, not just incomplete." A payment
   record without its corresponding earnings update is wrong. A post that exists before its media rows are
   attached is wrong. A stream that ends without its viewer-count reconciliation running is not wrong, just
   momentarily stale.
2. **Prefer an atomic Prisma primitive (`increment`, `decrement`, conditional `updateMany`, `upsert`) over a
   transaction wrapping a read-then-write.** Most counter/balance-shaped updates in this codebase need no
   transaction at all because the database-level atomic operation already removes the race. Reach for
   `$transaction` only when the write genuinely spans more than one row or table.
3. **Never build an internal balance/ledger that requires computing "current balance" from prior writes.**
   Per ADR-0002, Stripe Connect stays the authoritative balance; this codebase only ever writes
   monotonically-increasing running totals for display, never a debitable balance. If a future feature seems
   to need one, that is a new ADR, not a quiet addition.
4. **External-trigger handlers (webhooks) claim their idempotency key before doing any domain write, not
   after.** Follow `PaymentsService`'s `WebhookEvent` compare-and-swap pattern rather than relying on the
   domain write itself to be safely repeatable.
5. **Fan-out side effects that are not the source of truth for a state transition stay outside the
   transaction, via `EventEmitter2` per ADR-0019's closed categories** (notifications, realtime transport,
   cleanup fan-out) — never by widening a transaction to include a side effect that was never required to
   succeed atomically with the write that triggered it.
6. **Cross-domain reads and writes via direct `PrismaService` injection are expected and fine.** This is what
   "Prisma is global" means in practice — a service in one domain reading or writing another domain's tables
   directly is not a boundary violation by itself. The boundary that matters is the module import graph
   (`dependency-cruiser`'s `strict-common` and `no-circular` rules): a service should not need to reach into
   another domain's Prisma models to do work that domain's own service already exposes a method for, but
   there is no mechanical enforcement of that — it stays a code-review judgment call, same as it is today.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Introduce a repository/DAO layer over Prisma | Directly contradicts BE-005's acceptance criterion and the already-accepted B6 entry. Prisma's query builder already is the data-access abstraction; a repository layer here would duplicate it for no multi-datastore or swappable-ORM need this codebase has ever had, adding an indirection layer that only makes call sites harder to trace. |
| Leave the transactional discipline undocumented (status quo) | This is literally what BE-005 was opened to fix — the discipline exists and is followed correctly, but nothing records it, so it is a convention every future contributor has to reverse-engineer from examples rather than a checked rule. |
| Mandate `$transaction` for every multi-statement write | Would wrap already-atomic operations (`increment`, conditional `updateMany`) in unnecessary transactions and would pull best-effort fan-out (notifications) into the same failure domain as the write that triggers it, contradicting ADR-0019's explicit decision to keep those decoupled. |

## Consequences

**What this does not decide.** This ADR does not introduce enforcement — there is no lint rule that flags a
missing `$transaction` around a multi-table write, the same way there is no lint rule enforcing "call the
owning service instead of reaching across domains." Both remain code-review judgment calls, consistent with
how this codebase already operates.

**What this formalizes.** `.ai/core/known-gaps.md` B6 is updated to point here instead of standing as a bare
prohibition with no rationale. Future agents evaluating a new multi-step write have a documented decision
tree (rule 1–2 above) instead of having to infer the pattern from unrelated files.

## Implementation anchors

- `circlesfera-backend/src/prisma/prisma.module.ts` — global `PrismaModule` registration.
- `circlesfera-backend/src/live/live.service.ts:565` (`completeGiftPayment`) and
  `circlesfera-backend/src/monetization/monetization-webhook.service.ts` — the `$transaction` pattern for
  money-adjacent multi-table writes.
- `circlesfera-backend/src/socket/services/live-realtime.service.ts` (`decrementViewerCount`) — the atomic
  conditional-`updateMany` pattern in place of a transaction.
- `circlesfera-backend/src/payments/payments.service.ts` — the `WebhookEvent` claim-before-write idempotency
  pattern.
- `circlesfera-backend/.dependency-cruiser.cjs` — the actual enforced module-boundary rules.
