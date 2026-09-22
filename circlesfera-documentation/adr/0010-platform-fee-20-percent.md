# ADR-0010: 20% platform application fee on Connect charges

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** CircleSfera engineering / product

## Context

Creator monetization (tips, unlocks, creator subscriptions, live gifts) settles through Stripe Connect destination charges. The platform needs a transparent, consistent take-rate without a separate internal fee ledger product.

## Decision

Charge a **20% platform application fee** (`application_fee_amount`, typically `Math.floor(amountCents * 0.2)`) on Connect-mediated creator payments, including:

- Tips / unlocks / creator subscriptions
- Live gifts (`DIRECT_LIVE_GIFT`)

Payouts to creators remain Stripe Connect Express (no internal `PAYOUT` ledger — see ADR-0002). Changing the fee requires coordinated product, Stripe, and code updates — do not hardcode alternate rates per feature without an explicit decision.

## Consequences

- Predictable revenue share; creators see net after Stripe + platform fee.
- Fee logic is duplicated in several monetization/live paths — keep them aligned.
- Tax/invoicing presentation must not imply a different contractual rate than 20%.
