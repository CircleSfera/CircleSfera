# Monetization Strategy and Creator Economy

This document details the operational and technical strategy exclusively for CircleSfera's commercial layer. Monetization is backed by a robust **Stripe Connect** integration, enabling a secure, hybrid environment free of compliance issues.

---

## 1. Monetization: Tier Subscriptions and Pay-Per-View (PPV)

Having resolved compliance challenges through Stripe Connect integration, CircleSfera's monetization strategy consolidates into a hybrid, predictable, and transparent model.

### Model Characteristics
- **Platform / Creator Subscriptions:** Different levels (Tiers) that grant specific benefits.
- **Pay-Per-View (PPV):** Direct sale of individual content (e.g., private Stories or exclusive Posts) processed securely through Stripe Connect.
- **Badges:** Subscribers receive visible badges on their profiles and comments according to their subscription Tier, incentivizing social status.

### Access Rules and Compliance
- **One active plan at a time:** As dictated by the main PRD, a user may only have one Tier active at a time to prevent fraud or billing confusion.
- **PPV Availability (Lifetime Access vs Rental):** Define expiration policies for PPV. If a creator is banned or deletes the post, the platform must retain the locked content solely for existing buyers or issue automated refunds (*chargebacks*) to minimize Stripe disputes.
- **Traceability (Ledger):** All attempts, failures, charges, and payouts must be recorded in an auditable log.

---

## 2. Creator Onboarding and Payouts (Stripe Connect)

To receive money from Tiers and PPV, the creator becomes a seller (Connected Account).

- **KYC and Signup (Onboarding):** Mandatory flow via Stripe Express/Custom to verify the creator's identity before enabling Tiers or PPV.
- **Take Rate (Platform Commission):** Strict definition of commissions in Stripe's Application Fee (e.g., 15% for the platform, 85% for the creator).
- **Payouts:** Funds are transferred to the creator's Stripe balance. An automatic payment schedule will be enabled (e.g., monthly / 7-day rolling) or manual withdrawals under minimum thresholds, mitigating fraud risk from premature charges.

---

## 3. Creator Dashboard

The Dashboard is the primary operational tool for creators to convert audience into subscribers and buyers.

### Main Modules
- **Revenue Overview:** Monthly Recurring Revenue (MRR) from Tiers and cumulative total of one-time sales (PPV).
- **Audience & Tiers:** Geographic distribution, reach, followers gained, and subscriber retention by acquired badge.
- **Content Analytics:** Commercial conversion breakdown per piece: impressions, saves, conversion to follow, **and locked-post-to-purchase conversion (PPV)**.

---

## 4. Sponsored Placements

To drive organic creator growth without conflicting with algorithm-manipulation regulations, **Sponsored Placements** will be implemented (strictly avoiding the term "Boost Content").

### Native Advertising Flow (Creator to Platform)
Unlike Tiers/PPV (Fan-to-Creator), here the creator pays CircleSfera. Managed via a direct **Stripe PaymentIntent**:
1. The creator selects an already published post or frame.
2. Clicks **Promote** and defines a goal (Profile visits, Follows, Tier conversions).
3. Sets a daily budget and basic targeting (interests, country).
4. Payment is charged to the creator's card upfront (or held from their balance).
5. Ad metrics are consolidated in the Creator Dashboard.

> [!WARNING]
> To ensure commercial compliance, Sponsored Placements will be explicitly marked as "Sponsored" to users, ensuring full transparency.
