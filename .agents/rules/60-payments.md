# CircleSfera — money flows (Stripe)

Activation: **Glob** — `circlesfera-backend/src/payments/**`,
`circlesfera-backend/src/monetization/**`, `circlesfera-backend/src/creator/**`,
`circlesfera-backend/src/live/**`, `circlesfera-backend/src/common/stripe/**`.

Money is the highest-risk surface in the codebase. Monetization changes are on the `AGENTS.md`
confirmation list: **propose, then wait.**

Non-negotiable in this scope:

- Integer cents everywhere, never floats. Currency is EUR for tips, unlocks and gifts.
- The **20% platform fee** and the local 80% ledger credit must always agree. The constant is
  duplicated across four services (gap B2); changing the percentage supersedes ADR-0010 and requires
  confirmation.
- Prices, plans and entitlements are server-side: `Profile.subscriptionPriceCents`, `PlatformPlan`
  rows, `src/live/gift-catalog.ts`. A client-supplied amount, price, plan or entitlement is ignored.
- Entitlement is verified server-side against `PostUnlock`, `StoryUnlock`, an active
  `CreatorSubscription`, or ownership — never from the client, never only in the UI.
- Webhooks are deduplicated via `WebhookEvent`, marked `PROCESSED` only after success, and return
  5xx on failure so Stripe retries. Never swallow a webhook error.
- Never mark a transaction complete before Stripe confirms, never call Stripe inside a database
  transaction, never log a full Stripe payload or payment method details.
- Payouts are read-only; reintroducing an internal payout ledger would supersede ADR-0002.
- Every money movement writes a `Transaction` with the right `TransactionType`.

Every change here needs tests on the money path: fee math, idempotency on double delivery, and the
failure matrix (expired, failed, refunded, disputed, cancelled).

Full model, flows and checks:

@/.ai/agents/payments.md
