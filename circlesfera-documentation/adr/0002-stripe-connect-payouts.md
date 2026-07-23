# ADR-0002: Stripe Connect Express payouts only, no internal payout ledger

- **Status:** Accepted (current behavior, documented 2026-07-23)
- **Date:** 2026-07-23
- **Deciders:** CircleSfera engineering (remediation pass)

## Context

Creator monetization (tips, story/post unlocks, creator subscriptions) settles through Stripe Connect Express, using `stripeConnectAccountId` on `User` (`destination` charges — see `CreatorSubscriptionsService`, `MonetizationService`). An earlier iteration of the schema had a `PAYOUT` value in `TransactionType`, implying an internal payout ledger; it was removed (see `00-status.md`, migration `20260723020000_appeals_profile_embeddings_drop_payouts`).

Today, `MonetizationService`:
- `getConnectStatus` returns cached/live `transfersEnabled` / `chargesEnabled` flags for the creator's Connect account.
- `getDashboardLink` creates a Stripe **Express login link** so the creator lands directly on Stripe's own hosted dashboard.

There is no CircleSfera-side balance computation, no payout initiation endpoint, and no `Transaction` row of type `PAYOUT`.

## Decision

CircleSfera does not build or maintain an internal payout ledger or payout-initiation flow. Creator payouts are handled entirely by Stripe Connect Express:

- Stripe computes and pays out the creator's balance directly (per the Connect account's payout schedule/settings).
- CircleSfera's own UI is **read-only**: it may show Connect onboarding/capability status (`transfersEnabled`, `chargesEnabled`, `detailsSubmitted`) and link out to the Stripe Express dashboard for the creator to see their actual balance and payout history.
- CircleSfera does not reimplement balance math, payout scheduling, or a `PAYOUT` transaction type. `Transaction` continues to model money CircleSfera actually intermediates (unlocks, tips, subscriptions, promotions) — not money movement that happens entirely inside Stripe between the platform and the creator's bank account.

## Consequences

- Lower engineering/compliance surface: no reconciliation between an internal ledger and Stripe's real payout state, no risk of the two drifting.
- Creators depend on Stripe's own dashboard/emails for payout visibility; CircleSfera cannot yet show "next payout date" or historical payout amounts natively — only Connect capability flags and a dashboard link.
- If a native in-app balance/payout history view is wanted later, it should read from Stripe (`balance.retrieve`, `payouts.list` on the connected account) live or via webhook-synced read models — not reintroduce an independently-computed internal ledger.
