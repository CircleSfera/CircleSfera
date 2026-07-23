# ADR-0003: One active platform subscription plan per user

- **Status:** Accepted (current behavior, documented 2026-07-23)
- **Date:** 2026-07-23
- **Deciders:** CircleSfera engineering (remediation pass)

## Context

`PlatformSubscription` is unique on (`userId`, `planId`), which alone would still allow a user to hold **multiple different** active platform plans simultaneously (e.g. both "Verified" and "Elite Creator" active at once). `PaymentsService.createCheckout` (`circlesfera-backend/src/payments/payments.service.ts`) additionally enforces business-level exclusivity before creating a Stripe Checkout session:

```typescript
const activeStatuses: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
];
const activeSubs = user.platformSubscriptions.filter((s) =>
  activeStatuses.includes(s.status),
);

if (activeSubs.some((s) => s.planId === plan.id)) {
  throw new BadRequestException(
    'You already have an active subscription to this plan. Manage it in the billing portal.',
  );
}

if (activeSubs.length > 0) {
  throw new ConflictException(
    'You already have an active platform plan. Cancel or change it via the billing portal before starting another.',
  );
}
```

## Decision

A user may hold at most **one** `PlatformSubscription` in `ACTIVE` or `TRIALING` status at a time, across all `PlatformPlan`s. `createCheckout` rejects starting a new platform-plan checkout while any other plan is active/trialing (`409 Conflict`), and rejects re-subscribing to the exact same already-active plan (`400 Bad Request`). To change tiers, the user must cancel/downgrade the current plan via the billing portal before starting a new one.

This is enforced in application code (`PaymentsService`), not by a database constraint — the schema's uniqueness is only per (`userId`, `planId`), so this rule can be bypassed by any code path that creates `PlatformSubscription` rows directly without going through `PaymentsService.createCheckout` (e.g. manual admin fixes, future endpoints, seed/test scripts).

This is distinct from `CreatorSubscription` (creator-to-creator VIP subscriptions), which are not subject to this one-active-plan rule — a user can subscribe to multiple different creators concurrently.

## Consequences

- Simplifies billing UX and entitlement resolution (`UsersService` "highest active subscription tier" logic only ever has one active platform row to reason about in the common case).
- Any new code path that creates `PlatformSubscription` rows (admin tooling, scripts, future webhooks) must replicate or call into this same guard, or the invariant can silently be violated.
- If CircleSfera later wants stackable/composable platform add-ons instead of mutually exclusive tiers, this ADR should be revisited and the guard relaxed deliberately, not bypassed ad hoc.
