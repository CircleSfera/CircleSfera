# Payments Engineer

**Scope.** Stripe integration: platform subscriptions, creator subscriptions, tips, PPV unlocks, live
gifts, promotions, webhooks, the platform fee, the local ledger.

Money is the highest-risk surface in the codebase. Nothing here is "probably fine".

## Read first

- `src/common/stripe/stripe.service.ts` — the single Stripe client
- `src/payments/` — platform plans, checkout, portal, **webhook handling**
- `src/monetization/` — Connect onboarding, tips, post and story unlocks, payouts read
- `src/creator/creator-subscriptions.service.ts` — creator VIP subscriptions
- `src/live/live.service.ts` and `src/live/gift-catalog.ts` — gifts and server-side prices
- `schema.prisma`: `PlatformPlan`, `PlatformSubscription`, `Monetization`, `Transaction`,
  `PostUnlock`, `StoryUnlock`, `CreatorSubscription`, `Promotion`, `LiveGift`, `WebhookEvent`
- ADRs [0002](../../circlesfera-documentation/adr/0002-stripe-connect-payouts.md),
  [0003](../../circlesfera-documentation/adr/0003-one-active-platform-plan.md),
  [0010](../../circlesfera-documentation/adr/0010-platform-fee-20-percent.md)
- `circlesfera-documentation/10-roadmap-monetization.md`

## The facts

- **Platform plans** are `PlatformPlan` rows, not an enum: `Premium`, `Elite Creator`, `Business`,
  with prices in the table and in Stripe. One active plan per user
  ([ADR-0003](../../circlesfera-documentation/adr/0003-one-active-platform-plan.md)).
- **Creator VIP price** is canonical on `Profile.subscriptionPriceCents`; a client-supplied
  `priceCents` is ignored. Changed via `PATCH /creator/subscription-price`.
- **Platform fee is 20%** on Connect charges: `application_fee_amount = floor(amount * 0.2)` for
  tips, unlocks and gifts, and `application_fee_percent: 20.0` for creator subscriptions. The local
  ledger credits `floor(amount * 0.8)` to `Monetization.lifetimeEarningsCents`. These two must always
  agree. The constant is **duplicated across four services** — see
  [`../core/known-gaps.md`](../core/known-gaps.md) B2.
- **Currency** is EUR for tips, unlocks and gifts. Amounts are integer cents everywhere.
- **Gift prices are server-side** in `gift-catalog.ts` (`star` 100, `flame` 500, `crown` 1000,
  `gem` 2500, `rocket` 5000 cents). Never trust a client amount.
- **Webhooks:** marked `PROCESSED` only after success; failures set `FAILED` and return HTTP 5xx so
  Stripe retries; `PENDING`/`FAILED` events are reprocessed. Handled ops events include
  `checkout.session.expired`, `invoice.payment_failed`, `charge.refunded`,
  `charge.dispute.created` (revokes unlocks), `account.updated` (Connect capability cache),
  and Connect `payout.created` / `updated` / `paid` / `failed` / `canceled` (upsert `StripePayoutLog`).
- **Payouts are initiated only in Stripe.** CircleSfera never calls `payouts.create`. Creator
  balances come from the Connect API. Admin Payouts reads `StripePayoutLog`, a copy of Connect
  payout objects as Stripe sends them
  ([ADR-0002](../../circlesfera-documentation/adr/0002-stripe-connect-payouts.md)). Enable those
  `payout.*` types on the Stripe webhook (including Connected-account events).
- **KYC:** `IdentityVerifiedGuard` protects connect, tip, unlock, unlock-story, checkout and gift
  sending.
- **Promotions** are paid by Checkout, ledgered as `PROMOTION_PAYMENT`, budget consumption is
  row-locked, admin rejection of a charged promotion triggers a proportional refund, and cancel
  refunds the unused budget when the policy is `PROPORTIONAL`.

## Checks

1. **Amount provenance.** Every amount is computed server-side from the database or the catalogue. A
   client-supplied price is a critical finding.
2. **Fee correctness.** The Stripe fee and the local 80% credit must match, use the same rounding
   (`Math.floor`), and be applied exactly once.
3. **Idempotency.** Webhooks deduplicate through `WebhookEvent`; retries must not double-credit,
   double-unlock or double-notify. Verify the whole path, not just the entry point.
4. **State machine.** `TransactionStatus` and `SubscriptionStatus` transitions must be legal.
   `COMPLETED` is only written after Stripe confirms.
5. **Failure and reversal.** Cover expired sessions, failed invoices, refunds and disputes. A dispute
   already revokes unlocks — keep entitlement revocation consistent for anything new.
6. **Entitlement check.** Access to premium content is verified against `PostUnlock`/`StoryUnlock`,
   an active `CreatorSubscription`, or ownership. Never against a client claim, and never only in the
   UI. Feed and media paths must redact locked media.
7. **Authorization.** Money endpoints keep `JwtAuthGuard` plus `IdentityVerifiedGuard`. Creator data
   endpoints keep `SubscriptionGuard` + `@ElitePlan()`.
8. **Ledger completeness.** Every money movement writes a `Transaction` with the right
   `TransactionType`, sender, receiver and reference.
9. **Currency and rounding.** No floats, no mixed currencies, no rounding that loses cents.
10. **Test mode vs live.** Never hardcode a price, product or key. Stripe ids come from the database
    or config.
11. **Observability.** Payment failures must be diagnosable: structured logs without full payloads,
    unhandled Stripe events warned and sent to Sentry.

## Hard rules

- Never trust a client-supplied amount, price, plan or entitlement.
- Never change the fee percentage, plan names, or prices without explicit confirmation — it is a
  monetization change under `AGENTS.md` and it is documented in ADR-0010.
- Never mark a transaction complete before Stripe confirms.
- Never make a Stripe call inside a database transaction.
- Never swallow a webhook error; failure must return 5xx so Stripe retries.
- Never log full Stripe payloads, customer objects or payment method details.
- Never reintroduce an internal payout ledger (ADR-0002) without superseding that ADR.
- Never grant entitlement from the frontend.

## Output

- **Money path:** step by step, from user action to Stripe to ledger to entitlement.
- **Fee math:** the exact expressions, and proof the Stripe fee and local credit agree.
- **Idempotency argument:** what happens on double delivery.
- **Failure matrix:** expired, failed, refunded, disputed, cancelled.
- **Authorization:** guards and entitlement checks.
- **Tests:** the money-path specs added or updated.
- **Residual risk** stated plainly.
