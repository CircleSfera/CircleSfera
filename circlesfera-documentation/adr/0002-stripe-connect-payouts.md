# ADR-0002: Stripe Connect Express payouts only, no internal payout ledger

- **Status:** Accepted (current behavior, documented 2026-07-23)
- **Date:** 2026-07-23
- **Deciders:** CircleSfera engineering (remediation pass)

## Context

Creator monetization (tips, story/post unlocks, creator subscriptions) settles through Stripe Connect Express, using `stripeConnectAccountId` on `User` (`destination` charges — see `CreatorSubscriptionsService`, `MonetizationService`). An earlier iteration of the schema had a `PAYOUT` value in `TransactionType`, implying an internal payout ledger; it was removed (see `00-status.md`, migration `20260723020000_appeals_profile_embeddings_drop_payouts`).

Today, `MonetizationService`:
- `getConnectStatus` returns cached/live `transfersEnabled` / `chargesEnabled` flags for the creator's Connect account.
- `getDashboardLink` creates a Stripe **Express login link** so the creator lands on Stripe's Express Dashboard.
- `getConnectPayoutsSummary` live-reads Stripe `balance.retrieve` and `payouts.list` (never `payouts.create`).

There is no CircleSfera-side balance computation, no payout initiation endpoint, and no `Transaction` row of type `PAYOUT`.

## Decision

CircleSfera does not build or maintain an internal payout ledger or payout-initiation flow. Creator payouts are handled entirely by Stripe Connect Express:

- Stripe computes and pays out the creator's balance directly (per the Connect account's payout schedule/settings).
- CircleSfera's own UI is **read-only**: Connect capability flags, live available/pending balances, and an Express Dashboard login link. It does not withdraw, schedule, or create payouts.
- CircleSfera does not reimplement balance math, payout scheduling, or a `PAYOUT` transaction type. `Transaction` continues to model money CircleSfera actually intermediates (unlocks, tips, subscriptions, promotions) — not money movement that happens entirely inside Stripe between the platform and the creator's bank account.

## Consequences

- Lower engineering/compliance surface: no reconciliation between an internal ledger and Stripe's real payout state, no risk of the two drifting.
- Creators still depend on Stripe for **initiating** a payout (automatic schedule by default; optional manual/instant from the Express Dashboard if Stripe enables those features). CircleSfera does not call `payouts.create`.
- In-app creator visibility is still partial: `GET /monetization/payouts` live-reads `balance.retrieve` + `payouts.list`; the Creator MonetizationDashboard shows available/pending balances only, not the payout list. Creators initiate payouts in the Express Dashboard.
- Admin `StripePayoutLog` is a copy of Connect `payout.created` / `payout.updated` / `payout.paid` / `payout.failed` / `payout.canceled` as Stripe sends them. Enable those event types on the Stripe webhook endpoint.
